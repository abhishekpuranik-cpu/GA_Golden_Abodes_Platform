const store = new Map();
const MAX_ENTRIES = 256;

export function cacheKeyFromQuery(query = {}) {
  return JSON.stringify(query);
}

export function readHttpCache(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.exp <= Date.now()) {
    store.delete(key);
    return null;
  }
  return hit.data;
}

export function writeHttpCache(key, data, ttlMs = 60_000) {
  store.set(key, { data, exp: Date.now() + ttlMs });
  if (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

export function invalidateHttpCache(prefix = '') {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}
