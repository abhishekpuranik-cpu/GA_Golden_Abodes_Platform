import { Router } from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { attachHiringUser } from '../../lib/hiring/activity.js';
import { ensureMongo } from '../../lib/mongo.js';
import {
  TrkPosition, TrkTemplate, TrkCandidate, TrkHrEval, TrkMgmtEval, TrkFile,
  TRK_STAGES, TRK_RECOMMENDATIONS, TRK_DECISIONS, TRK_TEMPLATE_KINDS, TRK_REASON_CODES
} from '../../models/hiring/Tracker.js';
import {
  attachTrackerCaps, requireMgmt, requireDecide, requireTemplateEditor, trackerCaps, TRACKER_PERMS
} from '../../lib/hiring/tracker/access.js';
import {
  STAGE_LABELS, stageIndex, computeScore, actor, pushHistory, serializeCandidate,
  BUCKETS, FUNNEL, daysBetween
} from '../../lib/hiring/tracker/core.js';
import { defaultQuestions, ensureTemplatesForPosition } from '../../lib/hiring/tracker/seed.js';
import { generatePreRead } from '../../lib/hiring/tracker/preRead.js';

const router = Router();
router.use(attachHiringUser, attachTrackerCaps);

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);
const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const dateOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

function fail(res, status, error, extra = {}) {
  return res.status(status).json({ error, ...extra });
}

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof mongoose.Error.VersionError) {
        return fail(res, 409, 'This candidate was updated by someone else — reload and try again');
      }
      if (err instanceof mongoose.Error.ValidationError) {
        return fail(res, 422, 'Some fields are invalid — please check and retry');
      }
      if (err?.code === 11000) {
        return fail(res, 409, 'Someone else just saved this — reload and try again');
      }
      console.error('[Hiring Tracker]', err);
      return fail(res, 500, 'Something went wrong — please retry');
    }
  };
}

const RESUME_MAX_BYTES = 5 * 1024 * 1024;
const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RESUME_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, /\.(pdf|docx?)$/i.test(file.originalname || ''))
});

/** Sniff content so a renamed executable / HTML cannot be stored as a "resume". */
function resumeKind(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf.slice(0, 4).toString('latin1') === '%PDF') return { mime: 'application/pdf', ext: 'pdf' };
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
  }
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return { mime: 'application/msword', ext: 'doc' };
  return null;
}

function resumeUploadMw(req, res, next) {
  resumeUpload.single('file')(req, res, (err) => {
    if (err) return fail(res, 422, err.code === 'LIMIT_FILE_SIZE' ? 'Resume must be 5 MB or smaller' : 'Upload failed');
    return next();
  });
}

async function loadCandidate(req, res) {
  if (!isId(req.params.id)) { fail(res, 400, 'Invalid candidate id'); return null; }
  const cand = await TrkCandidate.findOne({ _id: req.params.id, isDeleted: false });
  if (!cand) { fail(res, 404, 'Candidate not found'); return null; }
  return cand;
}

function setNextAction(cand, text, dueDays = 2, owner = '') {
  cand.nextAction = text;
  cand.nextActionDue = text ? new Date(Date.now() + dueDays * 86400000) : null;
  cand.nextActionOwner = owner;
}

function moveStage(cand, req, to, { note = '', override = false, confidential = false } = {}) {
  const from = cand.stage;
  if (from === to) return;
  cand.stage = to;
  cand.stageEnteredAt = new Date();
  pushHistory(cand, req, {
    type: 'STAGE', fromStage: from, toStage: to,
    summary: `${STAGE_LABELS[from]} → ${STAGE_LABELS[to]}${override ? ' (override)' : ''}`,
    note, override, confidential
  });
}

/* ------------------------------------------------------------------ */
/* Session capabilities + reference data                               */
/* ------------------------------------------------------------------ */

router.get('/me', (req, res) => {
  res.json({ caps: req.trk, perms: TRACKER_PERMS, stages: TRK_STAGES, stageLabels: STAGE_LABELS, reasonCodes: TRK_REASON_CODES });
});

router.get('/users', handle(async (req, res) => {
  const db = await ensureMongo();
  if (!db) return res.json({ users: [] });
  const [users, roles] = await Promise.all([
    db.collection('auth_users').find(
      { status: { $ne: 'disabled' } },
      { projection: { name: 1, email: 1, roleIds: 1, permissions: 1, allowedApps: 1 } }
    ).toArray(),
    db.collection('auth_roles').find({}).toArray()
  ]);
  const roleMap = new Map(roles.map((r) => [String(r._id), r]));
  const out = [];
  for (const u of users) {
    const rs = (u.roleIds || []).map((id) => roleMap.get(String(id))).filter(Boolean);
    const merged = {
      permissions: [...(u.permissions || []), ...rs.flatMap((r) => r.permissions || [])],
      allowedApps: [...(u.allowedApps || []), ...rs.flatMap((r) => r.allowedApps || [])]
    };
    const caps = trackerCaps(merged);
    if (!caps.view) continue;
    out.push({ id: String(u._id), name: u.name || u.email, email: u.email, mgmt: caps.mgmt, decide: caps.decide });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ users: out });
}));

/* ------------------------------------------------------------------ */
/* Positions                                                            */
/* ------------------------------------------------------------------ */

router.get('/positions', handle(async (_req, res) => {
  const positions = await TrkPosition.find({}).sort({ sortOrder: 1, title: 1 }).lean();
  res.json({ positions });
}));

const POSITION_FIELDS = ['title', 'department', 'reportsTo', 'experience', 'education', 'location', 'mandate'];

router.post('/positions', requireTemplateEditor, handle(async (req, res) => {
  const title = str(req.body?.title, 200);
  if (!title) return fail(res, 422, 'Position title is required');
  const count = await TrkPosition.countDocuments({});
  const code = str(req.body?.code, 40) || `POS-${String(count + 1).padStart(3, '0')}`;
  if (await TrkPosition.exists({ code })) return fail(res, 409, 'Position code already exists');
  const doc = { code, sortOrder: count + 1, openings: Math.max(0, Number(req.body?.openings) || 1) };
  for (const f of POSITION_FIELDS) doc[f] = str(req.body?.[f], 2000);
  const pos = await TrkPosition.create(doc);
  await ensureTemplatesForPosition(pos);
  res.status(201).json({ position: pos });
}));

router.patch('/positions/:pid', requireTemplateEditor, handle(async (req, res) => {
  if (!isId(req.params.pid)) return fail(res, 400, 'Invalid position id');
  const pos = await TrkPosition.findById(req.params.pid);
  if (!pos) return fail(res, 404, 'Position not found');
  for (const f of POSITION_FIELDS) if (req.body?.[f] !== undefined) pos[f] = str(req.body[f], 2000);
  if (req.body?.openings !== undefined) pos.openings = Math.max(0, Number(req.body.openings) || 0);
  if (req.body?.isActive !== undefined) pos.isActive = Boolean(req.body.isActive);
  await pos.save();
  res.json({ position: pos });
}));

/* ------------------------------------------------------------------ */
/* Questionnaire templates                                              */
/* ------------------------------------------------------------------ */

function canSeeKind(caps, kind) {
  return kind === 'HR' || caps.mgmt;
}

function canEditKind(caps, kind) {
  return kind === 'HR' ? caps.editHrTemplates : caps.editMgmtTemplates;
}

router.get('/templates', handle(async (req, res) => {
  if (!isId(req.query.positionId)) return fail(res, 400, 'positionId required');
  const kinds = TRK_TEMPLATE_KINDS.filter((k) => canSeeKind(req.trk, k));
  const templates = await TrkTemplate.find({ positionId: req.query.positionId, kind: { $in: kinds } }).lean();
  res.json({ templates });
}));

function sanitizeQuestions(list) {
  if (!Array.isArray(list) || !list.length) throw Object.assign(new Error('At least one question is required'), { status: 422 });
  if (list.length > 40) throw Object.assign(new Error('Maximum 40 questions per questionnaire'), { status: 422 });
  const seen = new Set();
  return list.map((q, i) => {
    const text = str(q?.text, 1000);
    if (!text) throw Object.assign(new Error(`Question ${i + 1} has no text`), { status: 422 });
    let id = str(q?.id, 60) || `q-${Date.now().toString(36)}-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const weight = Math.min(10, Math.max(0, Number(q?.weight)));
    return {
      id, text,
      category: str(q?.category, 80),
      guidance: str(q?.guidance, 1000),
      weight: Number.isFinite(weight) ? weight : 3
    };
  });
}

router.put('/templates/:pid/:kind', requireTemplateEditor, handle(async (req, res) => {
  const { pid, kind } = req.params;
  if (!isId(pid) || !TRK_TEMPLATE_KINDS.includes(kind)) return fail(res, 400, 'Invalid template');
  if (!canEditKind(req.trk, kind)) return fail(res, 403, 'Not permitted');
  let questions;
  try { questions = sanitizeQuestions(req.body?.questions); } catch (e) { return fail(res, e.status || 422, e.message); }
  const a = actor(req);
  const tpl = await TrkTemplate.findOneAndUpdate(
    { positionId: pid, kind },
    { $set: { questions, updatedById: a.id, updatedByName: a.name }, $inc: { version: 1 } },
    { new: true, upsert: true }
  );
  res.json({ template: tpl });
}));

router.post('/templates/:pid/:kind/reset', requireTemplateEditor, handle(async (req, res) => {
  const { pid, kind } = req.params;
  if (!isId(pid) || !TRK_TEMPLATE_KINDS.includes(kind)) return fail(res, 400, 'Invalid template');
  if (!canEditKind(req.trk, kind)) return fail(res, 403, 'Not permitted');
  const pos = await TrkPosition.findById(pid).lean();
  if (!pos) return fail(res, 404, 'Position not found');
  const a = actor(req);
  const tpl = await TrkTemplate.findOneAndUpdate(
    { positionId: pid, kind },
    { $set: { questions: defaultQuestions(pos.code, kind), updatedById: a.id, updatedByName: a.name }, $inc: { version: 1 } },
    { new: true, upsert: true }
  );
  res.json({ template: tpl });
}));

/* ------------------------------------------------------------------ */
/* Candidates                                                            */
/* ------------------------------------------------------------------ */

const PROFILE_FIELDS = {
  name: (v) => str(v, 200),
  email: (v) => str(v, 200).toLowerCase(),
  phone: (v) => str(v, 40),
  currentCompany: (v) => str(v, 200),
  currentDesignation: (v) => str(v, 200),
  totalExperienceYears: numOrNull,
  location: (v) => str(v, 200),
  currentCtcLakh: numOrNull,
  expectedCtcLakh: numOrNull,
  noticePeriodDays: numOrNull,
  source: (v) => str(v, 80),
  linkedinUrl: (v) => str(v, 500),
  profileNotes: (v) => str(v, 4000)
};

function applyProfile(cand, body) {
  for (const [k, fn] of Object.entries(PROFILE_FIELDS)) {
    if (body?.[k] !== undefined) cand[k] = fn(body[k]);
  }
}

function buildFilter(q) {
  const filter = { isDeleted: false };
  if (isId(q.positionId)) filter.positionId = q.positionId;
  if (q.stage && TRK_STAGES.includes(q.stage)) filter.stage = q.stage;
  if (q.status) filter.status = q.status;
  if (q.interviewer) {
    filter.$or = [{ hrOwnerId: q.interviewer }, { 'r1.interviewerId': q.interviewer }, { 'r2.interviewerId': q.interviewer }];
  }
  const from = dateOrNull(q.from);
  const to = dateOrNull(q.to);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = new Date(to.getTime() + 86400000 - 1);
  }
  return filter;
}

router.get('/candidates', handle(async (req, res) => {
  const filter = buildFilter(req.query);
  let list = await TrkCandidate.find(filter, { history: 0 }).sort({ updatedAt: -1 }).lean();
  const bucket = BUCKETS[req.query.bucket];
  if (bucket) list = list.filter(bucket);
  const term = str(req.query.q, 100).toLowerCase();
  if (term) {
    list = list.filter((c) => [c.name, c.email, c.phone, c.currentCompany, c.currentDesignation]
      .some((v) => String(v || '').toLowerCase().includes(term)));
  }
  const out = list.map((c) => serializeCandidate(c, req.trk));
  // Management score chips are joined per request for MGMT users only — never cached on the candidate.
  if (req.trk.mgmt && out.length) {
    const evals = await TrkMgmtEval.find(
      { candidateId: { $in: out.map((c) => c._id) } },
      { candidateId: 1, round: 1, score: 1, status: 1, recommendation: 1 }
    ).lean();
    const byCand = new Map();
    for (const e of evals) {
      const k = String(e.candidateId);
      if (!byCand.has(k)) byCand.set(k, {});
      byCand.get(k)[`r${e.round}`] = { score: e.score, status: e.status, recommendation: e.recommendation };
    }
    out.forEach((c) => { c.mgmtEval = byCand.get(String(c._id)) || null; });
  }
  res.json({ candidates: out });
}));

router.post('/candidates', handle(async (req, res) => {
  if (!isId(req.body?.positionId)) return fail(res, 422, 'Select a position');
  const pos = await TrkPosition.findById(req.body.positionId).lean();
  if (!pos) return fail(res, 404, 'Position not found');
  const name = str(req.body?.name, 200);
  if (!name) return fail(res, 422, 'Candidate name is required');
  const email = str(req.body?.email, 200).toLowerCase();
  const phone = str(req.body?.phone, 40);
  if (!email && !phone) return fail(res, 422, 'Provide at least a phone number or email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 422, 'Email looks invalid');

  const dupOr = [];
  if (email) dupOr.push({ email });
  if (phone) dupOr.push({ phone });
  const dup = await TrkCandidate.findOne({ positionId: pos._id, isDeleted: false, $or: dupOr }).lean();
  if (dup && !req.body?.allowDuplicate) {
    return fail(res, 409, `${dup.name} is already in the pipeline for ${pos.title}`, { duplicateId: dup._id });
  }

  const a = actor(req);
  const cand = new TrkCandidate({
    positionId: pos._id,
    createdById: a.id,
    createdByName: a.name,
    hrOwnerId: str(req.body?.hrOwnerId, 40) || a.id,
    hrOwnerName: str(req.body?.hrOwnerName, 200) || a.name
  });
  applyProfile(cand, { ...req.body, name, email, phone });
  if (req.body?.r1InterviewerId) {
    cand.r1.interviewerId = str(req.body.r1InterviewerId, 40);
    cand.r1.interviewerName = str(req.body.r1InterviewerName, 200);
  }
  setNextAction(cand, 'Start HR screening', 2, cand.hrOwnerName);
  pushHistory(cand, req, { type: 'CREATED', toStage: 'SHORTLISTED', summary: `Shortlisted for ${pos.title}` });
  await cand.save();
  res.status(201).json({ candidate: serializeCandidate(cand, req.trk) });
}));

router.get('/candidates/:id', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  const position = await TrkPosition.findById(cand.positionId).lean();
  res.json({ candidate: serializeCandidate(cand, req.trk), position, caps: req.trk });
}));

router.patch('/candidates/:id', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  applyProfile(cand, req.body);
  if (!cand.name) return fail(res, 422, 'Candidate name is required');
  if (req.body?.hrOwnerId !== undefined) {
    cand.hrOwnerId = str(req.body.hrOwnerId, 40);
    cand.hrOwnerName = str(req.body.hrOwnerName, 200);
    pushHistory(cand, req, { type: 'ASSIGN', summary: `HR owner: ${cand.hrOwnerName || 'unassigned'}` });
  }
  if (req.body?.nextAction !== undefined) {
    cand.nextAction = str(req.body.nextAction, 300);
    cand.nextActionDue = dateOrNull(req.body.nextActionDue);
    cand.nextActionOwner = str(req.body.nextActionOwner, 200);
  }
  await cand.save();
  res.json({ candidate: serializeCandidate(cand, req.trk) });
}));

router.delete('/candidates/:id', handle(async (req, res) => {
  if (!req.trk.override) return fail(res, 403, 'Only decision-makers can remove candidates');
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  cand.isDeleted = true;
  pushHistory(cand, req, { type: 'NOTE', summary: 'Candidate removed', note: str(req.body?.reason, 500) });
  await cand.save();
  res.json({ ok: true });
}));

/* ---------- Resume ---------- */

router.post('/candidates/:id/resume', resumeUploadMw, handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  if (!req.file?.buffer?.length) return fail(res, 422, 'Upload a PDF or Word resume (max 5 MB)');
  const kind = resumeKind(req.file.buffer);
  if (!kind) return fail(res, 422, 'File content is not a valid PDF or Word document');
  const a = actor(req);
  const base = str(req.file.originalname, 150).replace(/\.[^.]+$/, '').replace(/[^\w.\- ]+/g, '_') || 'resume';
  const file = await TrkFile.create({
    candidateId: cand._id, name: `${base}.${kind.ext}`, mime: kind.mime,
    size: req.file.size, data: req.file.buffer, uploadedById: a.id
  });
  if (cand.resume?.fileId) await TrkFile.deleteOne({ _id: cand.resume.fileId });
  cand.resume = { fileId: file._id, name: file.name, mime: file.mime, size: file.size, uploadedAt: new Date() };
  pushHistory(cand, req, { type: 'NOTE', summary: `Resume uploaded (${file.name})` });
  await cand.save();
  res.json({ candidate: serializeCandidate(cand, req.trk) });
}));

router.get('/candidates/:id/resume', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  if (!cand.resume?.fileId) return fail(res, 404, 'No resume uploaded');
  const file = await TrkFile.findById(cand.resume.fileId).lean();
  if (!file) return fail(res, 404, 'Resume file missing');
  const safe = String(file.name || 'resume').replace(/[^\w.\- ]+/g, '_');
  res.setHeader('Content-Type', file.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${safe}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.data.buffer ? Buffer.from(file.data.buffer) : file.data);
}));

/* ---------- Scheduling (operational; HR coordinates) ---------- */

router.patch('/candidates/:id/schedule', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  const round = String(req.body?.round || '');
  if (!['HR', '1', '2'].includes(round)) return fail(res, 400, 'round must be HR, 1 or 2');
  if (!['ACTIVE', 'ON_HOLD'].includes(cand.status)) return fail(res, 409, 'Candidate is closed');
  const at = dateOrNull(req.body?.scheduledAt);

  if (round === 'HR') {
    const prev = cand.hr.scheduledAt;
    cand.hr.scheduledAt = at;
    pushHistory(cand, req, { type: 'SCHEDULE', summary: `HR screening ${prev ? 'rescheduled' : 'scheduled'}${at ? ` for ${at.toISOString()}` : ''}` });
    if (at) setNextAction(cand, 'Conduct HR screening', Math.max(0, daysBetween(new Date(), at)), cand.hrOwnerName);
  } else {
    if (round === '2' && !cand.r2Required) return fail(res, 409, '2nd round has not been requested by management');
    const key = round === '1' ? 'r1' : 'r2';
    const r = cand[key];
    const label = round === '1' ? '1st round' : '2nd round';
    const status = str(req.body?.status, 20);
    if (status === 'NO_SHOW') {
      r.status = 'NO_SHOW';
      r.noShowCount += 1;
      pushHistory(cand, req, { type: 'SCHEDULE', summary: `${label}: candidate did not attend (no-show #${r.noShowCount})` });
      setNextAction(cand, r.noShowCount >= 2 ? `Repeated no-show — consider rejecting` : `Reschedule ${label} or close`, 1, cand.hrOwnerName);
    } else {
      if (req.body?.interviewerId !== undefined) {
        r.interviewerId = str(req.body.interviewerId, 40);
        r.interviewerName = str(req.body.interviewerName, 200);
      }
      if (req.body?.mode !== undefined) r.mode = str(req.body.mode, 20);
      if (req.body?.venue !== undefined) r.venue = str(req.body.venue, 300);
      if (at) {
        const wasScheduled = Boolean(r.scheduledAt);
        if (wasScheduled && r.scheduledAt.getTime() !== at.getTime()) r.rescheduleCount += 1;
        r.scheduledAt = at;
        if (r.status !== 'COMPLETED') r.status = 'SCHEDULED';
        pushHistory(cand, req, {
          type: 'SCHEDULE',
          summary: `${label} ${wasScheduled ? 'rescheduled' : 'scheduled'}${r.interviewerName ? ` with ${r.interviewerName}` : ''}`
        });
        setNextAction(cand, `Conduct ${label}`, Math.max(0, daysBetween(new Date(), at)), r.interviewerName);
      } else if (req.body?.interviewerId !== undefined) {
        pushHistory(cand, req, { type: 'ASSIGN', summary: `${label} interviewer: ${r.interviewerName || 'unassigned'}` });
      }
    }
  }
  await cand.save();
  res.json({ candidate: serializeCandidate(cand, req.trk) });
}));

/* ---------- Stage transitions ---------- */

const HR_STAGES = ['SHORTLISTED', 'HR_SCREENING'];

router.post('/candidates/:id/transition', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  const { trk } = req;
  const action = String(req.body?.action || '');
  const reason = str(req.body?.reason, 1000);
  const inHrStage = HR_STAGES.includes(cand.stage);
  const canTouch = inHrStage ? trk.hr : trk.mgmt;

  if (action === 'START_HR' || (action === 'ADVANCE' && cand.stage === 'SHORTLISTED')) {
    if (cand.status !== 'ACTIVE') return fail(res, 409, 'Candidate is not active');
    if (cand.stage !== 'SHORTLISTED') return fail(res, 409, 'Screening already started');
    moveStage(cand, req, 'HR_SCREENING');
    setNextAction(cand, 'Complete HR screening', 3, cand.hrOwnerName);
  } else if (action === 'ADVANCE') {
    if (cand.status !== 'ACTIVE') return fail(res, 409, 'Resume the candidate before moving stages');
    const gate = advanceGate(cand);
    if (!gate.to) return fail(res, 409, 'Candidate is already at the final stage');
    let override = false;
    if (gate.ok) {
      if (!canTouch) return fail(res, 403, 'Management access required to move this candidate');
    } else if (gate.mgmtCanPull && trk.mgmt) {
      if (!reason) return fail(res, 422, 'Give a short reason for moving this candidate forward');
    } else {
      if (!req.body?.override) return fail(res, 422, gate.reason, { gate: gate.reason, overridable: trk.override });
      if (!trk.override) return fail(res, 403, 'Only decision-makers can override stage requirements');
      if (!reason) return fail(res, 422, 'An override reason is required');
      override = true;
    }
    if (override) cand.overrideCount += 1;
    moveStage(cand, req, gate.to, { note: reason, override, confidential: !inHrStage || Boolean(reason) });
    applyStageDefaults(cand);
  } else if (action === 'HOLD' || action === 'REJECT' || action === 'WITHDRAW') {
    const reasonCode = String(req.body?.reasonCode || '');
    if (!TRK_REASON_CODES.includes(reasonCode)) return fail(res, 422, 'Choose a reason');
    if (reasonCode === 'OTHER' && !reason) return fail(res, 422, 'Add a note for "Other"');
    const open = action === 'WITHDRAW' ? ['ACTIVE', 'ON_HOLD', 'SELECTED'] : ['ACTIVE', 'ON_HOLD'];
    if (!open.includes(cand.status)) return fail(res, 409, 'Candidate is already closed');
    // Withdrawal is an operational fact HR can always record; hold/reject after HR stages is management's call.
    if (action !== 'WITHDRAW' && !canTouch) return fail(res, 403, 'Only management can hold or reject at this stage');
    const to = { HOLD: 'ON_HOLD', REJECT: 'REJECTED', WITHDRAW: 'WITHDRAWN' }[action];
    const confidential = action !== 'WITHDRAW' && !inHrStage;
    const from = cand.status;
    cand.status = to;
    cand.statusReasonCode = reasonCode;
    cand.statusReason = reason;
    cand.statusReasonConfidential = confidential;
    const verb = { HOLD: 'Put on hold', REJECT: 'Rejected', WITHDRAW: 'Withdrawn' }[action];
    pushHistory(cand, req, {
      type: 'STATUS', fromStatus: from, toStatus: to, reasonCode,
      summary: `${verb} at ${STAGE_LABELS[cand.stage]}`,
      note: reason, confidential
    });
    if (to === 'ON_HOLD') setNextAction(cand, 'Review hold — resume or reject', 7, '');
    else setNextAction(cand, '', 0);
  } else if (action === 'RESUME') {
    if (!canTouch) return fail(res, 403, 'Only management can resume at this stage');
    if (cand.status !== 'ON_HOLD') return fail(res, 409, 'Candidate is not on hold');
    cand.status = 'ACTIVE';
    if (cand.stage === 'DECISION' && cand.decision?.outcome === 'ON_HOLD') cand.decision.outcome = '';
    pushHistory(cand, req, { type: 'STATUS', fromStatus: 'ON_HOLD', toStatus: 'ACTIVE', summary: 'Resumed', note: reason, confidential: !inHrStage });
    applyStageDefaults(cand);
  } else if (action === 'REOPEN') {
    if (!trk.override) return fail(res, 403, 'Only decision-makers can reopen a closed candidate');
    if (!['REJECTED', 'SELECTED', 'WITHDRAWN'].includes(cand.status)) return fail(res, 409, 'Candidate is not closed');
    if (!reason) return fail(res, 422, 'A reason is required to reopen');
    const from = cand.status;
    cand.status = 'ACTIVE';
    cand.statusReasonCode = '';
    cand.statusReason = '';
    cand.overrideCount += 1;
    if (cand.decision?.outcome) cand.decision.outcome = '';
    pushHistory(cand, req, { type: 'STATUS', fromStatus: from, toStatus: 'ACTIVE', summary: 'Reopened', note: reason, override: true, confidential: true });
    applyStageDefaults(cand);
  } else if (action === 'MOVE') {
    const to = String(req.body?.to || '');
    if (!TRK_STAGES.includes(to)) return fail(res, 400, 'Invalid target stage');
    if (!trk.override) return fail(res, 403, 'Only decision-makers can move stages manually');
    if (!reason) return fail(res, 422, 'A reason is required');
    if (to === 'MGMT_R2') cand.r2Required = true;
    cand.overrideCount += 1;
    moveStage(cand, req, to, { note: reason, override: true, confidential: true });
    applyStageDefaults(cand);
  } else {
    return fail(res, 400, 'Unknown action');
  }
  await cand.save();
  res.json({ candidate: serializeCandidate(cand, req.trk) });
}));

function advanceGate(cand) {
  switch (cand.stage) {
    case 'HR_SCREENING':
      if (cand.hr.status !== 'SUBMITTED') return { to: 'MGMT_R1', ok: false, reason: 'Submit the HR screening evaluation first' };
      if (cand.hr.recommendation === 'HOLD') {
        return { to: 'MGMT_R1', ok: false, mgmtCanPull: true, reason: 'HR put this candidate on hold — management can pull them into the 1st round' };
      }
      if (cand.hr.recommendation !== 'RECOMMENDED') return { to: 'MGMT_R1', ok: false, reason: 'HR did not recommend this candidate' };
      return { to: 'MGMT_R1', ok: true };
    case 'MGMT_R1': {
      const to = cand.r2Required ? 'MGMT_R2' : 'DECISION';
      if (cand.r1EvalStatus !== 'SUBMITTED') return { to, ok: false, reason: 'Submit the 1st round evaluation first' };
      return { to, ok: true };
    }
    case 'MGMT_R2':
      if (cand.r2EvalStatus !== 'SUBMITTED') return { to: 'DECISION', ok: false, reason: 'Submit the 2nd round evaluation first' };
      return { to: 'DECISION', ok: true };
    default:
      return { to: null, ok: false };
  }
}

function applyStageDefaults(cand) {
  if (cand.status !== 'ACTIVE') return;
  switch (cand.stage) {
    case 'SHORTLISTED': setNextAction(cand, 'Start HR screening', 2, cand.hrOwnerName); break;
    case 'HR_SCREENING': setNextAction(cand, 'Complete HR screening', 3, cand.hrOwnerName); break;
    case 'MGMT_R1':
      setNextAction(cand, cand.r1.scheduledAt ? 'Conduct 1st round interview' : 'Schedule 1st round interview', 3, cand.r1.interviewerName || cand.hrOwnerName);
      break;
    case 'MGMT_R2':
      setNextAction(cand, cand.r2.scheduledAt ? 'Conduct 2nd round interview' : 'Schedule 2nd round interview', 3, cand.r2.interviewerName || cand.hrOwnerName);
      break;
    case 'DECISION': setNextAction(cand, 'Record final hiring decision', 2, ''); break;
    default: break;
  }
}

/* ------------------------------------------------------------------ */
/* Evaluations                                                          */
/* ------------------------------------------------------------------ */

async function templateQuestions(positionId, kind) {
  const tpl = await TrkTemplate.findOne({ positionId, kind }).lean();
  return { questions: tpl?.questions || [], version: tpl?.version || 0 };
}

function snapshotAnswers(questions) {
  return questions.map((q) => ({
    qid: q.id, category: q.category, text: q.text, guidance: q.guidance, weight: q.weight,
    response: '', comment: '', score: null
  }));
}

function mergeAnswers(evalDoc, incoming) {
  const byId = new Map((Array.isArray(incoming) ? incoming : []).map((a) => [String(a?.qid), a]));
  evalDoc.answers = evalDoc.answers.map((a) => {
    const plain = typeof a.toObject === 'function' ? a.toObject() : a;
    const inc = byId.get(plain.qid);
    if (!inc) return plain;
    const s = inc.score === null || inc.score === '' || inc.score === undefined ? null : Number(inc.score);
    return {
      ...plain,
      response: inc.response !== undefined ? str(inc.response, 4000) : plain.response,
      comment: inc.comment !== undefined ? str(inc.comment, 4000) : plain.comment,
      score: s == null ? null : (Number.isInteger(s) && s >= 1 && s <= 5 ? s : plain.score),
      flagged: inc.flagged !== undefined ? Boolean(inc.flagged) : Boolean(plain.flagged)
    };
  });
}

function validateSubmit(evalDoc) {
  const calc = computeScore(evalDoc.answers);
  const missing = evalDoc.answers
    .map((a, i) => ((Number(a.weight) > 0 && !a.score) ? i + 1 : null))
    .filter(Boolean);
  if (missing.length) return `Score every question before submitting (missing: Q${missing.join(', Q')})`;
  if (!TRK_RECOMMENDATIONS.includes(evalDoc.recommendation)) return 'Choose a recommendation before submitting';
  if (!calc.complete) return 'Evaluation incomplete';
  return null;
}

/* ---------- HR screening ---------- */

router.get('/candidates/:id/hr-eval', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  let ev = await TrkHrEval.findOne({ candidateId: cand._id }).lean();
  if (!ev) {
    const { questions, version } = await templateQuestions(cand.positionId, 'HR');
    ev = { candidateId: cand._id, answers: snapshotAnswers(questions), templateVersion: version, status: 'DRAFT', recommendation: '', summary: '', score: null, isNew: true };
  }
  res.json({ evaluation: ev, calc: computeScore(ev.answers) });
}));

router.put('/candidates/:id/hr-eval', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  if (!req.trk.hr) return fail(res, 403, 'Not permitted');
  if (cand.status !== 'ACTIVE') return fail(res, 409, 'Resume the candidate before editing the screening');
  let ev = await TrkHrEval.findOne({ candidateId: cand._id });
  const locked = ev?.status === 'SUBMITTED' && !HR_STAGES.includes(cand.stage);
  if (locked && !req.trk.override) return fail(res, 409, 'HR screening is locked after the candidate moved to management rounds');
  const a = actor(req);
  if (!ev) {
    const { questions, version } = await templateQuestions(cand.positionId, 'HR');
    if (!questions.length) return fail(res, 409, 'No HR questionnaire configured for this position');
    ev = new TrkHrEval({ candidateId: cand._id, positionId: cand.positionId, templateVersion: version, answers: snapshotAnswers(questions) });
  }
  mergeAnswers(ev, req.body?.answers);
  if (req.body?.recommendation !== undefined) {
    ev.recommendation = TRK_RECOMMENDATIONS.includes(req.body.recommendation) ? req.body.recommendation : '';
  }
  if (req.body?.summary !== undefined) ev.summary = str(req.body.summary, 4000);
  ev.evaluatorId = a.id;
  ev.evaluatorName = a.name;
  const calc = computeScore(ev.answers);
  ev.score = calc.score;

  // Editing an already-submitted evaluation is always a re-submission and must stay complete.
  const submit = Boolean(req.body?.submit) || ev.status === 'SUBMITTED';
  if (submit) {
    const err = validateSubmit(ev);
    if (err) return fail(res, 422, err);
    ev.status = 'SUBMITTED';
    ev.submittedAt = new Date();
  } else {
    ev.status = 'DRAFT';
  }
  await ev.save();

  if (cand.stage === 'SHORTLISTED') moveStage(cand, req, 'HR_SCREENING');
  cand.hr.status = ev.status;
  cand.hr.score = ev.score;
  cand.hr.recommendation = ev.recommendation;
  cand.hr.evaluatorName = a.name;
  if (submit) {
    cand.hr.submittedAt = ev.submittedAt;
    pushHistory(cand, req, {
      type: 'EVAL',
      summary: `HR screening submitted — ${ev.score?.toFixed(2)}/5, ${ev.recommendation.replace('_', ' ').toLowerCase()}`,
      note: ev.summary
    });
    if (ev.recommendation === 'RECOMMENDED' && cand.stage === 'HR_SCREENING') {
      moveStage(cand, req, 'MGMT_R1');
      applyStageDefaults(cand);
    } else if (ev.recommendation === 'HOLD') {
      setNextAction(cand, 'HR hold — management to decide: proceed, hold or reject', 3, '');
    } else if (ev.recommendation === 'NOT_RECOMMENDED') {
      setNextAction(cand, 'Not recommended by HR — confirm rejection', 2, cand.hrOwnerName);
    }
  } else if (cand.stage === 'HR_SCREENING' && !cand.nextAction) {
    applyStageDefaults(cand);
  }
  await cand.save();
  if (submit) {
    generatePreRead({ cand: cand.toObject(), byName: a.name })
      .catch((e) => console.warn('[Hiring Tracker] pre-read failed:', e?.message || e));
  }
  res.json({ evaluation: ev, calc, candidate: serializeCandidate(cand, req.trk) });
}));

/* ---------- 1st-round pre-read (derived from HR screening only) ---------- */

async function preReadPayload(candId) {
  const ev = await TrkHrEval.findOne({ candidateId: candId }, { preRead: 1, status: 1, submittedAt: 1 }).lean();
  const pr = ev?.preRead || { status: 'NONE' };
  const stale = Boolean(pr.basedOnSubmittedAt && ev?.submittedAt && new Date(pr.basedOnSubmittedAt).getTime() !== new Date(ev.submittedAt).getTime());
  return { preRead: pr, hrStatus: ev?.status || 'NOT_STARTED', stale };
}

router.get('/candidates/:id/pre-read', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  res.json(await preReadPayload(cand._id));
}));

router.post('/candidates/:id/pre-read', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  const ev = await TrkHrEval.findOne({ candidateId: cand._id }, { status: 1 }).lean();
  if (ev?.status !== 'SUBMITTED') return fail(res, 409, 'Submit the HR screening first');
  await generatePreRead({ cand: cand.toObject(), byName: actor(req).name });
  res.json(await preReadPayload(cand._id));
}));

const linesOf = (v, n, len) => (Array.isArray(v) ? v : []).slice(0, n).map((x) => str(x, len)).filter(Boolean);

router.put('/candidates/:id/pre-read', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  const ev = await TrkHrEval.findOne({ candidateId: cand._id }, { preRead: 1 }).lean();
  if (ev?.preRead?.status !== 'READY') return fail(res, 409, 'Generate the pre-read first');
  const b = req.body || {};
  const pts = (v) => (Array.isArray(v) ? v : []).slice(0, 8)
    .map((p) => ({ point: str(p?.point, 300), evidence: str(p?.evidence, 500) })).filter((p) => p.point);
  const set = { 'preRead.editedAt': new Date(), 'preRead.editedByName': actor(req).name };
  if (b.headline !== undefined) set['preRead.headline'] = str(b.headline, 300);
  if (b.verdict !== undefined) set['preRead.verdict'] = str(b.verdict, 1500);
  if (b.strengths !== undefined) set['preRead.strengths'] = pts(b.strengths);
  if (b.concerns !== undefined) set['preRead.concerns'] = pts(b.concerns);
  if (b.verify !== undefined) set['preRead.verify'] = linesOf(b.verify, 10, 300);
  if (b.probes !== undefined) {
    set['preRead.probes'] = (Array.isArray(b.probes) ? b.probes : []).slice(0, 10)
      .map((p) => ({ question: str(p?.question, 400), why: str(p?.why, 300) })).filter((p) => p.question);
  }
  await TrkHrEval.updateOne({ candidateId: cand._id }, { $set: set });
  res.json(await preReadPayload(cand._id));
}));

/* ---------- Final decision ---------- */

router.post('/candidates/:id/decision', requireDecide, handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  const outcome = String(req.body?.outcome || '');
  if (!TRK_DECISIONS.includes(outcome)) return fail(res, 422, 'Choose Selected, Rejected or On Hold');
  const remarks = str(req.body?.remarks, 4000);
  if (!remarks) return fail(res, 422, 'Decision remarks are required');
  const override = Boolean(req.body?.override);
  if (cand.stage !== 'DECISION') {
    if (!override) return fail(res, 422, `Candidate is at ${STAGE_LABELS[cand.stage]} — complete the required rounds first`, { overridable: true });
    const reason = str(req.body?.overrideReason, 1000);
    if (!reason) return fail(res, 422, 'An override reason is required');
    cand.overrideCount += 1;
    moveStage(cand, req, 'DECISION', { note: reason, override: true, confidential: true });
  }
  const a = actor(req);
  const prevStatus = cand.status;
  cand.decision = { outcome, remarks, byId: a.id, byName: a.name, at: new Date() };
  cand.status = outcome === 'ON_HOLD' ? 'ON_HOLD' : outcome;
  cand.statusReason = '';
  pushHistory(cand, req, {
    type: 'DECISION', fromStatus: prevStatus, toStatus: cand.status,
    summary: `Final decision: ${outcome.replace('_', ' ').toLowerCase()}`,
    note: remarks, confidential: true
  });
  const next = str(req.body?.nextAction, 300);
  if (next) {
    cand.nextAction = next;
    cand.nextActionDue = dateOrNull(req.body?.nextActionDue);
    cand.nextActionOwner = str(req.body?.nextActionOwner, 200);
  } else {
    setNextAction(cand, outcome === 'SELECTED' ? 'Release offer' : outcome === 'ON_HOLD' ? 'Revisit decision' : '', 3, cand.hrOwnerName);
  }
  await cand.save();
  res.json({ candidate: serializeCandidate(cand, req.trk) });
}));

/* ------------------------------------------------------------------ */
/* Management rounds — confidential. Everything below requires MGMT.   */
/* ------------------------------------------------------------------ */

const mgmt = Router({ mergeParams: true });
mgmt.use(requireMgmt);

function parseRound(req, res) {
  const round = Number(req.params.round);
  if (![1, 2].includes(round)) { fail(res, 400, 'round must be 1 or 2'); return null; }
  return round;
}

mgmt.get('/candidates/:id/eval/:round', handle(async (req, res) => {
  const round = parseRound(req, res);
  if (!round) return;
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  let ev = await TrkMgmtEval.findOne({ candidateId: cand._id, round }).lean();
  if (!ev) {
    const { questions, version } = await templateQuestions(cand.positionId, round === 1 ? 'MGMT_R1' : 'MGMT_R2');
    ev = {
      candidateId: cand._id, round, answers: snapshotAnswers(questions), templateVersion: version,
      status: 'DRAFT', recommendation: '', summary: '', strengths: '', concerns: '', requiresSecondRound: false, score: null, isNew: true
    };
  }
  res.json({ evaluation: ev, calc: computeScore(ev.answers) });
}));

mgmt.put('/candidates/:id/eval/:round', handle(async (req, res) => {
  const round = parseRound(req, res);
  if (!round) return;
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  if (cand.status !== 'ACTIVE') return fail(res, 409, 'Resume the candidate before editing this evaluation');
  const stageKey = round === 1 ? 'MGMT_R1' : 'MGMT_R2';
  if (stageIndex(cand.stage) < stageIndex(stageKey)) {
    return fail(res, 409, round === 1 ? 'Candidate has not cleared HR screening yet' : '2nd round has not been requested');
  }
  if (round === 2 && !cand.r2Required) return fail(res, 409, '2nd round has not been requested');

  const a = actor(req);
  const assigned = cand[round === 1 ? 'r1' : 'r2'].interviewerId;
  if (assigned && assigned !== a.id && !req.trk.decide) {
    return fail(res, 403, `This round is assigned to ${cand[round === 1 ? 'r1' : 'r2'].interviewerName || 'another interviewer'}`);
  }
  let ev = await TrkMgmtEval.findOne({ candidateId: cand._id, round });
  const locked = ev?.status === 'SUBMITTED' && cand.stage !== stageKey;
  if (locked && !req.trk.override) return fail(res, 409, 'This round is locked because the candidate has moved on');
  if (!ev) {
    const { questions, version } = await templateQuestions(cand.positionId, stageKey);
    if (!questions.length) return fail(res, 409, 'No questionnaire configured for this round');
    ev = new TrkMgmtEval({ candidateId: cand._id, positionId: cand.positionId, round, templateVersion: version, answers: snapshotAnswers(questions) });
  }
  mergeAnswers(ev, req.body?.answers);
  for (const f of ['summary', 'strengths', 'concerns']) {
    if (req.body?.[f] !== undefined) ev[f] = str(req.body[f], 4000);
  }
  if (req.body?.recommendation !== undefined) {
    ev.recommendation = TRK_RECOMMENDATIONS.includes(req.body.recommendation) ? req.body.recommendation : '';
  }
  if (round === 1 && req.body?.requiresSecondRound !== undefined) ev.requiresSecondRound = Boolean(req.body.requiresSecondRound);
  ev.evaluatorId = a.id;
  ev.evaluatorName = a.name;
  const calc = computeScore(ev.answers);
  ev.score = calc.score;
  const submit = Boolean(req.body?.submit) || ev.status === 'SUBMITTED';
  if (submit) {
    const err = validateSubmit(ev);
    if (err) return fail(res, 422, err);
    ev.status = 'SUBMITTED';
    ev.submittedAt = new Date();
  } else {
    ev.status = 'DRAFT';
  }
  await ev.save();

  const roundKey = round === 1 ? 'r1' : 'r2';
  cand[`${roundKey}EvalStatus`] = ev.status;
  if (submit) {
    cand[roundKey].status = 'COMPLETED';
    cand[roundKey].completedAt = new Date();
    if (!cand[roundKey].interviewerName) {
      cand[roundKey].interviewerId = a.id;
      cand[roundKey].interviewerName = a.name;
    }
    // Activity entry deliberately carries no score / recommendation.
    pushHistory(cand, req, { type: 'EVAL', summary: `${round === 1 ? '1st' : '2nd'} round evaluation submitted` });
    if (round === 1 && cand.stage === 'MGMT_R1') cand.r2Required = ev.requiresSecondRound;
    if (cand.stage === stageKey) {
      const to = round === 1 && cand.r2Required ? 'MGMT_R2' : 'DECISION';
      moveStage(cand, req, to);
      applyStageDefaults(cand);
    }
  }
  await cand.save();
  res.json({ evaluation: ev, calc, candidate: serializeCandidate(cand, req.trk) });
}));

mgmt.post('/candidates/:id/second-round', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  const required = Boolean(req.body?.required);
  if (cand.status !== 'ACTIVE') return fail(res, 409, 'Candidate is not active');
  if (!['MGMT_R1', 'MGMT_R2', 'DECISION'].includes(cand.stage)) return fail(res, 409, '2nd round can only be set after HR screening');
  if (!required && cand.r2EvalStatus !== 'NOT_STARTED') return fail(res, 409, '2nd round evaluation has already started');
  cand.r2Required = required;
  pushHistory(cand, req, { type: 'NOTE', summary: required ? '2nd round requested' : '2nd round not required' });
  if (required && cand.stage === 'DECISION') {
    moveStage(cand, req, 'MGMT_R2');
  } else if (!required && cand.stage === 'MGMT_R2') {
    moveStage(cand, req, 'DECISION');
  }
  applyStageDefaults(cand);
  await cand.save();
  res.json({ candidate: serializeCandidate(cand, req.trk) });
}));

mgmt.get('/candidates/:id/summary', handle(async (req, res) => {
  const cand = await loadCandidate(req, res);
  if (!cand) return;
  const evals = await TrkMgmtEval.find({ candidateId: cand._id }, { answers: 0 }).lean();
  res.json({ evaluations: evals });
}));

router.use('/mgmt', mgmt);

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

router.get('/dashboard', handle(async (req, res) => {
  const filter = buildFilter(req.query);
  const [candidates, positions] = await Promise.all([
    TrkCandidate.find(filter).lean(),
    TrkPosition.find({}).sort({ sortOrder: 1 }).lean()
  ]);
  const count = (key) => candidates.filter(BUCKETS[key]).length;
  const total = candidates.length;
  const selected = count('selected');

  const kpis = {
    total,
    shortlisted: total,
    hrDone: count('hr_done'),
    hrCleared: count('hr_cleared'),
    r1Done: count('r1_done'),
    r2Done: count('r2_done'),
    selected,
    rejected: count('rejected'),
    withdrawn: count('withdrawn'),
    onHold: count('on_hold'),
    conversion: total ? Math.round((selected / total) * 1000) / 10 : 0
  };
  if (req.trk.mgmt) kpis.overrides = candidates.reduce((s, c) => s + (c.overrideCount || 0), 0);

  const funnel = FUNNEL.map((f) => ({ key: f.key, label: f.label, count: candidates.filter(f.test).length }));
  funnel.forEach((f, i) => {
    const prev = i === 0 ? null : funnel[i - 1].count;
    f.fromPrevPct = prev ? Math.round((f.count / prev) * 100) : null;
    f.ofTotalPct = total ? Math.round((f.count / total) * 100) : 0;
  });

  const queues = {
    pending_hr: count('pending_hr'),
    pending_r1: count('pending_r1'),
    pending_r2: count('pending_r2'),
    awaiting_decision: count('awaiting_decision'),
    overdue: count('overdue'),
    stale: count('stale')
  };

  const posRows = positions.map((p) => {
    const mine = candidates.filter((c) => String(c.positionId) === String(p._id));
    const by = (stage) => mine.filter((c) => c.status === 'ACTIVE' && c.stage === stage).length;
    return {
      positionId: p._id, title: p.title, openings: p.openings, total: mine.length,
      shortlisted: by('SHORTLISTED'), hr: by('HR_SCREENING'), r1: by('MGMT_R1'), r2: by('MGMT_R2'), decision: by('DECISION'),
      onHold: mine.filter(BUCKETS.on_hold).length,
      rejected: mine.filter(BUCKETS.rejected).length,
      selected: mine.filter(BUCKETS.selected).length
    };
  }).filter((r) => (isId(req.query.positionId)
    ? String(r.positionId) === String(req.query.positionId)
    : r.total > 0 || positions.find((p) => String(p._id) === String(r.positionId))?.isActive));

  // Time spent per stage, from stage history.
  const stageDays = Object.fromEntries(TRK_STAGES.map((s) => [s, []]));
  const now = new Date();
  for (const c of candidates) {
    const moves = (c.history || []).filter((h) => h.type === 'STAGE' || h.type === 'CREATED');
    for (let i = 0; i < moves.length; i += 1) {
      const stage = moves[i].toStage;
      if (!stageDays[stage]) continue;
      const end = moves[i + 1]?.at || (c.status === 'ACTIVE' ? now : (c.decision?.at || c.updatedAt));
      stageDays[stage].push(Math.max(0, daysBetween(moves[i].at, end)));
    }
  }
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : null);
  const timeInStage = TRK_STAGES.map((s) => ({ stage: s, label: STAGE_LABELS[s], avgDays: avg(stageDays[s]), samples: stageDays[s].length }));

  const decided = candidates.filter((c) => c.decision?.at);
  const turnaround = decided.map((c) => daysBetween(c.createdAt, c.decision.at));
  const sorted = [...turnaround].sort((a, b) => a - b);
  const median = sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10 : null;

  const hrScores = candidates.filter((c) => c.hr?.status === 'SUBMITTED' && c.hr.score != null).map((c) => c.hr.score);
  const scores = { hrAvg: avg(hrScores), hrSamples: hrScores.length };
  if (req.trk.mgmt) {
    const ids = candidates.map((c) => c._id);
    const mg = await TrkMgmtEval.find({ candidateId: { $in: ids }, status: 'SUBMITTED' }, { score: 1, round: 1 }).lean();
    const r1 = mg.filter((e) => e.round === 1 && e.score != null).map((e) => e.score);
    const r2 = mg.filter((e) => e.round === 2 && e.score != null).map((e) => e.score);
    scores.r1Avg = avg(r1);
    scores.r1Samples = r1.length;
    scores.r2Avg = avg(r2);
    scores.r2Samples = r2.length;
  }

  const overdueList = candidates.filter(BUCKETS.overdue)
    .sort((a, b) => new Date(a.nextActionDue) - new Date(b.nextActionDue))
    .slice(0, 8)
    .map((c) => ({
      _id: c._id, name: c.name, stage: c.stage, nextAction: c.nextAction, nextActionDue: c.nextActionDue,
      owner: c.nextActionOwner, position: positions.find((p) => String(p._id) === String(c.positionId))?.title || ''
    }));

  const bottleneck = timeInStage
    .filter((t) => t.avgDays != null && t.stage !== 'DECISION')
    .sort((a, b) => b.avgDays - a.avgDays)[0] || null;

  res.json({
    kpis, funnel, queues, positions: posRows, timeInStage, scores, overdueList, bottleneck,
    turnaround: { avgDays: avg(turnaround), medianDays: median, samples: turnaround.length },
    caps: req.trk
  });
}));

export default router;
