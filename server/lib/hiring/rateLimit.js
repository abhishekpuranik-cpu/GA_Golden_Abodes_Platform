const buckets = new Map();
const CLEANUP_INTERVAL_MS = 5 * 60_000;

/** Drop stale buckets so the map stays bounded in long-running processes. */
function pruneBuckets(windowMs) {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > windowMs * 2) buckets.delete(key);
  }
}

setInterval(() => pruneBuckets(10 * 60_000), CLEANUP_INTERVAL_MS).unref();

export function hiringUserKey(req) {
  return String(req.hiringUser?.id || req.ip || 'anon');
}

export function createRateLimiter({ windowMs = 60_000, max = 120, keyFn = hiringUserKey }) {
  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn(req) || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retrySec = Math.ceil((windowMs - (now - bucket.start)) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retrySec)));
      return res.status(429).json({
        error: 'Too many requests — try again shortly',
        retryAfterSeconds: Math.max(1, retrySec)
      });
    }
    return next();
  };
}

/** Generous global limits — keyed per user, not shared across the whole office IP. */
export const hiringReadLimiter = createRateLimiter({ max: 400, keyFn: hiringUserKey });
export const hiringWriteLimiter = createRateLimiter({ max: 250, keyFn: hiringUserKey });
export const hiringImportLimiter = createRateLimiter({
  max: 20,
  windowMs: 60_000,
  keyFn: (req) => `import:${hiringUserKey(req)}`
});

/** Metaview: per-requisition buckets so one job never blocks another. */
export const metaviewSourceLimiter = createRateLimiter({
  windowMs: 3 * 60_000,
  max: 3,
  keyFn: (req) => `mv-source:${req.params.id}`
});

export const metaviewSyncLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  keyFn: (req) => `mv-sync:${req.params.id}`
});
