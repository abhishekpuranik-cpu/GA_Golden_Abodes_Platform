import { isGstDemand, isPostStageDemand } from './demandAmounts.js';
import { compareMilestoneChronology } from './clpMilestoneOrder.js';

function needsOrderBackfill(clpRows) {
  if (clpRows.length < 2) return false;
  const orders = clpRows.map((d) => Number(d.milestoneOrder) || 0);
  const max = Math.max(...orders);
  const distinct = new Set(orders).size;
  if (max === 0) return true;
  if (distinct < clpRows.length * 0.5) return true;
  return false;
}

/** Persist upload-style sequence when milestoneOrder was never set (legacy imports). */
export async function backfillMilestoneOrders(Demand, demands = []) {
  const byUnit = new Map();
  for (const d of demands) {
    const k = String(d.unitId);
    if (!byUnit.has(k)) byUnit.set(k, []);
    byUnit.get(k).push(d);
  }

  const ops = [];
  for (const unitDemands of byUnit.values()) {
    const clp = unitDemands.filter((d) => !isGstDemand(d) && !isPostStageDemand(d));
    if (!needsOrderBackfill(clp)) continue;
    const sorted = [...clp].sort(compareMilestoneChronology);
    sorted.forEach((d, i) => {
      if ((Number(d.milestoneOrder) || 0) === i) return;
      ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { milestoneOrder: i } } } });
      d.milestoneOrder = i;
    });
  }

  if (ops.length) await Demand.bulkWrite(ops, { ordered: false });
  return ops.length;
}

export async function backfillPostStageOrders(Demand, demands = []) {
  const byUnit = new Map();
  for (const d of demands) {
    if (!isGstDemand(d) && !isPostStageDemand(d)) continue;
    const k = String(d.unitId);
    if (!byUnit.has(k)) byUnit.set(k, []);
    byUnit.get(k).push(d);
  }

  const ops = [];
  for (const rows of byUnit.values()) {
    rows.sort(compareMilestoneChronology);
    rows.forEach((d, i) => {
      const target = 900 + i;
      if ((Number(d.milestoneOrder) || 0) === target) return;
      ops.push({ updateOne: { filter: { _id: d._id }, update: { $set: { milestoneOrder: target } } } });
      d.milestoneOrder = target;
    });
  }

  if (ops.length) await Demand.bulkWrite(ops, { ordered: false });
  return ops.length;
}
