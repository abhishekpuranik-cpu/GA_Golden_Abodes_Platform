import Demand from '../../models/postsales/Demand.js';
import Unit from '../../models/postsales/Unit.js';
import { formatMilestoneLabel } from './milestoneLabels.js';
import {
  createOrReopenClpLetterTask,
  ensureClpStationStep,
} from './clpLetterTasks.js';

export function buildEligibleUnitFilter(milestone) {
  const filter = {
    project: milestone.project,
    overallStatus: 'active',
    currentStepNumber: { $gte: 9 },
  };
  if (milestone.tower) {
    filter.$or = [{ building: milestone.tower }, { tower: milestone.tower }];
  }
  return filter;
}

async function upsertDemandForUnit({ unit, milestone, now }) {
  const label = formatMilestoneLabel(milestone.milestoneName);
  let demand = await Demand.findOne({
    unitId: unit._id,
    $or: [
      { milestoneId: milestone._id },
      { milestoneName: label },
      { milestoneName: milestone.milestoneName },
    ],
  });

  const demandAmount = (unit.totalCost || 0) * ((milestone.clpPercent || 0) / 100);
  const gstAmount = Math.round(demandAmount * 0.05);
  const totalAmount = demandAmount + gstAmount;
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + 14);

  if (demand) {
    if (!demand.milestoneId && milestone._id) demand.milestoneId = milestone._id;
    if (!demand.clpPercent && milestone.clpPercent) demand.clpPercent = milestone.clpPercent;
    if (!demand.demandAmount && demandAmount) {
      demand.demandAmount = demandAmount;
      demand.gstAmount = gstAmount;
      demand.totalAmount = totalAmount;
    }
    if (milestone.completedDate && !demand.actualDate) {
      demand.actualDate = milestone.completedDate;
    }
    await demand.save();
    return { demand, created: false };
  }

  demand = await Demand.create({
    unitId: unit._id,
    entity: unit.entity,
    milestoneId: milestone._id,
    milestoneName: label,
    clpPercent: milestone.clpPercent,
    demandAmount,
    gstAmount,
    totalAmount,
    issuedDate: now,
    dueDate,
    targetDate: dueDate,
    actualDate: milestone.completedDate || undefined,
    paymentStatus: 'pending',
    paidAmount: 0,
    source: 'manual',
  });
  return { demand, created: true };
}

export async function processClpMilestoneCompletion(milestone, { by = 'System', createDemands = true } = {}) {
  const units = await Unit.find(buildEligibleUnitFilter(milestone)).lean();
  const now = new Date();
  let tasksCreated = 0;
  let demandsCreated = 0;

  for (const unit of units) {
    let demand;
    if (createDemands) {
      const result = await upsertDemandForUnit({ unit, milestone, now });
      demand = result.demand;
      if (result.created) demandsCreated += 1;
    } else {
      demand = await Demand.findOne({
        unitId: unit._id,
        milestoneName: formatMilestoneLabel(milestone.milestoneName),
      });
      if (!demand) continue;
    }

    const task = await createOrReopenClpLetterTask({
      unit,
      demand,
      milestone,
      by,
      triggeredBy: 'construction_milestone',
    });
    if (task) tasksCreated += 1;
  }

  milestone.demandTriggerStatus = tasksCreated || demandsCreated ? 'triggered' : 'completed';
  milestone.demandsCreated = (milestone.demandsCreated || 0) + demandsCreated;
  milestone.tasksCreated = (milestone.tasksCreated || 0) + tasksCreated;
  await milestone.save();

  return {
    ok: true,
    tasksCreated,
    demandsCreated,
    unitsAffected: units.length,
    milestone,
  };
}

/** Single-unit CLP letter task from an existing demand row (Demands tab action). */
export async function activateClpLetterTaskFromDemand(demand, { by = 'Demands' } = {}) {
  const unit = await Unit.findById(demand.unitId).lean();
  if (!unit) throw new Error('Unit not found');

  const task = await createOrReopenClpLetterTask({
    unit,
    demand,
    by,
    triggeredBy: 'demand_actual_date',
  });

  return { step: await ensureClpStationStep(unit, by), activated: true, task, unitNumber: unit.unitNumber };
}

/** @deprecated use createOrReopenClpLetterTask — kept for imports */
export async function activateClpLetterTaskForUnit({ unit, milestone, by = 'System' }) {
  const now = new Date();
  const { demand } = await upsertDemandForUnit({ unit, milestone, now });
  const task = await createOrReopenClpLetterTask({ unit, demand, milestone, by, triggeredBy: 'legacy' });
  return { step: await ensureClpStationStep(unit, by), activated: !!task };
}
