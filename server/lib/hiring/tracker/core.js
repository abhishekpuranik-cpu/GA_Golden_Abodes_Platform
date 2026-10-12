import { TRK_STAGES } from '../../../models/hiring/Tracker.js';

export const STAGE_LABELS = {
  SHORTLISTED: 'Shortlisted',
  HR_SCREENING: 'HR Screening',
  MGMT_R1: '1st Round (Management)',
  MGMT_R2: '2nd Round',
  DECISION: 'Hiring Decision'
};

export function stageIndex(stage) {
  return TRK_STAGES.indexOf(stage);
}

/** Weighted average on a 1–5 scale over scored questions with weight > 0. */
export function computeScore(answers = []) {
  let num = 0;
  let den = 0;
  let scored = 0;
  let required = 0;
  for (const a of answers) {
    const w = Number(a.weight) || 0;
    if (w <= 0) continue;
    required += 1;
    const s = Number(a.score);
    if (!Number.isFinite(s) || s < 1 || s > 5) continue;
    scored += 1;
    num += s * w;
    den += w;
  }
  const score = den ? Math.round((num / den) * 100) / 100 : null;
  return {
    score,
    pct: score == null ? null : Math.round((score / 5) * 100),
    scored,
    required,
    complete: required > 0 && scored === required
  };
}

export function suggestedRecommendation(score) {
  if (score == null) return '';
  if (score >= 3.5) return 'RECOMMENDED';
  if (score >= 2.5) return 'HOLD';
  return 'NOT_RECOMMENDED';
}

export function actor(req) {
  const u = req.hiringUser || {};
  return { id: u.id || '', name: u.name || u.email || 'Unknown' };
}

export function pushHistory(cand, req, entry) {
  const a = actor(req);
  cand.history.push({ at: new Date(), byId: a.id, byName: a.name, ...entry });
}

/** Strip anything that could reveal management evaluation content. */
export function serializeCandidate(doc, caps) {
  const c = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  if (!caps.mgmt) {
    c.history = (c.history || []).map((h) => (h.confidential ? { ...h, note: '' } : h));
    if (c.statusReasonConfidential) c.statusReason = '';
    if (c.decision) c.decision = { ...c.decision, remarks: '' };
  }
  delete c.__v;
  return c;
}

const DAY = 86400000;

/** Queue predicates shared by the dashboard and the drill-down list. */
export const BUCKETS = {
  all: () => true,
  active: (c) => c.status === 'ACTIVE',
  hr_done: (c) => c.hr?.status === 'SUBMITTED',
  hr_cleared: (c) => c.hr?.status === 'SUBMITTED' && stageIndex(c.stage) >= stageIndex('MGMT_R1'),
  r1_done: (c) => c.r1EvalStatus === 'SUBMITTED',
  r2_done: (c) => c.r2EvalStatus === 'SUBMITTED',
  pending_hr: (c) => c.status === 'ACTIVE' && ['SHORTLISTED', 'HR_SCREENING'].includes(c.stage),
  pending_r1: (c) => c.status === 'ACTIVE' && c.stage === 'MGMT_R1',
  pending_r2: (c) => c.status === 'ACTIVE' && c.stage === 'MGMT_R2',
  awaiting_decision: (c) => c.status === 'ACTIVE' && c.stage === 'DECISION',
  selected: (c) => c.status === 'SELECTED',
  rejected: (c) => c.status === 'REJECTED',
  withdrawn: (c) => c.status === 'WITHDRAWN',
  on_hold: (c) => c.status === 'ON_HOLD',
  overdue: (c) => ['ACTIVE', 'ON_HOLD'].includes(c.status)
    && c.nextActionDue && new Date(c.nextActionDue).getTime() < Date.now(),
  stale: (c) => c.status === 'ACTIVE'
    && Date.now() - new Date(c.stageEnteredAt || c.createdAt).getTime() > 7 * DAY
};

/** Funnel "reached" predicates — a candidate counts once it has passed into the stage. */
export const FUNNEL = [
  { key: 'all', label: 'Shortlisted', test: () => true },
  { key: 'hr_done', label: 'HR screened', test: BUCKETS.hr_done },
  { key: 'hr_cleared', label: 'Cleared HR', test: BUCKETS.hr_cleared },
  { key: 'r1_done', label: '1st round done', test: BUCKETS.r1_done },
  { key: 'reached_decision', label: 'Reached decision', test: (c) => c.stage === 'DECISION' || Boolean(c.decision?.outcome) },
  { key: 'selected', label: 'Selected', test: BUCKETS.selected }
];
BUCKETS.reached_decision = FUNNEL[4].test;

export function daysBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY;
}
