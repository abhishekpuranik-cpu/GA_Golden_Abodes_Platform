/**
 * Scalable multi-level travel claim approval.
 * Chains are data (travelApprovalChains), not hardcoded names.
 */
import TravelApprovalChain from '../../models/adminServices/travel/ApprovalChain.js';
import { notDeletedFilter } from './mongoose.js';
import { getPolicy } from './travelRules.js';

export const MAX_APPROVAL_LEVELS = 5;

export function awaitingStatus(level) {
  return `AWAITING_L${level}`;
}

export function parseAwaitingLevel(status) {
  const m = /^AWAITING_L(\d+)$/.exec(String(status || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Load active chain for employee (entity-specific first, then global).
 */
export async function getApprovalChain(employeeUserId, entityTag = null) {
  const emp = String(employeeUserId);
  const base = notDeletedFilter({ employeeUserId: emp, isActive: true });
  let doc = null;
  if (entityTag) {
    doc = await TravelApprovalChain.findOne({ ...base, entityTag }).lean();
  }
  if (!doc) {
    doc = await TravelApprovalChain.findOne({
      ...base,
      $or: [{ entityTag: '' }, { entityTag: null }, { entityTag: { $exists: false } }]
    }).lean();
  }
  return doc;
}

/**
 * Snapshot chain onto a claim. Falls back to policy.finalApproverUserId,
 * then APPROVER_LOOKUP_EMAIL user, as single L1.
 */
export async function snapshotChainForClaim(employeeUserId, entityTag) {
  const chain = await getApprovalChain(employeeUserId, entityTag);
  if (chain?.levels?.length) {
    return chain.levels.map((l) => ({
      level: l.level,
      approverUserId: String(l.approverUserId),
      label: l.label || `L${l.level}`
    }));
  }

  const policy = await getPolicy(entityTag);
  let finalId = policy.finalApproverUserId ? String(policy.finalApproverUserId) : null;
  const altId = policy.alternateApproverUserId ? String(policy.alternateApproverUserId) : null;

  if (!finalId) {
    try {
      const { ensureMongo } = await import('../mongo.js');
      const { APPROVER_LOOKUP_EMAIL } = await import('./constants.js');
      const db = await ensureMongo();
      const u = await db?.collection('auth_users').findOne({
        email: APPROVER_LOOKUP_EMAIL.toLowerCase(),
        status: { $ne: 'disabled' }
      });
      if (u?._id) finalId = String(u._id);
    } catch {
      /* ignore lookup failure */
    }
  }

  if (!finalId) {
    const err = new Error(
      'No approval chain for this employee and no finalApproverUserId on policy — set a chain in Setup'
    );
    err.status = 409;
    err.code = 'NO_APPROVAL_CHAIN';
    throw err;
  }
  // Self-claim: route L1 to alternate when employee is the final approver (BR-04)
  const emp = String(employeeUserId);
  if (finalId === emp) {
    if (!altId) {
      const err = new Error('Self-approval blocked: set alternateApproverUserId or an approval chain (BR-04)');
      err.status = 403;
      err.code = 'ALTERNATE_APPROVER_REQUIRED';
      throw err;
    }
    return [{ level: 1, approverUserId: altId, label: 'L1 (alternate)' }];
  }
  return [{ level: 1, approverUserId: finalId, label: 'L1 (final)' }];
}

export function assertCanApproveLevel(claim, actorId, { allowStaffOverride = false, isStaff = false } = {}) {
  const level = claim.pendingApprovalLevel || parseAwaitingLevel(claim.status);
  if (!level) {
    const err = new Error(`Claim is not awaiting approval (status=${claim.status})`);
    err.status = 409;
    throw err;
  }
  const step = (claim.approvalChainSnapshot || []).find((l) => l.level === level);
  if (!step) {
    const err = new Error(`No snapshot step for level ${level}`);
    err.status = 409;
    throw err;
  }
  if (String(actorId) === String(claim.employeeId)) {
    const err = new Error('No self-approve (BR-04)');
    err.status = 403;
    err.code = 'NO_SELF_APPROVAL';
    throw err;
  }
  if (String(actorId) !== String(step.approverUserId)) {
    if (allowStaffOverride && isStaff) return { level, step, override: true };
    const err = new Error(`Only the L${level} approver can act on this claim`);
    err.status = 403;
    err.code = 'WRONG_APPROVER_LEVEL';
    throw err;
  }
  return { level, step, override: false };
}

/**
 * Apply one approve step. Returns next status.
 */
export function nextStatusAfterApprove(claim) {
  const level = claim.pendingApprovalLevel || parseAwaitingLevel(claim.status);
  const chain = claim.approvalChainSnapshot || [];
  const maxLevel = chain.length || 1;
  if (level >= maxLevel) return 'APPROVED';
  return awaitingStatus(level + 1);
}

export function applyLevelApprove(claim, { by, comment } = {}) {
  const level = claim.pendingApprovalLevel || parseAwaitingLevel(claim.status);
  if (!Array.isArray(claim.levelApprovals)) claim.levelApprovals = [];
  claim.levelApprovals.push({
    level,
    by,
    comment: comment || '',
    at: new Date()
  });
  const next = nextStatusAfterApprove(claim);
  const from = claim.status;
  if (!Array.isArray(claim.stateHistory)) claim.stateHistory = [];
  claim.stateHistory.push({
    from,
    to: next,
    action: `approve_l${level}`,
    by,
    comment: comment || '',
    at: new Date()
  });
  claim.status = next;
  if (next === 'APPROVED') {
    claim.pendingApprovalLevel = null;
  } else {
    claim.pendingApprovalLevel = parseAwaitingLevel(next);
  }
  return next;
}
