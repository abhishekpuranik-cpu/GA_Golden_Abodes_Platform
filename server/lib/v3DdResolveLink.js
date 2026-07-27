/**
 * Resolve Google Maps short links — platform server only.
 * SSRF-hardened: domain allowlist, hop cap, timeout, private IP rejection.
 */
import dns from 'dns/promises';
import net from 'net';
import { URL } from 'url';

const ALLOWED_HOSTS = new Set([
  'goo.gl',
  'maps.app.goo.gl',
  'google.com',
  'www.google.com',
  'google.co.in',
  'www.google.co.in',
  'maps.google.com',
  'www.maps.google.com'
]);

const MAX_HOPS = 3;
const TIMEOUT_MS = 5000;

function hostAllowed(hostname) {
  const h = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!h) return false;
  if (ALLOWED_HOSTS.has(h)) return true;
  if (h.endsWith('.google.com') || h.endsWith('.google.co.in')) return true;
  return false;
}

export function isPrivateOrLocalIp(ip) {
  const s = String(ip || '').trim();
  if (!s) return true;
  if (net.isIPv4(s)) {
    const parts = s.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  if (net.isIPv6(s)) {
    const lower = s.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    if (lower.startsWith('fe80')) return true;
    if (lower.startsWith('::ffff:')) {
      const v4 = lower.slice(7);
      return isPrivateOrLocalIp(v4);
    }
    return false;
  }
  return true;
}

async function assertPublicHostname(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!hostAllowed(h)) {
    const err = new Error(`Host not allowlisted: ${h}`);
    err.code = 'PIN_UNRESOLVED';
    throw err;
  }
  let addrs;
  try {
    addrs = await dns.lookup(h, { all: true, verbatim: true });
  } catch {
    const err = new Error(`DNS lookup failed for ${h}`);
    err.code = 'PIN_UNRESOLVED';
    throw err;
  }
  if (!addrs?.length) {
    const err = new Error(`No DNS records for ${h}`);
    err.code = 'PIN_UNRESOLVED';
    throw err;
  }
  for (const a of addrs) {
    if (isPrivateOrLocalIp(a.address)) {
      const err = new Error(`Refusing private/loopback address for ${h}`);
      err.code = 'PIN_UNRESOLVED';
      throw err;
    }
  }
}

function normalizeStartUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) {
    const err = new Error('Empty URL');
    err.code = 'PIN_UNRESOLVED';
    throw err;
  }
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    const err = new Error('Invalid URL');
    err.code = 'PIN_UNRESOLVED';
    throw err;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    const err = new Error('Only http(s) allowed');
    err.code = 'PIN_UNRESOLVED';
    throw err;
  }
  return u;
}

/**
 * Follow redirects manually with SSRF checks.
 * @returns {{ ok: true, finalUrl: string } | { ok: false, code: 'PIN_UNRESOLVED', error: string }}
 */
export async function resolveMapsShortLink(rawUrl) {
  try {
    let current = normalizeStartUrl(rawUrl);
    await assertPublicHostname(current.hostname);

    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res;
      try {
        res = await fetch(current.toString(), {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': 'GoldenAbodes-V3DD/1.0',
            Accept: 'text/html,application/xhtml+xml'
          }
        });
      } catch (e) {
        clearTimeout(timer);
        return {
          ok: false,
          code: 'PIN_UNRESOLVED',
          error: e?.name === 'AbortError' ? 'Resolve timed out' : e?.message || 'Resolve failed'
        };
      }
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) {
          return { ok: false, code: 'PIN_UNRESOLVED', error: 'Redirect missing Location' };
        }
        let next;
        try {
          next = new URL(loc, current);
        } catch {
          return { ok: false, code: 'PIN_UNRESOLVED', error: 'Invalid redirect URL' };
        }
        if (next.protocol !== 'http:' && next.protocol !== 'https:') {
          return { ok: false, code: 'PIN_UNRESOLVED', error: 'Redirect protocol rejected' };
        }
        await assertPublicHostname(next.hostname);
        current = next;
        if (hop === MAX_HOPS) {
          return { ok: false, code: 'PIN_UNRESOLVED', error: 'Too many redirects' };
        }
        continue;
      }

      // Landed
      return { ok: true, finalUrl: current.toString() };
    }

    return { ok: false, code: 'PIN_UNRESOLVED', error: 'Too many redirects' };
  } catch (e) {
    return {
      ok: false,
      code: e?.code || 'PIN_UNRESOLVED',
      error: e?.message || 'Resolve failed'
    };
  }
}

/**
 * Extract lat/lng from a (possibly resolved) Google Maps URL or plain text.
 * Shared shapes with client parser — keep in sync.
 */
export function extractCoordsFromText(text) {
  const s = String(text || '').trim();
  if (!s) return null;

  let m = s.match(/@(-?\d+\.?\d*),\s*(-?\d+\.?\d*)(?:,\d+\.?\d*z)?/i);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  m = s.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  m = s.match(/[?&](?:q|ll|query)=(-?\d+\.?\d*),\s*(-?\d+\.?\d*)/i);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  m = s.match(/^(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

  // DMS: 18°44'53.5"N 73°24'07.6"E
  m = s.match(
    /(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)["″]?\s*([NSns])\s+(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)["″]?\s*([EWew])/
  );
  if (m) {
    const toDec = (d, min, sec, hemi) => {
      let v = parseFloat(d) + parseFloat(min) / 60 + parseFloat(sec) / 3600;
      if (/[SWsw]/.test(hemi)) v = -v;
      return v;
    };
    return {
      lat: toDec(m[1], m[2], m[3], m[4]),
      lng: toDec(m[5], m[6], m[7], m[8])
    };
  }

  return null;
}
