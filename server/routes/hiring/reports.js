import { Router } from 'express';
import XLSX from 'xlsx';
import HiringRequisition from '../../models/hiring/Requisition.js';
import HiringCandidate from '../../models/hiring/Candidate.js';
import HiringActivityLog from '../../models/hiring/ActivityLog.js';
import { notDeletedFilter } from '../../lib/hiring/validate.js';
import { STAGE_LABELS } from '../../lib/hiring/constants.js';

const router = Router();

function buildReqFilter(query) {
  const filter = notDeletedFilter();
  if (query.entityTag) filter.entityTag = query.entityTag;
  if (query.location) filter.location = query.location;
  if (query.projectName) filter.projectName = new RegExp(String(query.projectName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (query.department) filter.department = new RegExp(String(query.department).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (query.status) filter.status = query.status;
  if (query.role) filter.role = new RegExp(String(query.role).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return filter;
}

function formatBand(min, max) {
  if (!min && !max) return '';
  const l = (v) => (v ? `${(v / 10000000).toFixed(1)} L` : '—');
  return `${l(min)} – ${l(max)}`;
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}

async function stageMilestonesForReq(requisitionId, candidateIds) {
  const milestones = {};
  const logs = await HiringActivityLog.find({
    $or: [
      { refType: 'requisition', refId: requisitionId },
      { refType: 'candidate', refId: { $in: candidateIds }, action: { $in: ['stage_change', 'hired'] } }
    ]
  }).sort({ at: 1 }).lean();

  const reqStatusAt = {};
  logs.forEach((l) => {
    if (l.refType === 'requisition') {
      if (l.action === 'created' && !milestones.opened) milestones.opened = l.at;
      if (l.action === 'metaview_search_started' && !milestones.sourcingStarted) milestones.sourcingStarted = l.at;
      if (l.action === 'hiring_fulfilled') milestones.fulfilled = l.at;
      if ((l.action === 'updated' || l.action === 'scrapped' || l.action === 'hiring_fulfilled') && l.detail) {
        reqStatusAt[l.detail] = l.at;
      }
    }
    if (l.refType === 'candidate' && l.action === 'stage_change' && l.detail) {
      const m = l.detail.match(/→\s*(\d+)/);
      if (!m) return;
      const stage = Number(m[1]);
      const key = `stage_${stage}`;
      if (!milestones[key]) milestones[key] = l.at;
    }
    if (l.refType === 'candidate' && l.action === 'hired' && !milestones.firstHired) {
      milestones.firstHired = l.at;
    }
  });

  milestones.statusAt = reqStatusAt;

  const cands = await HiringCandidate.find({ _id: { $in: candidateIds } }).select('stageHistory currentStageNumber stageEnteredAt createdAt').lean();
  cands.forEach((c) => {
    (c.stageHistory || []).forEach((h) => {
      const key = `stage_${h.stage}`;
      if (!milestones[key] || new Date(h.at) < new Date(milestones[key])) milestones[key] = h.at;
    });
    if (c.currentStageNumber >= 4 && !milestones.stage_4) milestones.stage_4 = c.stageEnteredAt || c.createdAt;
    if (c.currentStageNumber >= 6 && !milestones.stage_6) milestones.stage_6 = c.stageEnteredAt || c.createdAt;
    if (c.currentStageNumber === 7 && !milestones.firstHired) milestones.firstHired = c.stageEnteredAt || c.createdAt;
  });

  return milestones;
}

function movementSummary(milestones) {
  const parts = [];
  const order = [
    ['opened', 'Opened'],
    ['sourcingStarted', 'Sourcing'],
    ['stage_2', 'Screened'],
    ['stage_3', 'Shortlisted'],
    ['stage_4', 'Interview'],
    ['stage_6', 'Offer'],
    ['firstHired', 'First hire'],
    ['fulfilled', 'Fulfilled']
  ];
  order.forEach(([key, label]) => {
    if (milestones[key]) {
      const d = new Date(milestones[key]).toLocaleDateString('en-IN');
      parts.push(`${label}: ${d}`);
    }
  });
  return parts.join(' · ');
}

function reqStatusEnteredFromLogs(milestones, status) {
  if (!status) return null;
  if (status === 'Sourcing' && milestones.sourcingStarted) return milestones.sourcingStarted;
  if (status === 'Hiring Fulfilled' && milestones.fulfilled) return milestones.fulfilled;
  if (milestones.statusAt?.[status]) return milestones.statusAt[status];
  if (status === 'Draft' && milestones.opened) return milestones.opened;
  return null;
}

async function buildRequirementRows(filter) {
  const reqs = await HiringRequisition.find(filter).sort({ createdAt: -1 }).lean();
  const rows = await Promise.all(reqs.map(async (r) => {
    const candidates = await HiringCandidate.find({ requisitionId: r._id, isDeleted: false }).select('_id currentStageNumber').lean();
    const candIds = candidates.map((c) => c._id);
    const hired = candidates.filter((c) => c.currentStageNumber === 7).length;
    const pipeline = {};
    candidates.forEach((c) => {
      pipeline[c.currentStageNumber] = (pipeline[c.currentStageNumber] || 0) + 1;
    });
    const milestones = await stageMilestonesForReq(r._id, candIds);
    const opened = r.createdAt;
    const end = r.fulfilledAt || (['Closed', 'Cancelled', 'Hiring Fulfilled'].includes(r.status) ? r.updatedAt : new Date());
    const statusStart = r.statusEnteredAt
      || (reqStatusEnteredFromLogs(milestones, r.status))
      || opened;
    const daysInCurrentStage = daysBetween(statusStart, end);
    return {
      requisitionId: String(r._id),
      positionNumber: r.reqCode,
      role: r.role,
      department: r.department || '',
      project: r.projectName || '',
      location: r.location,
      entityTag: r.entityTag,
      band: formatBand(r.bandMinPaise, r.bandMaxPaise),
      experience: r.experienceMinYears != null || r.experienceMaxYears != null
        ? `${r.experienceMinYears ?? '—'} – ${r.experienceMaxYears ?? '—'} yrs`
        : '',
      headcount: r.headcount || 1,
      hired,
      headcountRemaining: Math.max(0, (r.headcount || 1) - hired),
      status: r.status,
      openedAt: opened,
      openedDisplay: opened ? new Date(opened).toLocaleDateString('en-IN') : '',
      fulfilledAt: r.fulfilledAt || milestones.fulfilled || null,
      fulfilledDisplay: (r.fulfilledAt || milestones.fulfilled)
        ? new Date(r.fulfilledAt || milestones.fulfilled).toLocaleDateString('en-IN')
        : '',
      daysOpen: daysBetween(opened, end),
      daysInCurrentStage,
      statusEnteredAt: statusStart,
      totalCandidates: candidates.length,
      pipelineSummary: Object.entries(pipeline).map(([s, n]) => `${STAGE_LABELS[s] || s}: ${n}`).join(', '),
      movementSummary: movementSummary(milestones),
      milestones,
      hasJd: !!(r.attachments || []).some((a) => a.kind === 'jd'),
      hasEmail: !!(r.attachments || []).some((a) => a.kind === 'email'),
      metaviewSearchId: r.metaviewSearchId || ''
    };
  }));
  return rows;
}

router.get('/requirements', async (req, res) => {
  try {
    const filter = buildReqFilter(req.query);
    const rows = await buildRequirementRows(filter);
    res.json({ requirements: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/requirements/export', async (req, res) => {
  try {
    const filter = buildReqFilter(req.query);
    const rows = await buildRequirementRows(filter);
    const sheetRows = rows.map((r) => ({
      'Position #': r.positionNumber,
      Role: r.role,
      Department: r.department,
      Project: r.project,
      Location: r.location,
      Entity: r.entityTag,
      Band: r.band,
      Experience: r.experience,
      Headcount: r.headcount,
      Hired: r.hired,
      Remaining: r.headcountRemaining,
      Status: r.status,
      Opened: r.openedDisplay,
      Fulfilled: r.fulfilledDisplay,
      'Days open': r.daysOpen ?? '',
      'Days in current stage': r.daysInCurrentStage ?? '',
      Candidates: r.totalCandidates,
      Pipeline: r.pipelineSummary,
      'Stage movements': r.movementSummary,
      'JD attached': r.hasJd ? 'Yes' : 'No',
      'Email attached': r.hasEmail ? 'Yes' : 'No'
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [{ Note: 'No requirements' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Requirements');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="hiring-requirements-${stamp}.xlsx"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export { buildReqFilter };
export default router;
