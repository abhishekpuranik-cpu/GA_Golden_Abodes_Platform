import { Router } from 'express';
import multer from 'multer';
import { withDb } from '../lib/mongo.js';
import {
  mergePreconstructionState,
  repairPreconstructionForRead
} from '../lib/preconstructionMerge.js';
import { resolveSession, userHasApp } from './auth.js';
import {
  MAX_UPLOAD_BYTES,
  readAttachmentBuffer,
  getAttachmentMeta,
  openAttachmentStream,
  storePreconFile
} from '../lib/preconAttachments.js';
import { emailNotifyEnabled, getEmailConfig, sendPreconNotification } from '../lib/preconEmail.js';
import { buildPreconNotifyBody, buildPreconNotifyEmailHtml } from '../lib/preconNotifyContent.js';
import {
  createNotifyJobId,
  deliverPreconNotification,
  finishNotifyJob,
  getNotifyJob,
  initNotifyJob
} from '../lib/preconNotifyJob.js';
import {
  buildNotifyRecipientGroups,
  enrichRecipientsWithAuthPhones,
  filterRecipientsByPreconProjectAccess,
  loadAuthUsersAndRoles,
  resolveAutoNotifyRecipients,
  uniqRecipients
} from '../lib/preconNotify.js';
import { parseAssignees } from '../lib/preconAdmin.js';
import {
  normalizeWhatsAppFrom,
  normalizeWhatsAppPhone,
  resolvePhonesForRecipients,
  sendWhatsAppNotifications,
  verifyWhatsAppMediaToken,
  whatsappConfigured,
  whatsappNotifyEnabled
} from '../lib/preconWhatsApp.js';

export const preconstructionRouter = Router();
const APP_ID = 'preconstruction';
const PERM_ADMIN = 'manage_security';

function canDeletePreconProjects(user) {
  if (!user) return false;
  if ((user.permissions || []).includes(PERM_ADMIN)) return true;
  return (user.roleIds || []).includes('admin');
}

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
      res.json({
        data: repairPreconstructionForRead(doc.data),
        updatedAt: doc.updatedAt,
        version: doc.version || 1,
        appId: APP_ID
      });
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
      const hasVersionConflict =
        expectedVersion !== undefined && Number(expectedVersion) !== currentVersion;
      if (hasVersionConflict) {
        // Same as app_states: merge on stale version instead of hard 409.
      }
      const now = new Date();
      const nextVersion = currentVersion + 1;
      let sess = await resolveSession(db, req);
      const authUser = sess?.user || req.authUser;
      let toSave = payload;
      if (existing?.data) {
        toSave = mergePreconstructionState(existing.data, payload, {
          allowProjectRemoval: canDeletePreconProjects(authUser)
        });
      }
      await states.updateOne(
        { _id: APP_ID },
        {
          $set: {
            appId: APP_ID,
            data: toSave,
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
      const phaseName = String(req.query.phaseName || '').trim();
      const taskWho = String(req.query.taskWho || '').trim();
      const { projects, departments } = await loadWorkspace(db);
      const assigneeNames = projectId ? collectProjectAssigneeNames(projects, projectId) : [];
      const groups = await buildNotifyRecipientGroups(db, { departments, assigneeNames });
      let autoRecipients = resolveAutoNotifyRecipients(groups, { departments, phaseName, taskWho });
      const project = projectId ? (projects || []).find((p) => p.id === projectId) : null;
      const { authUsers, roleById } = await loadAuthUsersAndRoles(db);
      if (project) {
        autoRecipients = filterRecipientsByPreconProjectAccess(autoRecipients, authUsers, roleById, project);
      }
      const emailConfig = getEmailConfig();
      const waOn = whatsappNotifyEnabled();
      const usersByEmail = new Map(authUsers.map((u) => [String(u.email || '').toLowerCase(), u]));
      const enrichedAuto = enrichRecipientsWithAuthPhones(autoRecipients, authUsers);
      const withEmail = (enrichedAuto || []).filter((r) => String(r.email || '').includes('@'));
      const withPhone = (enrichedAuto || []).filter((r) => String(r.phone || '').replace(/\D/g, '').length >= 10);
      const resolvedPhones = resolvePhonesForRecipients(enrichedAuto, usersByEmail, authUsers);
      const fromRaw = String(process.env.TWILIO_WHATSAPP_FROM || '').trim();
      const fromNormalized = normalizeWhatsAppFrom(fromRaw);
      res.json({
        emailEnabled: emailNotifyEnabled(),
        emailTransport: emailConfig.provider || 'none',
        emailConfig,
        emailDiagnostics: {
          configured: emailNotifyEnabled(),
          provider: emailConfig.provider || null,
          from: emailConfig.from || null,
          autoRecipientsWithEmail: withEmail.length,
          autoRecipientsTotal: (enrichedAuto || []).length,
          accessFilter: project
            ? 'Only users with PreConstruction app + this project in Admin Security'
            : 'Select a project for scoped recipients',
          hint: emailNotifyEnabled()
            ? withEmail.length
              ? 'Email alerts use the same content as WhatsApp — ensure each user has email in Admin Security.'
              : 'Add work emails in Admin → Security for assignees / dept heads.'
            : emailConfig.recommendedProvider === 'gas'
              ? 'Set EMAIL_PROVIDER=gas, PRECON_GAS_EMAIL_URL, PRECON_GAS_EMAIL_SECRET on Render (no DNS).'
              : 'Set EMAIL_PROVIDER=resend and RESEND_API_KEY on Render, or use GAS relay (see env.example).'
        },
        whatsappEnabled: waOn,
        whatsappDiagnostics: {
          configured: waOn,
          fromSet: !!fromRaw,
          fromNormalized: fromNormalized || null,
          fromFormatOk: !fromRaw || !!fromNormalized,
          autoRecipientsWithPhone: withPhone.length,
          autoRecipientsTotal: (enrichedAuto || []).length,
          phonesResolvedForNotify: resolvedPhones.length,
          sandboxReminder:
            'Each recipient phone must WhatsApp "join <your-code>" to +1 415 523 8886 (Twilio sandbox) — re-join every 72h.',
          hint: waOn
            ? resolvedPhones.length
              ? 'Phones found. Ensure each number joined the Twilio sandbox; check Render logs for Twilio error codes (e.g. 63015 = not in sandbox).'
              : 'Add mobile numbers in Admin → Security for assignees / dept heads (10-digit India OK).'
            : 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM on Render.'
        },
        groups,
        autoRecipients: enrichedAuto
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
  '/preconstruction/attachments/:id/wa-media',
  withDb(async (req, res, db) => {
    try {
      const attId = req.params.id;
      const token = String(req.query.token || '');
      if (!verifyWhatsAppMediaToken(attId, token)) {
        return res.status(403).json({ error: 'Invalid or expired link' });
      }
      const opened = await openAttachmentStream(db, attId);
      if (!opened) return res.status(404).json({ error: 'Attachment not found' });
      res.setHeader('Content-Type', opened.meta.mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      opened.stream.pipe(res);
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
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

async function resolveNotifyRecipients(db, body) {
  const extra = Array.isArray(body.extraRecipients) ? body.extraRecipients : [];
  const manual = Array.isArray(body.recipients) ? body.recipients : [];
  const { authUsers, roleById } = await loadAuthUsersAndRoles(db);
  let list;
  if (body.autoNotify === false) {
    list = uniqRecipients([...manual, ...extra]);
  } else {
    const { projects, departments } = await loadWorkspace(db);
    const projectId = String(body.projectId || '').trim();
    const project = projectId ? (projects || []).find((p) => p.id === projectId) : null;
    const assigneeNames = projectId ? collectProjectAssigneeNames(projects, projectId) : [];
    const groups = await buildNotifyRecipientGroups(db, { departments, assigneeNames });
    const auto = resolveAutoNotifyRecipients(groups, {
      departments,
      phaseName: body.phaseName,
      taskWho: body.taskWho
    });
    list = uniqRecipients([...auto, ...extra, ...manual]);
    if (project) {
      list = filterRecipientsByPreconProjectAccess(list, authUsers, roleById, project);
    }
  }
  return enrichRecipientsWithAuthPhones(list, authUsers);
}

preconstructionRouter.post(
  '/preconstruction/test-email',
  withDb(async (req, res, db) => {
    const sess = await requirePreconSession(db, req, res);
    if (!sess) return;
    const perms = sess.user.permissions || [];
    if (!perms.includes('manage_security') && !perms.includes('admin')) {
      return res.status(403).json({ error: 'Admin only' });
    }
    if (!emailNotifyEnabled()) {
      const cfg = getEmailConfig();
      return res.status(503).json({
        ok: false,
        error: 'Email not configured on server',
        hint: cfg.recommendedProvider === 'gas'
          ? 'Set EMAIL_PROVIDER=gas, PRECON_GAS_EMAIL_URL, PRECON_GAS_EMAIL_SECRET'
          : 'Set EMAIL_PROVIDER=resend and RESEND_API_KEY on Render'
      });
    }
    try {
      const override = String(req.body?.email || '').trim().toLowerCase();
      const u = await db.collection('auth_users').findOne({ email: sess.user.email });
      const to = override || String(u?.email || sess.user.email || '').trim().toLowerCase();
      if (!to.includes('@')) {
        return res.status(400).json({
          ok: false,
          error: 'No email — pass { "email": "you@company.com" } or set your email in Admin Security'
        });
      }
      const ctx = {
        kind: 'comment',
        projectName: 'Test project',
        phaseName: 'Test phase',
        taskName: 'Test activity',
        author: sess.user.name || 'Admin',
        text: 'If you received this, PreConstruction email notifications are working.',
        nextAction: 'Open PreConstruction and post a real comment',
        nextActionDate: new Date().toISOString().slice(0, 10),
        fileLabels: [],
        attachmentLinks: []
      };
      const result = await sendPreconNotification({
        to: [to],
        subject: '[PreConstruction] Email test — notifications enabled',
        text: buildPreconNotifyBody(ctx),
        html: buildPreconNotifyEmailHtml(ctx)
      });
      res.json({ ok: result.ok, to, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  })
);

preconstructionRouter.post(
  '/preconstruction/test-whatsapp',
  withDb(async (req, res, db) => {
    const sess = await requirePreconSession(db, req, res);
    if (!sess) return;
    const perms = sess.user.permissions || [];
    if (!perms.includes('manage_security') && !perms.includes('admin')) {
      return res.status(403).json({ error: 'Admin only' });
    }
    if (!whatsappConfigured()) {
      return res.status(503).json({
        ok: false,
        error: 'Twilio not configured on server',
        hint: 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM on Render'
      });
    }
    try {
      const override = String(req.body?.phone || '').trim();
      const u = await db.collection('auth_users').findOne({ email: sess.user.email });
      const raw = override || u?.phone || '';
      const to = normalizeWhatsAppPhone(raw);
      if (!to) {
        return res.status(400).json({
          ok: false,
          error: 'No phone — add your number in Admin Security or pass { "phone": "9876543210" }'
        });
      }
      const result = await sendWhatsAppNotifications({
        toPhones: [to],
        body:
          '*Golden Abodes · Project Update*\n\nTest message — if you received this, WhatsApp notify is working.\n\nOpen: https://ga-golden-abodes-platform.onrender.com/preconstruction/'
      });
      res.json({ ok: result.ok, to, ...result });
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.message || String(e) });
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
      const recipients = await resolveNotifyRecipients(db, body);
      const emails = recipients.map((r) => r.email).filter((e) => e.includes('@'));
      const authUsers = await db
        .collection('auth_users')
        .find({ status: { $ne: 'disabled' } }, { projection: { email: 1, phone: 1, name: 1 } })
        .toArray();
      const usersByEmail = new Map(authUsers.map((u) => [String(u.email || '').toLowerCase(), u]));
      const phoneCount = resolvePhonesForRecipients(recipients, usersByEmail, authUsers).length;
      const jobId = createNotifyJobId();

      await initNotifyJob(db, jobId, {
        kind: body.kind || 'comment',
        projectId: body.projectId,
        taskName: body.taskName,
        author: body.author || sess.user.name,
        recipientCount: Math.max(emails.length, phoneCount)
      });

      res.status(202).json({
        ok: true,
        queued: true,
        jobId,
        recipients,
        recipientCount: emails.length,
        phoneRecipientCount: phoneCount,
        message: 'Notifications queued'
      });

      setImmediate(() => {
        deliverPreconNotification(db, { body, sess, recipients, emails, jobId }).catch(async (e) => {
          console.error('[precon-notify] background job failed:', e?.message || e);
          try {
            await finishNotifyJob(db, jobId, { ok: false, error: e?.message || String(e) });
          } catch {
            /* ignore */
          }
        });
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

preconstructionRouter.get(
  '/preconstruction/notify-status/:jobId',
  withDb(async (req, res, db) => {
    const sess = await requirePreconSession(db, req, res);
    if (!sess) return;
    try {
      const job = await getNotifyJob(db, req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json({
        jobId: job._id,
        status: job.status,
        ok: job.result?.ok ?? job.status === 'sent',
        error: job.error || job.result?.error || '',
        result: job.result || null
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);
