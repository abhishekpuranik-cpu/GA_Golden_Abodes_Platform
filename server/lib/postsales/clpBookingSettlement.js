import Demand from '../../models/postsales/Demand.js';
import { sortDemandsByClpChronology } from './clpMilestoneOrder.js';
import { agreementDueOnRow, isGstDemand, isPostStageDemand } from './demandAmounts.js';

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

/** Apply lump-sum disbursed amount at booking across CLP milestones in chronology (FIFO settlement). */
export async function applyBookingDisbursement(unit, demands, disbursedAmount) {
  const amount = num(disbursedAmount);
  if (amount <= 0) return { applied: 0, milestones: [] };

  const clpDemands = sortDemandsByClpChronology(
    demands.filter((d) => !isGstDemand(d) && !isPostStageDemand(d)),
  );

  let remaining = amount;
  const updates = [];
  const summary = [];

  for (const d of clpDemands) {
    if (remaining <= 0) break;
    const due = agreementDueOnRow(d);
    const already = num(d.paidAmount);
    const pending = Math.max(0, due - already);
    if (pending <= 0) continue;

    const apply = Math.min(pending, remaining);
    remaining -= apply;
    const newPaid = already + apply;

    await Demand.findByIdAndUpdate(d._id, {
      paidAmount: newPaid,
      paymentStatus: newPaid >= due ? 'paid' : (newPaid > 0 ? 'partial' : 'pending'),
      paidDate: newPaid > 0 ? new Date() : undefined,
    });

    summary.push({
      demandId: d._id,
      milestoneName: d.milestoneName,
      due,
      applied: apply,
      newPaid,
      pending: Math.max(0, due - newPaid),
    });
    updates.push(apply);
  }

  return { applied: amount - remaining, remaining, milestones: summary };
}
