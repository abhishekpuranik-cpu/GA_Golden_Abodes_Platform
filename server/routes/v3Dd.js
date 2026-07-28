/**
 * Project Acquisition V3 — DD evidence upload/download + geocode + link resolve.
 * Auth: session + v3_project_acquisition. No signed public links. No API keys to client.
 */
import { Router } from 'express';
import multer from 'multer';
import { withDb } from '../lib/mongo.js';
import { resolveSession, userHasApp } from './auth.js';
import {
  MAX_BYTES_PROFESSIONAL,
  ensureV3DdFileIndexes,
  getV3DdFileMeta,
  openV3DdFileStream,
  storeV3DdFile
} from '../lib/v3DdFiles.js';
import {
  allowGeocodeRequest,
  ensureGeocodeCacheIndexes,
  reverseGeocode
} from '../lib/v3DdGeocode.js';
import { extractCoordsFromText, resolveMapsShortLink } from '../lib/v3DdResolveLink.js';

export const v3DdRouter = Router();

const APP_ID = 'v3_project_acquisition';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES_PROFESSIONAL, files: 1 }
});

async function requireV3DdSession(db, req, res) {
  const sess = await resolveSession(db, req);
  if (!sess?.user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (!userHasApp(sess.user, APP_ID)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return sess;
}

let indexesReady = false;
async function ensureIndexesOnce(db) {
  if (indexesReady) return;
  try {
    await ensureV3DdFileIndexes(db);
    await ensureGeocodeCacheIndexes(db);
    indexesReady = true;
  } catch (e) {
    console.warn('[v3-dd] index ensure failed:', e?.message || e);
  }
}

v3DdRouter.post(
  '/v3-dd/files',
  withDb(async (req, res, db) => {
    const sess = await requireV3DdSession(db, req, res);
    if (!sess) return;

    upload.single('file')(req, res, async (multerErr) => {
      if (multerErr) {
        return res.status(400).json({ error: multerErr.message || 'Upload failed' });
      }
      try {
        await ensureIndexesOnce(db);
        const f = req.file;
        if (!f?.buffer?.length) {
          return res.status(400).json({ error: 'No file uploaded (field: file)' });
        }
        const sourceType = String(req.body?.sourceType || req.body?.source_type || '').trim();
        const uploadedBy = sess.user.name || sess.user.email || sess.user.id || 'User';
        const result = await storeV3DdFile(db, {
          buffer: f.buffer,
          fileName: f.originalname || 'file',
          sourceType,
          meta: {
            projectId: String(req.body?.projectId || req.body?.project_id || '').trim(),
            runId: String(req.body?.runId || req.body?.run_id || '').trim(),
            stageKey: String(req.body?.stageKey || req.body?.stage_key || '').trim(),
            uploadedBy
          }
        });
        res.json({ ok: true, file: result });
      } catch (e) {
        res.status(400).json({ error: e?.message || String(e) });
      }
    });
  })
);

v3DdRouter.get(
  '/v3-dd/files/:id',
  withDb(async (req, res, db) => {
    const sess = await requireV3DdSession(db, req, res);
    if (!sess) return;
    try {
      const opened = await openV3DdFileStream(db, req.params.id);
      if (!opened) return res.status(404).json({ error: 'File not found' });
      const fileName = opened.meta.fileName || 'file';
      res.setHeader('Content-Type', opened.meta.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(fileName)}"`
      );
      res.setHeader('Cache-Control', 'private, no-store');
      opened.stream.pipe(res);
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

v3DdRouter.get(
  '/v3-dd/files/:id/meta',
  withDb(async (req, res, db) => {
    const sess = await requireV3DdSession(db, req, res);
    if (!sess) return;
    try {
      const meta = await getV3DdFileMeta(db, req.params.id);
      if (!meta) return res.status(404).json({ error: 'File not found' });
      res.json({
        ok: true,
        file: {
          id: meta._id,
          fileName: meta.fileName,
          mimeType: meta.mimeType,
          size: meta.size,
          sha256: meta.sha256,
          projectId: meta.projectId,
          runId: meta.runId,
          stageKey: meta.stageKey,
          sourceType: meta.sourceType,
          uploadedBy: meta.uploadedBy,
          uploadedOn: meta.uploadedOn
        }
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

v3DdRouter.post(
  '/v3-dd/geocode',
  withDb(async (req, res, db) => {
    const sess = await requireV3DdSession(db, req, res);
    if (!sess) return;
    try {
      await ensureIndexesOnce(db);
      const sessionKey = sess.sid || sess.user.id || 'anon';
      const rl = allowGeocodeRequest(sessionKey);
      if (!rl.ok) {
        res.setHeader('Retry-After', String(Math.max(1, rl.retryAfterSeconds || 60)));
        return res.status(429).json({
          error: 'Geocode rate limit exceeded',
          retryAfterSeconds: rl.retryAfterSeconds
        });
      }
      const lat = Number(req.body?.lat);
      const lng = Number(req.body?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'lat and lng required' });
      }
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return res.status(400).json({ error: 'lat/lng out of range' });
      }
      const result = await reverseGeocode(db, lat, lng);
      if (result.unavailable) {
        return res.json({
          ok: false,
          unavailable: true,
          error: 'Geocoding unavailable',
          cacheKey: result.cacheKey || null,
          provider: result.provider || null
        });
      }
      if (!result.ok) {
        // Empty / unreachable → Stage 1 UNKNOWN; do not guess nearby places
        return res.json({
          ok: false,
          empty: !!result.empty,
          error: result.error || 'Geocode failed',
          cacheKey: result.cacheKey || null,
          formatted: result.formatted || '',
          provider: result.provider || null
        });
      }
      res.json({
        ok: true,
        cached: !!result.cached,
        village: result.village || '',
        taluka: result.taluka || '',
        district: result.district || '',
        state: result.state || '',
        formatted: result.formatted || '',
        cacheKey: result.cacheKey || null,
        provider: result.provider || null
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

v3DdRouter.post(
  '/v3-dd/resolve-link',
  withDb(async (req, res, db) => {
    const sess = await requireV3DdSession(db, req, res);
    if (!sess) return;
    try {
      const sessionKey = `resolve:${sess.sid || sess.user.id || 'anon'}`;
      const rl = allowGeocodeRequest(sessionKey, { windowMs: 60_000, max: 30 });
      if (!rl.ok) {
        res.setHeader('Retry-After', String(Math.max(1, rl.retryAfterSeconds || 60)));
        return res.status(429).json({
          error: 'Resolve rate limit exceeded',
          retryAfterSeconds: rl.retryAfterSeconds
        });
      }
      const raw = String(req.body?.url || req.body?.link || '').trim();
      if (!raw) return res.status(400).json({ ok: false, code: 'PIN_UNRESOLVED', error: 'url required' });

      const direct = extractCoordsFromText(raw);
      if (direct && Number.isFinite(direct.lat) && Number.isFinite(direct.lng)) {
        return res.json({
          ok: true,
          lat: direct.lat,
          lng: direct.lng,
          finalUrl: raw,
          resolved: false
        });
      }

      const resolved = await resolveMapsShortLink(raw);
      if (!resolved.ok) {
        return res.json({
          ok: false,
          code: 'PIN_UNRESOLVED',
          error: resolved.error || 'Could not resolve link'
        });
      }
      const coords = extractCoordsFromText(resolved.finalUrl);
      if (!coords) {
        return res.json({
          ok: false,
          code: 'PIN_UNRESOLVED',
          error: 'Resolved URL had no coordinates',
          finalUrl: resolved.finalUrl
        });
      }
      res.json({
        ok: true,
        lat: coords.lat,
        lng: coords.lng,
        finalUrl: resolved.finalUrl,
        resolved: true
      });
    } catch (e) {
      res.status(500).json({ ok: false, code: 'PIN_UNRESOLVED', error: e?.message || String(e) });
    }
  })
);
