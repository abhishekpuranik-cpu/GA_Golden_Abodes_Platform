/**
 * Reverse geocode for V3 DD Engine.
 * Primary: Nominatim/OSM (no API key). Google kept behind V3_DD_GEOCODER=google (disabled by default).
 * Cache keyed on coords rounded to 5 dp. 30-day TTL on cache only — never on dd_facts / register.
 */
import crypto from 'crypto';

export const V3_DD_GEOCODE_CACHE = 'v3_dd_geocode_cache';

const GEOCODE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** ~1 m at equator */
export function roundCoord5(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.round(x * 1e5) / 1e5;
}

export function geocodeCacheKey(lat, lng) {
  const a = roundCoord5(lat);
  const b = roundCoord5(lng);
  if (a == null || b == null) return null;
  return `${a.toFixed(5)},${b.toFixed(5)}`;
}

function geocoderProvider() {
  const raw = String(process.env.V3_DD_GEOCODER || 'nominatim').trim().toLowerCase();
  return raw === 'google' ? 'google' : 'nominatim';
}

function nominatimUserAgent() {
  const custom = String(process.env.NOMINATIM_USER_AGENT || '').trim();
  if (custom) return custom;
  const email = String(process.env.NOMINATIM_CONTACT_EMAIL || 'notifications@goldenabodes.com').trim();
  return `GoldenAbodes-V3DD/1.0 (${email})`;
}

function pickComponent(components, types) {
  const list = Array.isArray(components) ? components : [];
  for (const want of types) {
    const hit = list.find((c) => Array.isArray(c.types) && c.types.includes(want));
    if (hit?.long_name) return String(hit.long_name);
  }
  return '';
}

export function parseGoogleGeocodeResult(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const first = results[0];
  if (!first) {
    return { village: '', taluka: '', district: '', state: '', formatted: '', status: payload?.status || 'ZERO_RESULTS' };
  }
  const c = first.address_components || [];
  return {
    village:
      pickComponent(c, ['locality', 'sublocality', 'sublocality_level_1', 'neighborhood', 'village']) ||
      pickComponent(c, ['administrative_area_level_4', 'administrative_area_level_3']),
    taluka: pickComponent(c, ['administrative_area_level_3', 'administrative_area_level_4']),
    district: pickComponent(c, ['administrative_area_level_2']),
    state: pickComponent(c, ['administrative_area_level_1']),
    formatted: String(first.formatted_address || ''),
    status: payload?.status || 'OK'
  };
}

/** Nominatim address → GA village/taluka/district/state. Never invents nearby places. */
export function parseNominatimResult(payload) {
  const addr = payload?.address || {};
  const village =
    addr.village ||
    addr.hamlet ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.locality ||
    addr.town ||
    addr.city_district ||
    '';
  const taluka =
    addr.taluka ||
    addr.county ||
    addr.municipality ||
    addr.city ||
    addr.town ||
    '';
  const district = addr.state_district || addr.district || addr.county || '';
  const state = addr.state || '';
  const formatted = String(payload?.display_name || '');
  return {
    village: String(village || ''),
    taluka: String(taluka || ''),
    district: String(district || ''),
    state: String(state || ''),
    formatted,
    status: village ? 'OK' : 'ZERO_RESULTS'
  };
}

export async function ensureGeocodeCacheIndexes(db) {
  const col = db.collection(V3_DD_GEOCODE_CACHE);
  await col.createIndex({ updatedAt: -1 });
  // 30-day TTL on cache docs only (facts / authority_register are separate collections)
  try {
    await col.createIndex({ updatedAt: 1 }, { expireAfterSeconds: GEOCODE_TTL_SECONDS, name: 'geocode_ttl_30d' });
  } catch (e) {
    // Index options conflict if an older index exists without TTL — log and continue
    console.warn('[v3-dd] geocode TTL index:', e?.message || e);
  }
}

function cacheHitToResult(cached, key) {
  return {
    ok: true,
    cached: true,
    village: cached.village || '',
    taluka: cached.taluka || '',
    district: cached.district || '',
    state: cached.state || '',
    formatted: cached.formatted || '',
    provider: cached.provider || 'unknown',
    cacheKey: key
  };
}

async function writeCache(db, key, lat, lng, parsed, provider) {
  const doc = {
    _id: key,
    ok: true,
    lat: roundCoord5(lat),
    lng: roundCoord5(lng),
    village: parsed.village,
    taluka: parsed.taluka,
    district: parsed.district,
    state: parsed.state,
    formatted: parsed.formatted,
    provider,
    updatedAt: new Date()
  };
  await db.collection(V3_DD_GEOCODE_CACHE).updateOne({ _id: key }, { $set: doc }, { upsert: true });
  return {
    ok: true,
    cached: false,
    village: parsed.village,
    taluka: parsed.taluka,
    district: parsed.district,
    state: parsed.state,
    formatted: parsed.formatted,
    provider,
    cacheKey: key
  };
}

async function reverseGeocodeNominatim(db, lat, lng, key) {
  // Global 1 req/sec for Nominatim usage policy
  await waitNominatimSlot();

  const url =
    'https://nominatim.openstreetmap.org/reverse?' +
    new URLSearchParams({
      lat: String(roundCoord5(lat)),
      lon: String(roundCoord5(lng)),
      format: 'jsonv2',
      addressdetails: '1',
      zoom: '18'
    }).toString();

  let r;
  try {
    r = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': nominatimUserAgent(),
        Accept: 'application/json'
      }
    });
  } catch (e) {
    return { ok: false, error: `Nominatim unreachable: ${e?.message || e}`, cacheKey: key };
  }
  if (!r.ok) {
    return { ok: false, error: `Nominatim HTTP ${r.status}`, cacheKey: key };
  }
  const payload = await r.json();
  const parsed = parseNominatimResult(payload);
  if (!parsed.village) {
    // Unreachable/empty village → UNKNOWN path for Stage 1; do not guess
    return {
      ok: false,
      error: 'No village in Nominatim response',
      empty: true,
      cacheKey: key,
      formatted: parsed.formatted || ''
    };
  }
  return writeCache(db, key, lat, lng, parsed, 'nominatim');
}

async function reverseGeocodeGoogle(db, lat, lng, key) {
  const apiKey = String(process.env.GOOGLE_GEOCODING_API_KEY || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      unavailable: true,
      error: 'Geocoding unavailable',
      cacheKey: key
    };
  }

  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?' +
    new URLSearchParams({
      latlng: `${roundCoord5(lat)},${roundCoord5(lng)}`,
      key: apiKey,
      language: 'en',
      result_type: 'locality|administrative_area_level_3|administrative_area_level_2|administrative_area_level_1'
    }).toString();

  const r = await fetch(url, { method: 'GET' });
  if (!r.ok) {
    return { ok: false, error: `Geocoding HTTP ${r.status}`, cacheKey: key };
  }
  const payload = await r.json();
  if (payload.status && payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') {
    return { ok: false, error: `Geocoding status ${payload.status}`, cacheKey: key };
  }

  const parsed = parseGoogleGeocodeResult(payload);
  if (!parsed.village) {
    return { ok: false, error: 'No village in Google response', empty: true, cacheKey: key };
  }
  return writeCache(db, key, lat, lng, parsed, 'google');
}

/**
 * @returns {{
 *   ok: boolean,
 *   unavailable?: boolean,
 *   empty?: boolean,
 *   cached?: boolean,
 *   village?: string,
 *   taluka?: string,
 *   district?: string,
 *   state?: string,
 *   formatted?: string,
 *   provider?: string,
 *   cacheKey?: string,
 *   error?: string
 * }}
 */
export async function reverseGeocode(db, lat, lng) {
  const key = geocodeCacheKey(lat, lng);
  if (!key) return { ok: false, error: 'Invalid coordinates' };

  const cached = await db.collection(V3_DD_GEOCODE_CACHE).findOne({ _id: key });
  if (cached && cached.ok && cached.village) {
    return cacheHitToResult(cached, key);
  }

  const provider = geocoderProvider();
  if (provider === 'google') {
    return reverseGeocodeGoogle(db, lat, lng, key);
  }
  return reverseGeocodeNominatim(db, lat, lng, key);
}

/** Global Nominatim throttle: max 1 request per second. */
let _nominatimLastAt = 0;
let _nominatimChain = Promise.resolve();

function waitNominatimSlot() {
  _nominatimChain = _nominatimChain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, 1000 - (now - _nominatimLastAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    _nominatimLastAt = Date.now();
  });
  return _nominatimChain;
}

/** Per-session rate limit (in-memory) — complements global Nominatim 1/s. */
const geoBuckets = new Map();

export function allowGeocodeRequest(sessionKey, { windowMs = 60_000, max = 20 } = {}) {
  const key = String(sessionKey || 'anon');
  const now = Date.now();
  let b = geoBuckets.get(key);
  if (!b || now - b.start > windowMs) {
    b = { start: now, count: 0 };
    geoBuckets.set(key, b);
  }
  b.count += 1;
  if (b.count > max) {
    return { ok: false, retryAfterSeconds: Math.ceil((windowMs - (now - b.start)) / 1000) };
  }
  return { ok: true };
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}
