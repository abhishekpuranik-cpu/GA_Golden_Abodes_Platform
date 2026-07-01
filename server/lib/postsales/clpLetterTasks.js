import ClpLetterTask from '../../models/postsales/ClpLetterTask.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import ProjectClpSchedule from '../../models/postsales/ProjectClpSchedule.js';
import Unit from '../../models/postsales/Unit.js';
import { pushActivity } from './activity.js';
import { buildChecklist, computeDueDate, getStepDef } from './helpers.js';
import { formatMilestoneLabel } from './milestoneLabels.js';
import { milestoneKey } from './milestoneKey.js';
import { defaultAssigneeForKind, getStepTaskKind } from './taskKinds.js';

export const CLP_STEP = 12;

export function pushClpActivity(task, action, by, detail) {
  if (!task.activityLog) task.activityLog = [];
  task.activityLog.push({ action, at: new Date(), by: by || '', detail: detail || '' });
}

export function checklistComplete(list = []) {
  if (!list.length) return true;
  return list.every((c) => c.done);
}

export async function ensureClpStationStep(unit, by = 'System') {
  const def = getStepDef(CLP_STEP);
  const taskKind = getStepTaskKind(CLP_STEP);
  let step = await PipelineStep.findOne({ unitId: unit._id, stepNumber: CLP_STEP });

  if (!step) {
    step = await PipelineStep.create({
      unitId: unit._id,
      stepNumber: CLP_STEP,
      stepName: def?.name || 'CLP demand letter issuance',
      phase: def?.phase || 'clp',
      status: 'in_progress',
      taskKind,
      assignedRole: def?.assignedRole || 'CRM Executive',
      assignedTo: defaultAssigneeForKind(unit, taskKind),
      triggerDate: new Date(),
      dueDate: computeDueDate(def, new Date()),
      notes: 'CLP recurring station — one checklist per project milestone',
      checklist: buildChecklist(def, unit.fundingType || unit.customer?.fundingType),
      activityLog: [{ action: 'started', at: new Date(), by, detail: 'CLP station activated' }],
    });
  } else if (step.status === 'pending' || step.status === 'blocked') {
    step.status = 'in_progress';
    step.triggerDate = step.triggerDate || new Date();
    step.dueDate = step.dueDate || computeDueDate(def, step.triggerDate);
    pushActivity(step, 'started', by, 'CLP station reactivated');
    await step.save();
  } else if (step.status === 'completed') {
    step.status = 'in_progress';
    step.completedDate = undefined;
    step.completedBy = undefined;
    pushActivity(step, 'reopened', by, 'CLP station reopened — new milestone');
    await step.save();
  }

  if ((unit.currentStepNumber || 1) < CLP_STEP) {
    await Unit.findByIdAndUpdate(unit._id, { currentStepNumber: CLP_STEP });
  }

  return step;
}

export async function syncClpStationStatus(unitId, by = 'System') {
  const openCount = await ClpLetterTask.countDocuments({
    unitId,
    status: { $in: ['open', 'in_progress', 'delayed'] },
  });
  const step = await PipelineStep.findOne({ unitId, stepNumber: CLP_STEP });
  if (!step) return null;

  if (openCount > 0) {
    if (step.status !== 'in_progress' && step.status !== 'overdue') {
      step.status = 'in_progress';
      pushActivity(step, 'note', by, `${openCount} CLP letter task(s) active`);
      await step.save();
    }
    return step;
  }

  const total = await ClpLetterTask.countDocuments({ unitId });
  if (total > 0 && step.status !== 'completed') {
    step.status = 'completed';
    step.completedDate = new Date();
    step.completedBy = by;
    pushActivity(step, 'completed', by, 'All CLP installment checklists complete');
    await step.save();
  }
  return step;
}

export async function createOrReopenClpLetterTask({
  unit,
  milestoneName,
  clpPercent,
  achievedDate,
  scheduleOrder,
  demand,
  milestone = {},
  by = 'System',
  triggeredBy = 'milestone',
  initialStatus,
}) {
  const def = getStepDef(CLP_STEP);
  const taskKind = getStepTaskKind(CLP_STEP);
  const now = new Date();
  const dueDate = computeDueDate(def, now);
  const assignee = defaultAssigneeForKind(unit, taskKind);
  const label = formatMilestoneLabel(milestoneName || milestone.milestoneName || demand?.milestoneName);
  const key = milestoneKey(label);
  const pct = clpPercent ?? milestone.clpPercent ?? demand?.clpPercent;
  const achieved = parseAchieved(achievedDate || milestone.achievedDate || demand?.actualDate);
  const order = scheduleOrder ?? milestone.scheduleOrder ?? 0;
  const defaultOpen = achieved ? 'in_progress' : 'open';

  let task = await ClpLetterTask.findOne({
    unitId: unit._id,
    $or: [
      { milestoneKey: key },
      ...(demand?._id ? [{ demandId: demand._id }] : []),
    ],
  });

  if (task?.status === 'complete') {
    task.status = 'in_progress';
    task.completedAt = undefined;
    task.completedBy = undefined;
    task.dueDate = dueDate;
    task.triggeredBy = triggeredBy;
    if (achieved) task.achievedDate = achieved;
    pushClpActivity(task, 'reopened', by, `Reopened for ${label}`);
    await task.save();
  } else if (task) {
    task.milestoneKey = task.milestoneKey || key;
    task.milestoneName = label;
    task.clpPercent = pct ?? task.clpPercent;
    task.scheduleOrder = order;
    if (achieved) {
      task.achievedDate = achieved;
      if (task.status === 'open') task.status = 'in_progress';
    }
    task.status = task.status === 'delayed' ? 'in_progress' : (task.status || 'in_progress');
    task.dueDate = dueDate;
    task.triggeredBy = triggeredBy;
    if (!task.assignee && assignee) task.assignee = assignee;
    pushClpActivity(task, 'note', by, achieved ? `Milestone achieved — ${label}` : `Updated — ${label}`);
    await task.save();
  } else {
    task = await ClpLetterTask.create({
      unitId: unit._id,
      ...(demand?._id ? { demandId: demand._id } : {}),
      milestoneKey: key,
      milestoneName: label,
      clpPercent: pct,
      scheduleOrder: order,
      achievedDate: achieved || undefined,
      assignee,
      status: initialStatus || defaultOpen,
      dueDate,
      triggeredBy,
      checklist: buildChecklist(def, unit.fundingType || unit.customer?.fundingType),
      activityLog: [{
        action: 'created',
        at: now,
        by,
        detail: achieved
          ? `CLP letter — ${label}${pct != null ? ` (${pct}%)` : ''} · achieved ${achieved.toISOString().slice(0, 10)}`
          : `CLP letter — ${label}${pct != null ? ` (${pct}%)` : ''}`,
      }],
    });
  }

  await ensureClpStationStep(unit, by);
  return task;
}

function parseAchieved(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function taskSortKey(task) {
  if (task.scheduleOrder != null) return task.scheduleOrder;
  return task.createdAt ? new Date(task.createdAt).getTime() : 0;
}

/** Build Step 12 installment cards from project CLP schedule (Milestones tab). */
export async function ensureClpLetterTasksForUnit(unitId, by = 'Pipeline') {
  const unit = await Unit.findById(unitId).populate('customerId').lean();
  if (!unit) throw new Error('Unit not found');

  const legacy = await ClpLetterTask.find({
    unitId,
    $or: [{ milestoneKey: { $exists: false } }, { milestoneKey: null }, { milestoneKey: '' }],
  });
  for (const t of legacy) {
    if (!t.milestoneName) continue;
    t.milestoneKey = milestoneKey(t.milestoneName);
    try {
      await t.save();
    } catch {
      /* duplicate key — leave for manual cleanup */
    }
  }

  const schedule = await ProjectClpSchedule.findOne({ project: unit.project }).lean();
  const rows = (schedule?.rows || []).filter(
    (r) => r.milestone && !/^gst$/i.test(String(r.milestone).trim()),
  );

  if (!rows.length) {
    return {
      tasks: [],
      created: 0,
      total: 0,
      message: 'Add the project CLP schedule on the Milestones tab first.',
    };
  }

  let created = 0;
  for (const row of rows) {
    const key = milestoneKey(row.milestone);
    const existing = await ClpLetterTask.findOne({ unitId, milestoneKey: key });
    if (!existing) created += 1;
    await createOrReopenClpLetterTask({
      unit,
      milestoneName: row.milestone,
      clpPercent: row.percentDue,
      achievedDate: row.achievedDate,
      scheduleOrder: row.scheduleOrder,
      by,
      triggeredBy: 'auto_sync',
    });
  }

  await ensureClpStationStep(unit, by);
  const tasks = await listClpLetterTasksForUnit(unitId);
  return { tasks, created, total: rows.length };
}

export async function listClpLetterTasksForUnit(unitId, { status } = {}) {
  const filter = { unitId };
  if (status) filter.status = status;
  const tasks = await ClpLetterTask.find(filter).lean();
  tasks.sort((a, b) => taskSortKey(a) - taskSortKey(b)
    || String(a.milestoneName || '').localeCompare(String(b.milestoneName || '')));
  return tasks;
}

export async function getClpLetterTaskLog(taskId) {
  const task = await ClpLetterTask.findById(taskId).lean();
  if (!task) throw new Error('CLP letter task not found');
  return task.activityLog || [];
}

export async function updateClpLetterTaskStatus(taskId, status, by, note) {
  const task = await ClpLetterTask.findById(taskId);
  if (!task) throw new Error('CLP letter task not found');

  const prev = task.status;
  if (status === 'complete') {
    if (!checklistComplete(task.checklist)) {
      throw new Error('Complete all checklist items before marking this activity done.');
    }
    task.status = 'complete';
    task.completedAt = new Date();
    task.completedBy = by;
    pushClpActivity(task, 'completed', by, note || 'CLP letter activity completed');
  } else if (status === 'in_progress' && prev === 'complete') {
    task.status = 'in_progress';
    task.completedAt = undefined;
    task.completedBy = undefined;
    pushClpActivity(task, 'reopened', by, note || 'Reopened from complete');
    await ensureClpStationStep(await Unit.findById(task.unitId).lean(), by);
  } else if (['open', 'in_progress', 'delayed'].includes(status)) {
    task.status = status;
    if (status === 'in_progress' && prev !== 'in_progress') {
      pushClpActivity(task, 'status_changed', by, `${prev} → in progress`);
    }
  } else {
    throw new Error('Invalid status');
  }

  if (note && status !== 'complete') task.note = note;
  await task.save();
  await syncClpStationStatus(task.unitId, by);
  return task;
}

export async function toggleClpLetterChecklist(taskId, index, done, by) {
  const task = await ClpLetterTask.findById(taskId);
  if (!task) throw new Error('CLP letter task not found');
  if (task.status === 'complete') throw new Error('Reopen activity before editing checklist');

  const item = task.checklist[index];
  if (!item) throw new Error('Checklist item not found');

  item.done = !!done;
  item.doneAt = item.done ? new Date() : undefined;
  item.doneBy = item.done ? by : '';
  if (task.status === 'open') task.status = 'in_progress';
  pushClpActivity(task, 'checklist', by, item.item);
  task.markModified('checklist');
  await task.save();
  return task;
}

export async function completeClpLetterTask(taskId, by, note) {
  return updateClpLetterTaskStatus(taskId, 'complete', by, note);
}

export function mapClpLetterTaskToMyTask(task, unit) {
  const def = getStepDef(CLP_STEP);
  return {
    _id: `clp-${task._id}`,
    clpLetterTaskId: String(task._id),
    taskType: 'clp_letter',
    unitId: task.unitId,
    demandId: task.demandId,
    stepNumber: CLP_STEP,
    stepName: def?.name || 'CLP demand letter issuance',
    pipelinePhase: 'clp',
    status: task.status === 'complete' ? 'completed' : (task.status === 'delayed' ? 'overdue' : 'in_progress'),
    taskKind: 'backend',
    taskKindLabel: 'CLP',
    assignedTo: task.assignee,
    dueDate: task.dueDate,
    nextAction: `Issue CLP letter — ${task.milestoneName}`,
    nextActionDate: task.dueDate,
    milestoneName: task.milestoneName,
    clpPercent: task.clpPercent,
    unitNumber: unit?.unitNumber,
    project: unit?.project,
    entity: unit?.entity,
    phase: unit?.phase,
    building: unit?.building || unit?.tower,
    customerName: unit?.customerId?.name,
    checklistDone: (task.checklist || []).filter((c) => c.done).length,
    checklistTotal: (task.checklist || []).length,
    slaTarget: def?.slaDays ? `${def.slaDays} ${def.slaUnit || 'days'}` : null,
  };
}

/** @deprecated Step 12 no longer gated on Demand payments */
export async function allClpDemandsSettled() {
  return true;
}
