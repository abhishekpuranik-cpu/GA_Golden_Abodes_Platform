import HiringRequisition from '../../models/hiring/Requisition.js';
import HiringCandidate from '../../models/hiring/Candidate.js';
import { logHiringActivity } from './activity.js';

export async function countHired(requisitionId) {
  return HiringCandidate.countDocuments({
    requisitionId,
    isDeleted: false,
    currentStageNumber: 7
  });
}

export async function markRequisitionFulfilled(requisition, { by, reason = 'headcount_met' }) {
  if (!requisition || requisition.status === 'Hiring Fulfilled') return requisition;
  requisition.status = 'Hiring Fulfilled';
  requisition.fulfilledAt = new Date();
  requisition.statusEnteredAt = new Date();
  if (!requisition.closedReason) {
    requisition.closedReason = reason === 'manual' ? 'Marked hiring fulfilled' : 'Required headcount hired';
  }
  await requisition.save();
  await logHiringActivity({
    refType: 'requisition',
    refId: requisition._id,
    action: 'hiring_fulfilled',
    detail: reason,
    by
  });
  return requisition;
}

export async function maybeAutoFulfillRequisition(requisitionId, by) {
  const requisition = await HiringRequisition.findById(requisitionId);
  if (!requisition || requisition.isDeleted) return null;
  if (['Hiring Fulfilled', 'Cancelled', 'Closed'].includes(requisition.status)) return requisition;
  const hired = await countHired(requisition._id);
  if (hired >= (requisition.headcount || 1)) {
    return markRequisitionFulfilled(requisition, { by, reason: 'headcount_met' });
  }
  return requisition;
}
