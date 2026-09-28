import zlib from 'node:zlib';

const GZIP_JSON_MIN_BYTES = 4096;

/**
 * Send JSON, gzipped when the client accepts it and the payload is large.
 * Reverse proxies typically skip already-encoded bodies.
 */
export function sendJsonMaybeGzip(req, res, obj, extraHeaders = {}) {
  let json;
  try {
    json = JSON.stringify(obj);
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
  Object.entries(extraHeaders).forEach(([k, v]) => {
    if (v != null) res.setHeader(k, v);
  });
  const accept = String(req.headers['accept-encoding'] || '');
  if (json.length >= GZIP_JSON_MIN_BYTES && /\bgzip\b/i.test(accept)) {
    try {
      const gz = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: zlib.constants.Z_BEST_SPEED });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      return res.send(gz);
    } catch (_) {
      /* fall through to plain JSON */
    }
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.send(json);
}
