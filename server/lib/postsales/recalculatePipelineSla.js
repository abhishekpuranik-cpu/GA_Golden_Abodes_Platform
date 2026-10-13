/**
 * Re-apply Step SLA settings to existing pipeline steps (steps 1–20 except CLP step 12).
 * Does not modify Demand rows, CLP letter tasks, or construction milestone dates.
 */
import Unit from '../../models/postsales/Unit.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import { CLP_STEP } from './clpLetterTasks.js';
import { getResolvedStepDef } from './activityCatalog.js';
import { addCalendarDays, addWorkingDays } from './helpers.js';
import { invalidateHttpCache } from './httpCache.js';

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function possessionAnchor(stepsByNumber) {
  const s14 = stepsByNumber[14];
  if (!s14) return null;
  const raw = s14.completedDate || s14.dueDate || s14.triggerDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function previousMainStepNumber(n) {
  let p = n - 1;
  while (p >= 1) {
    if (p !== CLP_STEP) return p;
    p -= 1;
  }
  return null;
}

/** SLA due date with booking / possession anchors from step definition. */
export function computeDueDateForUnit(stepDef, triggerDate, unit, stepsByNumber) {
  if (!stepDef?.slaDays) return null;
  const unitLabel = String(stepDef.slaUnit || 'calendar days').toLowerCase();
  let base = triggerDate ? new Date(triggerDate) : new Date();

  if (unitLabel.includes('from booking') && unit?.bookingDate) {
    base = new Date(unit.bookingDate);
  } else if (unitLabel.includes('from possession')) {
    const pos = possessionAnchor(stepsByNumber);
    if (pos) base = pos;
  }

  if (Number.isNaN(base.getTime())) base = new Date();

  if (unitLabel.includes('working')) return addWorkingDays(base, stepDef.slaDays);
  return addCalendarDays(base, stepDef.slaDays);
}

function resolveTriggerDate(unit, step, stepsByNumber, chainAnchor) {
  if (step.triggerDate) {
    const t = new Date(step.triggerDate);
    if (!Number.isNaN(t.getTime())) return t;
  }
  if (chainAnchor) return new Date(chainAnchor);
  const prevNum = previousMainStepNumber(step.stepNumber);
  if (prevNum) {
    const prev = stepsByNumber[prevNum];
    if (prev?.completedDate) return new Date(prev.completedDate);
    if (prev?.dueDate) return new Date(prev.dueDate);
  }
  if (unit?.bookingDate) return new Date(unit.bookingDate);
  return new Date();
}

function stepNeedsRecalc(step) {
  if (!step || step.stepNumber === CLP_STEP) return false;
  return step.status === 'completed' || step.status === 'in_progress' || step.status === 'overdue';
}

/**
 * @returns {{ stepsTouched: number, fieldsUpdated: number, skippedPending: number }}
 */
export async function recalculateUnitPipelineSla(unit, steps, { dryRun = false } = {}) {
  const stepsByNumber = Object.fromEntries(steps.map((s) => [s.stepNumber, s]));
  let fieldsUpdated = 0;
  let stepsTouched = 0;
  let skippedPending = 0;

  let chainAnchor = unit?.bookingDate ? new Date(unit.bookingDate) : null;

  for (let num = 1; num <= 20; num += 1) {
    if (num === CLP_STEP) continue;

    const step = stepsByNumber[num];
    if (!step) continue;

    if (step.status === 'pending') {
      skippedPending += 1;
      continue;
    }

    if (!stepNeedsRecalc(step)) continue;

    const def = getResolvedStepDef(num);
    const trigger = resolveTriggerDate(unit, step, stepsByNumber, chainAnchor);
    const dueDate = computeDueDateForUnit(def, trigger, unit, stepsByNumber);

    const patch = {};
    const now = new Date();

    if (step.status !== 'completed') {
      if (!step.triggerDate || new Date(step.triggerDate).getTime() !== trigger.getTime()) {
        patch.triggerDate = trigger;
      }
    }

    if (dueDate) {
      const dueMs = dueDate.getTime();
      if (!step.dueDate || new Date(step.dueDate).getTime() !== dueMs) {
        patch.dueDate = dueDate;
      }
    }

    if (step.status === 'in_progress' || step.status === 'overdue') {
      const breach = dueDate ? startOfDay(dueDate).getTime() < startOfDay(now).getTime() : false;
      if (Boolean(step.slaBreach) !== breach) patch.slaBreach = breach;
      const wantStatus = breach ? 'overdue' : 'in_progress';
      if (step.status !== wantStatus && step.status !== 'completed') patch.status = wantStatus;
      if (breach && dueDate) {
        const days = Math.floor((now - dueDate) / (86400000));
        if (step.slaBreachDays !== days) patch.slaBreachDays = Math.max(0, days);
      } else if (step.slaBreachDays) {
        patch.slaBreachDays = 0;
      }
    }

    if (Object.keys(patch).length) {
      stepsTouched += 1;
      fieldsUpdated += Object.keys(patch).length;
      if (!dryRun) {
        await PipelineStep.updateOne({ _id: step._id }, { $set: patch });
        Object.assign(step, patch);
      }
    }

    if (step.status === 'completed') {
      chainAnchor = step.completedDate ? new Date(step.completedDate) : (dueDate || chainAnchor);
    } else if (dueDate) {
      chainAnchor = dueDate;
    }
  }

  return { stepsTouched, fieldsUpdated, skippedPending };
}

export async function recalculateAllPipelineSlas({ project, phase, dryRun = false } = {}) {
  const unitFilter = {};
  if (project) unitFilter.project = project;
  if (phase) unitFilter.phase = phase;

  const units = await Unit.find(unitFilter, { _id: 1, bookingDate: 1, project: 1, unitNumber: 1 }).lean();
  let unitsProcessed = 0;
  let stepsTouched = 0;
  let fieldsUpdated = 0;
  let skippedPending = 0;

  for (const unit of units) {
    const steps = await PipelineStep.find({ unitId: unit._id }).sort({ stepNumber: 1 });
    if (!steps.length) continue;
    const stats = await recalculateUnitPipelineSla(unit, steps, { dryRun });
    unitsProcessed += 1;
    stepsTouched += stats.stepsTouched;
    fieldsUpdated += stats.fieldsUpdated;
    skippedPending += stats.skippedPending;
  }

  if (!dryRun && unitsProcessed > 0) {
    invalidateHttpCache('tasks:');
    invalidateHttpCache('dashboard:');
  }

  return {
    dryRun,
    unitsProcessed,
    stepsTouched,
    fieldsUpdated,
    skippedPending,
    clpStepSkipped: CLP_STEP,
    note: 'CLP step 12, collection demands, and CLP letter tasks were not modified.',
  };
}
