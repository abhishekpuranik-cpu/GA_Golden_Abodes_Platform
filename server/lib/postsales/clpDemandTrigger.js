import Demand from '../../models/postsales/Demand.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Unit from '../../models/postsales/Unit.js';
import { buildChecklist, computeDueDate, getStepDef } from './helpers.js';
import { formatMilestoneLabel } from './milestoneLabels.js';
import { defaultAssigneeForKind, getStepTaskKind } from './taskKinds.js';

const CLP_STEP = 12;

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

function milestoneSummary(milestone) {
  const name = formatMilestoneLabel(milestone.milestoneName);
  const pct = milestone.clpPercent != null ? `${milestone.clpPercent}%` : '';
  return pct ? `${name} (${pct})` : name;
}

export async function activateClpLetterTaskForUnit({ unit, milestone, by = 'System' }) {
  const def = getStepDef(CLP_STEP);
  const taskKind = getStepTaskKind(CLP_STEP);
  const now = new Date();
  const dueDate = computeDueDate(def, now);
  const assignedTo = defaultAssigneeForKind(unit, taskKind);
  const summary = milestoneSummary(milestone);
  const detail = `Issue CLP letters — ${summary}`;

  let step = await PipelineStep.findOne({ unitId: unit._id, stepNumber: CLP_STEP });
  let activated = false;

  if (!step) {
    step = await PipelineStep.create({
      unitId: unit._id,
      stepNumber: CLP_STEP,
      stepName: def?.name || 'CLP demand letter issuance',
      phase: def?.phase || 'clp',
      status: 'in_progress',
      taskKind,
      assignedRole: def?.assignedRole || 'CRM Executive',
      assignedTo,
      triggerDate: now,
      dueDate,
      nextAction: `Issue demand letter: ${formatMilestoneLabel(milestone.milestoneName)}`,
      nextActionDate: dueDate,
      notes: `Construction milestone completed — ${summary}`,
      checklist: buildChecklist(def, unit.fundingType),
      activityLog: [{ action: 'started', at: now, by, detail }],
    });
    activated = true;
  } else if (step.status === 'completed' || step.status === 'pending' || step.status === 'blocked') {
    step.status = 'in_progress';
    step.triggerDate = now;
    step.dueDate = dueDate;
    step.nextAction = `Issue demand letter: ${formatMilestoneLabel(milestone.milestoneName)}`;
    step.nextActionDate = dueDate;
    step.notes = `Construction milestone completed — ${summary}`;
    if (!step.assignedTo && assignedTo) step.assignedTo = assignedTo;
    step.activityLog = step.activityLog || [];
    step.activityLog.push({ action: 'started', at: now, by, detail });
    await step.save();
    activated = true;
  } else if (step.status === 'in_progress' || step.status === 'overdue') {
    step.nextAction = `Issue demand letter: ${formatMilestoneLabel(milestone.milestoneName)}`;
    step.nextActionDate = dueDate;
    step.notes = `Construction milestone completed — ${summary}`;
    step.activityLog = step.activityLog || [];
    step.activityLog.push({ action: 'note', at: now, by, detail: `New CLP milestone: ${summary}` });
    await step.save();
    activated = true;
  }

  if (activated && (unit.currentStepNumber || 1) < CLP_STEP) {
    await Unit.findByIdAndUpdate(unit._id, { currentStepNumber: CLP_STEP });
  }

  return { step, activated };
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
    if (!demand.milestoneId) {
      demand.milestoneId = milestone._id;
      demand.clpPercent = demand.clpPercent || milestone.clpPercent;
      if (!demand.demandAmount && demandAmount) {
        demand.demandAmount = demandAmount;
        demand.gstAmount = gstAmount;
        demand.totalAmount = totalAmount;
      }
      demand.clpLetterTaskAt = now;
      await demand.save();
    }
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
    paymentStatus: 'pending',
    paidAmount: 0,
    source: 'manual',
    clpLetterTaskAt: now,
  });
  return { demand, created: true };
}

export async function processClpMilestoneCompletion(milestone, { by = 'System', createDemands = true } = {}) {
  const units = await Unit.find(buildEligibleUnitFilter(milestone)).lean();
  const now = new Date();
  let tasksCreated = 0;
  let demandsCreated = 0;

  for (const unit of units) {
    const { activated } = await activateClpLetterTaskForUnit({ unit, milestone, by });
    if (activated) tasksCreated += 1;

    if (createDemands) {
      const { created } = await upsertDemandForUnit({ unit, milestone, now });
      if (created) demandsCreated += 1;
    }
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

  const milestone = {
    _id: demand.milestoneId,
    milestoneName: demand.milestoneName,
    clpPercent: demand.clpPercent,
    project: unit.project,
    tower: unit.building || unit.tower,
    completedDate: new Date(),
    loggedBy: by,
  };

  const { step, activated } = await activateClpLetterTaskForUnit({ unit, milestone, by });
  await Demand.findByIdAndUpdate(demand._id, { clpLetterTaskAt: new Date() });

  return { step, activated, unitNumber: unit.unitNumber };
}
