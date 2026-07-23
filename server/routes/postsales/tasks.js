import { Router } from 'express';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import ClpLetterTask from '../../models/postsales/ClpLetterTask.js';
import Unit from '../../models/postsales/Unit.js';
import { ensureMongo } from '../../lib/mongo.js';
import { resolveSession } from '../auth.js';
import { STEPS } from '../../lib/postsales/steps.js';
import { hydrateStepTaskKinds } from '../../lib/postsales/helpers.js';
import { getStepTaskKind, TASK_KINDS } from '../../lib/postsales/taskKinds.js';
import { CLP_STEP, mapClpLetterTaskToMyTask } from '../../lib/postsales/clpLetterTasks.js';

import { cacheKeyFromQuery, readHttpCache, writeHttpCache } from '../../lib/postsales/httpCache.js';

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

function sortTasksByFollowUp(steps) {
  return [...steps].sort((a, b) => {
    const na = a.nextActionDate ? new Date(a.nextActionDate).getTime() : Number.MAX_SAFE_INTEGER;
    const nb = b.nextActionDate ? new Date(b.nextActionDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (na !== nb) return na - nb;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return (a.stepNumber || 0) - (b.stepNumber || 0);
  });
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
    nextAction: s.nextAction,
    nextActionDate: s.nextActionDate,
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

async function fetchOpenTasks(query, { assigneeNeedles: needles, taskKind, includeExecutiveSteps = false } = {}) {
  const filteredUnitIds = await matchingUnitIds(query);
  const stepFilter = {
    status: { $in: ['pending', 'in_progress', 'overdue'] },
  };
  if (filteredUnitIds) stepFilter.unitId = { $in: filteredUnitIds };

  let unitMap = {};

  if (includeExecutiveSteps && needles?.length) {
    const execFilter = {};
    if (filteredUnitIds) execFilter._id = { $in: filteredUnitIds };
    execFilter.$or = needles.flatMap((n) => [
      { cxExecutive: new RegExp(`^${escapeRegex(n)}$`, 'i') },
      { backendExecutive: new RegExp(`^${escapeRegex(n)}$`, 'i') },
      { crmExecutive: new RegExp(`^${escapeRegex(n)}$`, 'i') },
    ]);
    const execUnits = await Unit.find(execFilter).populate('customerId').lean();
    for (const u of execUnits) unitMap[String(u._id)] = u;
    const execUnitIds = execUnits.map((u) => u._id);

    stepFilter.$or = [
      ...buildAssigneeOr(needles),
      ...(execUnitIds.length ? [{ unitId: { $in: execUnitIds } }] : []),
    ];
  } else {
    stepFilter.assignedTo = { $exists: true, $nin: ['', null] };
    if (needles?.length) stepFilter.$or = buildAssigneeOr(needles);
  }

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
    .select('unitId stepNumber stepName phase status taskKind assignedTo assignedRole triggerDate dueDate nextAction nextActionDate slaBreach slaBreachDays notes')
    .lean();
  hydrateStepTaskKinds(steps);
  steps = steps.filter((s) => s.stepNumber !== CLP_STEP);

  const missingUnitIds = [...new Set(steps.map((s) => String(s.unitId)))].filter((id) => !unitMap[id]);
  if (missingUnitIds.length) {
    const units = await Unit.find({ _id: { $in: missingUnitIds } }).populate('customerId').lean();
    for (const u of units) unitMap[String(u._id)] = u;
  }

  if (includeExecutiveSteps && needles?.length) {
    steps = steps.filter((s) => {
      const kind = s.taskKind || getStepTaskKind(s.stepNumber);
      if (taskKind === 'cx' || taskKind === 'backend') {
        if (kind !== taskKind) return false;
      }
      const u = unitMap[String(s.unitId)];
      if (!u) return false;
      const assignedMatch = needles.some(
        (n) => s.assignedTo && new RegExp(`^${escapeRegex(n)}$`, 'i').test(String(s.assignedTo))
      );
      if (assignedMatch) return true;
      const isCxExec = needles.some(
        (n) => u.cxExecutive && new RegExp(`^${escapeRegex(n)}$`, 'i').test(String(u.cxExecutive))
      );
      const isBackendExec = needles.some(
        (n) => u.backendExecutive && new RegExp(`^${escapeRegex(n)}$`, 'i').test(String(u.backendExecutive))
      );
      const isCrmExec = needles.some(
        (n) => u.crmExecutive && new RegExp(`^${escapeRegex(n)}$`, 'i').test(String(u.crmExecutive))
      );
      if (kind === 'cx' && (isCxExec || isCrmExec)) return true;
      if (kind === 'backend' && (isBackendExec || isCrmExec)) return true;
      return false;
    });
  } else if (taskKind === 'cx' || taskKind === 'backend') {
    steps = steps.filter((s) => (s.taskKind || getStepTaskKind(s.stepNumber)) === taskKind);
  }

  steps = sortTasksByFollowUp(steps);
  const stepTasks = steps.map((s) => mapStepToTask(s, unitMap));

  const clpFilter = { status: { $in: ['open', 'in_progress', 'delayed'] } };
  if (filteredUnitIds) clpFilter.unitId = { $in: filteredUnitIds };
  if (needles?.length) {
    clpFilter.assignee = { $in: needles.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i')) };
  }
  const clpRows = await ClpLetterTask.find(clpFilter).sort({ dueDate: 1 }).lean();
  for (const row of clpRows) {
    if (!unitMap[String(row.unitId)]) {
      const u = await Unit.findById(row.unitId).populate('customerId').lean();
      if (u) unitMap[String(u._id)] = u;
    }
  }
  let clpTasks = clpRows.map((t) => mapClpLetterTaskToMyTask(t, unitMap[String(t.unitId)]));
  if (taskKind === 'cx' || taskKind === 'backend') {
    clpTasks = clpTasks.filter((t) => t.taskKind === taskKind);
  }

  const merged = sortTasksByFollowUp([...stepTasks, ...clpTasks]);
  return { tasks: merged, unitMap };
}

router.get('/my', async (req, res) => {
  try {
    const db = await ensureMongo();
    const sess = await resolveSession(db, req);
    const explicit = String(req.query.assignee || '').trim();
    const needles = explicit ? [explicit] : assigneeNeedles(sess?.user);
    if (!needles.length) return res.status(401).json({ error: 'Authentication required' });

    const cacheKey = `tasks-my:${needles[0]}:${cacheKeyFromQuery(req.query)}`;
    const cached = readHttpCache(cacheKey);
    if (cached) return res.json(cached);

    const taskKind = String(req.query.taskKind || '').trim();
    const { tasks: allTasks } = await fetchOpenTasks(req.query, {
      assigneeNeedles: needles,
      includeExecutiveSteps: true,
    });
    const tasks = taskKind ? allTasks.filter((t) => t.taskKind === taskKind) : allTasks;
    const cxCount = allTasks.filter((t) => t.taskKind === 'cx').length;
    const backendCount = allTasks.filter((t) => t.taskKind === 'backend').length;

    const payload = {
      tasks,
      assignee: needles[0],
      count: tasks.length,
      cxCount,
      backendCount,
      taskKinds: TASK_KINDS,
    };
    writeHttpCache(cacheKey, payload, 45 * 1000);
    res.json(payload);
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
