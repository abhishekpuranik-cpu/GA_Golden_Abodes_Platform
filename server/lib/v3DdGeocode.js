/**
 * Reverse geocode via Google Geocoding API — server-side only.
 * Cache on rounded coords (5 dp). Never expose GOOGLE_GEOCODING_API_KEY to clients.
 */
import crypto from 'crypto';

export const V3_DD_GEOCODE_CACHE = 'v3_dd_geocode_cache';

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

export async function ensureGeocodeCacheIndexes(db) {
  await db.collection(V3_DD_GEOCODE_CACHE).createIndex({ updatedAt: -1 });
}

/**
 * @returns {{
 *   ok: boolean,
 *   unavailable?: boolean,
 *   cached?: boolean,
 *   village?: string,
 *   taluka?: string,
 *   district?: string,
 *   state?: string,
 *   formatted?: string,
 *   cacheKey?: string,
 *   error?: string
 * }}
 */
export async function reverseGeocode(db, lat, lng) {
  const key = geocodeCacheKey(lat, lng);
  if (!key) return { ok: false, error: 'Invalid coordinates' };

  const cached = await db.collection(V3_DD_GEOCODE_CACHE).findOne({ _id: key });
  if (cached && cached.ok) {
    return {
      ok: true,
      cached: true,
      village: cached.village || '',
      taluka: cached.taluka || '',
      district: cached.district || '',
      state: cached.state || '',
      formatted: cached.formatted || '',
      cacheKey: key
    };
  }

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
    provider: 'google',
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
    cacheKey: key
  };
}

/** Simple per-session rate limit (in-memory). */
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
