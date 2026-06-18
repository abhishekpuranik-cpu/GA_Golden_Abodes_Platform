import { STEPS } from './steps.js';
import { getStepTaskKind, defaultAssigneeForKind } from './taskKinds.js';

export function getStepDef(stepNumber) {
  return STEPS.find((s) => s.number === stepNumber);
}

export function addCalendarDays(from, days) {
  const d = new Date(from);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

export function addWorkingDays(from, days) {
  const d = new Date(from);
  let remaining = Number(days || 0);
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) remaining -= 1;
  }
  return d;
}

export function computeDueDate(stepDef, triggerDate = new Date()) {
  if (!stepDef?.slaDays) return null;
  const unit = String(stepDef.slaUnit || 'calendar days');
  if (unit.includes('working')) return addWorkingDays(triggerDate, stepDef.slaDays);
  return addCalendarDays(triggerDate, stepDef.slaDays);
}

export function buildChecklist(stepDef, fundingType = 'home_loan') {
  if (stepDef.fundingTypeSplit) {
    const items = fundingType === 'self_funded' ? stepDef.selfFundedChecklist : stepDef.homeLoanChecklist;
    return (items || []).map((item) => ({ item, done: false }));
  }
  return (stepDef.checklist || []).map((item) => ({ item, done: false }));
}

export function buildPipelineStepDocs(unit, fundingType, { startedBy = unit.crmExecutive || '' } = {}) {
  const now = new Date();
  return STEPS.map((def) => {
    const taskKind = getStepTaskKind(def.number);
    const status = def.number === 1 ? 'in_progress' : 'pending';
    const triggerDate = def.number === 1 ? now : undefined;
    const dueDate = def.number === 1 ? computeDueDate(def, now) : undefined;
    const assignedTo = def.number === 1 ? defaultAssigneeForKind(unit, taskKind) : '';
    const activityLog = def.number === 1
      ? [{ action: 'started', at: now, by: startedBy, detail: `SLA due ${dueDate ? dueDate.toISOString().slice(0, 10) : '—'}` }]
      : [];
    return {
      unitId: unit._id,
      stepNumber: def.number,
      stepName: def.name,
      phase: def.phase,
      status,
      taskKind,
      assignedRole: def.assignedRole,
      assignedTo,
      triggerDate,
      dueDate,
      checklist: buildChecklist(def, fundingType),
      activityLog,
    };
  });
}

export async function backfillStepTaskKinds(steps, PipelineStep) {
  const missing = steps.filter((s) => !s.taskKind);
  if (!missing.length) return steps;
  await PipelineStep.bulkWrite(
    missing.map((s) => ({
      updateOne: {
        filter: { _id: s._id },
        update: { $set: { taskKind: getStepTaskKind(s.stepNumber) } },
      },
    }))
  );
  for (const s of missing) s.taskKind = getStepTaskKind(s.stepNumber);
  return steps;
}

export async function checkBlockedSteps(unitId, stepNumber, PipelineStep) {
  const def = getStepDef(stepNumber);
  if (!def?.blockedBy?.length) return null;
  const blockers = await PipelineStep.find({
    unitId,
    stepNumber: { $in: def.blockedBy },
    status: { $ne: 'completed' }
  }).lean();
  if (blockers.length) {
    const nums = blockers.map((b) => b.stepNumber).join(', ');
    return `Step ${nums} must be completed first.`;
  }
  return null;
}
