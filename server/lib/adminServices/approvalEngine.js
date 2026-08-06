/**
 * Generic approval engine for Admin Services shell.
 * Tab features configure transitions; they do not embed approval logic.
 */

/**
 * @typedef {{ from: string, action: string, to: string }} Transition
 */

/**
 * @param {Transition[]} transitions
 * @param {string} fromStatus
 * @param {string} action
 * @returns {string|null} next status
 */
export function nextStatus(transitions, fromStatus, action) {
  const row = transitions.find(
    (t) => t.from === fromStatus && t.action === action
  );
  return row ? row.to : null;
}

export function assertTransition(transitions, fromStatus, action) {
  const to = nextStatus(transitions, fromStatus, action);
  if (!to) {
    const err = new Error(`Invalid transition: ${fromStatus} --${action}--> ?`);
    err.code = 'INVALID_TRANSITION';
    err.status = 409;
    throw err;
  }
  return to;
}

/**
 * Append a state-history entry onto a document (mutates).
 */
export function pushStateHistory(doc, { from, to, action, by, comment }) {
  if (!Array.isArray(doc.stateHistory)) doc.stateHistory = [];
  doc.stateHistory.push({
    from: from || null,
    to,
    action,
    by: by || null,
    comment: comment || '',
    at: new Date()
  });
  doc.status = to;
  return doc;
}

/** Trip-level machine (§5.2) */
export const TRIP_TRANSITIONS = [
  { from: 'DRAFT', action: 'submit', to: 'SUBMITTED' },
  { from: 'RETURNED', action: 'submit', to: 'SUBMITTED' },
  { from: 'SUBMITTED', action: 'verify', to: 'VERIFIED' },
  { from: 'SUBMITTED', action: 'return', to: 'RETURNED' },
  { from: 'VERIFIED', action: 'return', to: 'RETURNED' },
  { from: 'SUBMITTED', action: 'reject', to: 'REJECTED' },
  { from: 'VERIFIED', action: 'reject', to: 'REJECTED' },
  { from: 'RETURNED', action: 'reject', to: 'REJECTED' }
];

/** Claim-level machine — multi-level approve via AWAITING_L1…L5 */
export const CLAIM_TRANSITIONS = [
  { from: 'OPEN', action: 'submit', to: 'AWAITING_L1' },
  { from: 'RETURNED', action: 'submit', to: 'AWAITING_L1' },
  { from: 'SUBMITTED', action: 'verify', to: 'VERIFIED' },
  { from: 'SUBMITTED', action: 'start_approval', to: 'AWAITING_L1' },
  { from: 'VERIFIED', action: 'start_approval', to: 'AWAITING_L1' },
  { from: 'AWAITING_L1', action: 'return', to: 'RETURNED' },
  { from: 'AWAITING_L2', action: 'return', to: 'RETURNED' },
  { from: 'AWAITING_L3', action: 'return', to: 'RETURNED' },
  { from: 'AWAITING_L4', action: 'return', to: 'RETURNED' },
  { from: 'AWAITING_L5', action: 'return', to: 'RETURNED' },
  { from: 'AWAITING_L1', action: 'reject', to: 'REJECTED' },
  { from: 'AWAITING_L2', action: 'reject', to: 'REJECTED' },
  { from: 'AWAITING_L3', action: 'reject', to: 'REJECTED' },
  { from: 'AWAITING_L4', action: 'reject', to: 'REJECTED' },
  { from: 'AWAITING_L5', action: 'reject', to: 'REJECTED' },
  { from: 'SUBMITTED', action: 'reject', to: 'REJECTED' },
  { from: 'VERIFIED', action: 'reject', to: 'REJECTED' },
  { from: 'APPROVED', action: 'pay', to: 'PAID' }
];

/** Legacy single-step approve kept for engine tests; live path uses applyLevelApprove. */
export const CLAIM_LEGACY_APPROVE = [
  { from: 'VERIFIED', action: 'approve', to: 'APPROVED' }
];

export function applyTransition(doc, transitions, action, { by, comment } = {}) {
  const from = doc.status;
  const to = assertTransition(transitions, from, action);
  pushStateHistory(doc, { from, to, action, by, comment });
  return to;
}
