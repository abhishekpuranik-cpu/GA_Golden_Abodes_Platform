import { STEPS } from './steps.js';

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
