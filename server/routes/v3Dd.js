/**
 * Project Acquisition V3 — DD evidence upload/download.
 * Auth: session + v3_project_acquisition. No signed public links.
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
