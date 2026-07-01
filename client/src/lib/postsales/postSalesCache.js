const store = new Map();

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function cacheKey(parts) {
  return parts.filter((p) => p != null && p !== '').join(':');
}

export function getCached(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    store.delete(key);
    return null;
  }
  return hit.data;
}

export function setCached(key, data, ttlMs = DEFAULT_TTL_MS) {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export function invalidatePostSalesCache(prefix = '') {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Dedupe in-flight requests and cache successful responses. */
export async function cachedFetch(key, fetcher, ttlMs = DEFAULT_TTL_MS) {
  const hit = getCached(key);
  if (hit != null) return hit;

  if (cachedFetch._inflight.has(key)) {
    return cachedFetch._inflight.get(key);
  }

  const promise = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      setCached(key, data, ttlMs);
      return data;
    })
    .finally(() => {
      cachedFetch._inflight.delete(key);
    });

  cachedFetch._inflight.set(key, promise);
  return promise;
}

cachedFetch._inflight = new Map();
