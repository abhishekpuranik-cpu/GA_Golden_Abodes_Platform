export const STAGES = ['SHORTLISTED', 'HR_SCREENING', 'MGMT_R1', 'MGMT_R2', 'DECISION'];

export const STAGE_LABEL = {
  SHORTLISTED: 'Shortlisted',
  HR_SCREENING: 'HR Screening',
  MGMT_R1: '1st Round',
  MGMT_R2: '2nd Round',
  DECISION: 'Decision'
};

export const STATUS_LABEL = {
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  SELECTED: 'Selected'
};

export const REC_LABEL = {
  RECOMMENDED: 'Recommended',
  NOT_RECOMMENDED: 'Not recommended',
  HOLD: 'Hold'
};

export const ROUND_STATUS_LABEL = {
  NOT_SCHEDULED: 'Not scheduled',
  SCHEDULED: 'Scheduled',
  NO_SHOW: 'No-show',
  COMPLETED: 'Completed'
};

export const REASON_LABEL = {
  NOT_SUITABLE: 'Not suitable for role',
  CTC_MISMATCH: 'CTC mismatch',
  NOTICE_PERIOD: 'Notice period too long',
  COMMUNICATION: 'Communication / presentation',
  EXPERIENCE_GAP: 'Experience gap',
  CANDIDATE_WITHDREW: 'Candidate withdrew',
  OFFER_DECLINED: 'Offer declined',
  NO_SHOW: 'Did not attend',
  POSITION_ON_HOLD: 'Position on hold',
  BETTER_CANDIDATE: 'Stronger candidate selected',
  OTHER: 'Other'
};

export const MODE_LABEL = { IN_PERSON: 'In person', VIDEO: 'Video', PHONE: 'Phone' };

export function fmtDate(d, withTime = false) {
  if (!d) return '—';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-IN', withTime
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' });
}

export function daysSince(d) {
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86400000));
}

export function isOverdue(c) {
  return ['ACTIVE', 'ON_HOLD'].includes(c.status) && c.nextActionDue && new Date(c.nextActionDue).getTime() < Date.now();
}

export function scoreTone(score) {
  if (score == null) return '';
  if (score >= 3.5) return 'good';
  if (score >= 2.5) return 'mid';
  return 'low';
}

export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

/** Datetime-local input value from an ISO date. */
export function toLocalInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}
