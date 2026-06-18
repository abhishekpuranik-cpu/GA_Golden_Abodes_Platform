import { Router } from 'express';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Unit from '../../models/postsales/Unit.js';
import { ensureMongo } from '../../lib/mongo.js';
import { resolveSession } from '../auth.js';
import { STEPS } from '../../lib/postsales/steps.js';
import { backfillStepTaskKinds } from '../../lib/postsales/helpers.js';
import { getStepTaskKind, TASK_KINDS } from '../../lib/postsales/taskKinds.js';

const router = Router();

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assigneeNeedles(user) {
  if (!user) return [];
  const needles = [];
  if (user.email) needles.push(String(user.email).trim());
  if (user.name) needles.push(String(user.name).trim());
  return [...new Set(needles.filter(Boolean))];
}

function buildAssigneeOr(needles) {
  return needles.flatMap((n) => [{ assignedTo: new RegExp(`^${escapeRegex(n)}$`, 'i') }]);
}

function slaTargetLabel(def) {
  if (!def) return null;
  if (def.slaDays) return `${def.slaDays} ${def.slaUnit || 'days'}`;
  if (def.slaAck) return `Ack ${def.slaAck}d / Resolve ${def.slaResolution}d`;
  return null;
}

function buildUnitFilter(query) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.phase) filter.phase = query.phase;
  if (query.building) filter.$or = [{ building: query.building }, { tower: query.building }];
  return filter;
}

async function matchingUnitIds(query) {
  const filter = buildUnitFilter(query);
  if (!Object.keys(filter).length) return null;
  const units = await Unit.find(filter, { _id: 1 }).lean();
  return units.map((u) => u._id);
}

function mapStepToTask(s, unitMap) {
  const u = unitMap[String(s.unitId)];
  const def = STEPS.find((d) => d.number === s.stepNumber);
  const taskKind = s.taskKind || getStepTaskKind(s.stepNumber);
  return {
    _id: s._id,
    unitId: s.unitId,
    stepNumber: s.stepNumber,
    stepName: s.stepName,
    pipelinePhase: s.phase,
    status: s.status,
    taskKind,
    taskKindLabel: TASK_KINDS[taskKind]?.shortLabel || taskKind,
    assignedTo: s.assignedTo,
    assignedRole: s.assignedRole,
    triggerDate: s.triggerDate,
    dueDate: s.dueDate,
    slaBreach: s.slaBreach,
    slaBreachDays: s.slaBreachDays,
    unitNumber: u?.unitNumber,
    project: u?.project,
    entity: u?.entity,
    phase: u?.phase,
    building: u?.building || u?.tower,
    customerName: u?.customerId?.name,
    cxExecutive: u?.cxExecutive,
    backendExecutive: u?.backendExecutive,
    slaTarget: slaTargetLabel(def),
  };
}

function collectPeople(authUsers, extraNames = []) {
  const people = new Map();
  for (const u of authUsers) {
    const apps = u.allowedApps || [];
    if (apps.includes('post_sales') || apps.includes('sales_dashboard') || apps.includes('admin_security')) {
      people.set(u.email, { id: u.email, label: u.name ? `${u.name} (${u.email})` : u.email, email: u.email, name: u.name });
    }
  }
  for (const c of extraNames) {
    if (c && !people.has(c)) people.set(c, { id: c, label: c, name: c });
  }
  return people;
}

router.get('/assignees', async (_req, res) => {
  try {
    const db = await ensureMongo();
    const authUsers = await db
      .collection('auth_users')
      .find({ status: { $ne: 'disabled' } }, { projection: { name: 1, email: 1, allowedApps: 1 } })
      .toArray();
    const crmExecs = await Unit.distinct('crmExecutive');
    const cxExecs = await Unit.distinct('cxExecutive');
    const backendExecs = await Unit.distinct('backendExecutive');
    const roles = [...new Set(STEPS.map((s) => s.assignedRole).filter(Boolean))];

    const allPeople = collectPeople(authUsers, [...crmExecs, ...cxExecs, ...backendExecs]);
    const cxPeople = collectPeople(authUsers, cxExecs.filter(Boolean));
    const backendPeople = collectPeople(authUsers, backendExecs.filter(Boolean));

    const sortPeople = (map) => [...map.values()].sort((a, b) => a.label.localeCompare(b.label));

    res.json({
      assignees: sortPeople(allPeople),
      cxTeam: sortPeople(cxPeople),
      backendTeam: sortPeople(backendPeople),
      roles,
      taskKinds: TASK_KINDS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function fetchOpenTasks(query, { assigneeNeedles: needles, taskKind } = {}) {
  const filteredUnitIds = await matchingUnitIds(query);
  const stepFilter = {
    status: { $in: ['pending', 'in_progress', 'overdue'] },
    assignedTo: { $exists: true, $nin: ['', null] },
  };
  if (needles?.length) stepFilter.$or = buildAssigneeOr(needles);
  if (filteredUnitIds) stepFilter.unitId = { $in: filteredUnitIds };
  if (taskKind === 'cx' || taskKind === 'backend') {
    stepFilter.$and = [
      {
        $or: [
          { taskKind },
          { taskKind: { $exists: false } },
          { taskKind: null },
          { taskKind: '' },
        ],
      },
    ];
  }

  let steps = await PipelineStep.find(stepFilter)
    .sort({ dueDate: 1, stepNumber: 1 })
    .lean();

  await backfillStepTaskKinds(steps, PipelineStep);

  if (taskKind === 'cx' || taskKind === 'backend') {
    steps = steps.filter((s) => (s.taskKind || getStepTaskKind(s.stepNumber)) === taskKind);
  }

  const stepUnitIds = [...new Set(steps.map((s) => String(s.unitId)))];
  const units = await Unit.find({ _id: { $in: stepUnitIds } }).populate('customerId').lean();
  const unitMap = Object.fromEntries(units.map((u) => [String(u._id), u]));

  return { tasks: steps.map((s) => mapStepToTask(s, unitMap)), unitMap };
}

router.get('/my', async (req, res) => {
  try {
    const db = await ensureMongo();
    const sess = await resolveSession(db, req);
    const explicit = String(req.query.assignee || '').trim();
    const needles = explicit ? [explicit] : assigneeNeedles(sess?.user);
    if (!needles.length) return res.status(401).json({ error: 'Authentication required' });

    const taskKind = String(req.query.taskKind || '').trim();
    const { tasks } = await fetchOpenTasks(req.query, { assigneeNeedles: needles, taskKind: taskKind || undefined });

    let cxCount;
    let backendCount;
    if (taskKind) {
      const { tasks: allTasks } = await fetchOpenTasks(req.query, { assigneeNeedles: needles });
      cxCount = allTasks.filter((t) => t.taskKind === 'cx').length;
      backendCount = allTasks.filter((t) => t.taskKind === 'backend').length;
    } else {
      cxCount = tasks.filter((t) => t.taskKind === 'cx').length;
      backendCount = tasks.filter((t) => t.taskKind === 'backend').length;
    }

    res.json({
      tasks,
      assignee: needles[0],
      count: tasks.length,
      cxCount,
      backendCount,
      taskKinds: TASK_KINDS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/queue', async (req, res) => {
  try {
    const taskKind = String(req.query.taskKind || '').trim();
    if (taskKind && taskKind !== 'cx' && taskKind !== 'backend') {
      return res.status(400).json({ error: 'taskKind must be cx or backend' });
    }

    const { tasks } = await fetchOpenTasks(req.query, { taskKind: taskKind || undefined });

    res.json({
      tasks,
      count: tasks.length,
      taskKind: taskKind || 'all',
      taskKinds: TASK_KINDS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
