import { Router } from 'express';
import multer from 'multer';
import { withDb } from '../lib/mongo.js';
import { resolveSession, userHasApp } from './auth.js';
import {
  MAX_UPLOAD_BYTES,
  readAttachmentBuffer,
  openAttachmentStream,
  storePreconFile
} from '../lib/preconAttachments.js';
import { buildCommentEmailHtml, emailNotifyEnabled, sendPreconNotification } from '../lib/preconEmail.js';
import { buildNotifyRecipientGroups } from '../lib/preconNotify.js';
import { parseAssignees } from '../lib/preconAdmin.js';

export const preconstructionRouter = Router();
const APP_ID = 'preconstruction';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 12 }
});

async function requirePreconSession(db, req, res) {
  const sess = await resolveSession(db, req);
  if (!sess) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (!userHasApp(sess.user, APP_ID)) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return sess;
}

async function loadWorkspace(db) {
  const doc = await db.collection('app_states').findOne({ _id: APP_ID });
  const data = doc?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { projects: [], departments: [] };
  }
  return {
    projects: Array.isArray(data.projects) ? data.projects : [],
    departments: Array.isArray(data.departments) ? data.departments : []
  };
}

function collectProjectAssigneeNames(projects, projectId) {
  const names = new Set();
  const proj = (projects || []).find((p) => p.id === projectId);
  if (!proj) return [];
  (proj.phases || []).forEach((ph) => {
    (ph.tasks || []).forEach((t) => {
      parseAssignees(t.who).forEach((n) => names.add(n));
    });
  });
  return [...names];
}

preconstructionRouter.get(
  '/preconstruction-state',
  withDb(async (_req, res, db) => {
    try {
      const doc = await db.collection('app_states').findOne({ _id: APP_ID });
      if (!doc?.data) return res.status(404).json({ error: 'No saved PreConstruction workspace' });
      res.json({ data: doc.data, updatedAt: doc.updatedAt, version: doc.version || 1, appId: APP_ID });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

preconstructionRouter.put(
  '/preconstruction-state',
  withDb(async (req, res, db) => {
    try {
      const { data, expectedVersion, updatedBy } = req.body || {};
      if (data === undefined || data === null || (typeof data !== 'object' && typeof data !== 'string')) {
        return res.status(400).json({ error: 'body.data (object or JSON string) required' });
      }
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return res.status(400).json({ error: 'body.data must serialize to a JSON object' });
      }
      const states = db.collection('app_states');
      const existing = await states.findOne({ _id: APP_ID });
      const currentVersion = existing?.version || 0;
      if (expectedVersion !== undefined && Number(expectedVersion) !== currentVersion) {
        return res.status(409).json({
          error: 'Version conflict',
          appId: APP_ID,
          expectedVersion: Number(expectedVersion),
          currentVersion,
          updatedAt: existing?.updatedAt || null,
          updatedBy: existing?.updatedBy || null
        });
      }
      const now = new Date();
      const nextVersion = currentVersion + 1;
      await states.updateOne(
        { _id: APP_ID },
        {
          $set: {
            appId: APP_ID,
            data: payload,
            updatedAt: now,
            updatedBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system',
            version: nextVersion
          }
        },
        { upsert: true }
      );
      res.json({ ok: true, updatedAt: now, version: nextVersion, appId: APP_ID });
    } catch (e) {
      if (e instanceof SyntaxError) {
        return res.status(400).json({ error: 'Invalid JSON in body.data string' });
      }
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

preconstructionRouter.get(
  '/preconstruction/notify-recipients',
  withDb(async (req, res, db) => {
    const sess = await requirePreconSession(db, req, res);
    if (!sess) return;
    try {
      const projectId = String(req.query.projectId || '').trim();
      const { projects, departments } = await loadWorkspace(db);
      const assigneeNames = projectId ? collectProjectAssigneeNames(projects, projectId) : [];
      const groups = await buildNotifyRecipientGroups(db, { departments, assigneeNames });
      res.json({
        emailEnabled: emailNotifyEnabled(),
        groups
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

preconstructionRouter.post(
  '/preconstruction/attachments',
  withDb(async (req, res, db) => {
    const sess = await requirePreconSession(db, req, res);
    if (!sess) return;
    upload.array('files', 12)(req, res, async (multerErr) => {
      if (multerErr) {
        return res.status(400).json({ error: multerErr.message || 'Upload failed' });
      }
      try {
        const files = req.files || [];
        if (!files.length) return res.status(400).json({ error: 'No files uploaded' });

        let labels = [];
        try {
          labels = JSON.parse(req.body?.labels || '[]');
        } catch {
          labels = [];
        }
        const projectId = String(req.body?.projectId || '').trim();
        const taskId = String(req.body?.taskId || '').trim();
        const scope = String(req.body?.scope || 'comment').trim() || 'comment';
        const uploadedBy = sess.user.name || sess.user.email || 'User';

        const attachments = [];
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          const label =
            String(labels[i] || '').trim() ||
            String(req.body?.label || '').trim() ||
            f.originalname ||
            'Attachment';
          const row = await storePreconFile(db, {
            buffer: f.buffer,
            fileName: f.originalname || 'file',
            mimeType: f.mimetype || 'application/octet-stream',
            meta: { projectId, taskId, scope, label, uploadedBy }
          });
          attachments.push(row);
        }
        res.json({ ok: true, attachments });
      } catch (e) {
        res.status(400).json({ error: e?.message || String(e) });
      }
    });
  })
);

preconstructionRouter.get(
  '/preconstruction/attachments/:id',
  withDb(async (req, res, db) => {
    const sess = await requirePreconSession(db, req, res);
    if (!sess) return;
    try {
      const opened = await openAttachmentStream(db, req.params.id);
      if (!opened) return res.status(404).json({ error: 'Attachment not found' });
      res.setHeader('Content-Type', opened.meta.mimeType || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(opened.meta.fileName || 'file')}"`
      );
      opened.stream.pipe(res);
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

preconstructionRouter.post(
  '/preconstruction/notify-comment',
  withDb(async (req, res, db) => {
    const sess = await requirePreconSession(db, req, res);
    if (!sess) return;
    try {
      const body = req.body || {};
      const recipients = Array.isArray(body.recipients) ? body.recipients : [];
      const emails = recipients
        .map((r) => String(r.email || '').trim().toLowerCase())
        .filter((e) => e.includes('@'));
      const attachmentIds = [
        ...(Array.isArray(body.attachmentIds) ? body.attachmentIds : []),
        ...(Array.isArray(body.taskAttachmentIds) ? body.taskAttachmentIds : [])
      ];

      const emailFiles = [];
      const labels = [];
      for (const id of attachmentIds) {
        const loaded = await readAttachmentBuffer(db, id);
        if (!loaded) continue;
        labels.push(loaded.meta.label || loaded.meta.fileName);
        emailFiles.push({
          filename: loaded.meta.label || loaded.meta.fileName,
          content: loaded.buffer,
          contentType: loaded.meta.mimeType
        });
      }

      const html = buildCommentEmailHtml({
        projectName: body.projectName,
        phaseName: body.phaseName,
        taskName: body.taskName,
        author: body.author || sess.user.name,
        text: body.text,
        nextAction: body.nextAction,
        nextActionDate: body.nextActionDate,
        attachmentLabels: labels
      });

      const subject = `[PreConstruction] ${body.projectName || 'Project'} — ${body.taskName || 'Activity update'}`;

      const result = await sendPreconNotification({
        to: emails,
        subject,
        text: `${body.text || ''}\n\nNext: ${body.nextAction || '—'} (${body.nextActionDate || '—'})`,
        html,
        attachments: emailFiles
      });

      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);
