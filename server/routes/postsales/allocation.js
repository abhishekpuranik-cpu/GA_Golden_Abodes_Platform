import { Router } from 'express';
import Unit from '../../models/postsales/Unit.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Demand from '../../models/postsales/Demand.js';
import { ensureMongo } from '../../lib/mongo.js';
import { backfillStepTaskKinds } from '../../lib/postsales/helpers.js';
import { getStepTaskKind, defaultAssigneeForKind, TASK_KINDS } from '../../lib/postsales/taskKinds.js';
import { pushActivity } from '../../lib/postsales/activity.js';
import {
  issueAllocationToken,
  requireAllocationAdmin,
  verifyAllocationPassword,
} from '../../lib/postsales/allocationAdmin.js';
import {
  ensureActivityShape,
  loadActivityCatalog,
  nextActivityNumber,
  saveActivityCatalog,
} from '../../lib/postsales/activityCatalog.js';

const router = Router();

router.post('/verify-admin', async (req, res) => {
  try {
    if (!verifyAllocationPassword(req.body?.password)) {
      return res.status(403).json({ error: 'Invalid admin password' });
    }
    res.json({ ok: true, token: issueAllocationToken() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use(requireAllocationAdmin);

router.get('/catalog', async (_req, res) => {
  try {
    const db = await ensureMongo();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const catalog = await loadActivityCatalog(db);
    res.json({ ...catalog, taskKinds: TASK_KINDS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/catalog', async (req, res) => {
  try {
    const db = await ensureMongo();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const { activities: existing } = await loadActivityCatalog(db);
    const body = ensureActivityShape({ ...req.body, number: req.body.number || nextActivityNumber(existing) });
    if (!body) return res.status(400).json({ error: 'Invalid activity payload' });
    const next = [...existing.filter((a) => a.number !== body.number), body];
    const saved = await saveActivityCatalog(db, next);
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/catalog/:number', async (req, res) => {
  try {
    const db = await ensureMongo();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const number = Number(req.params.number);
    const { activities: existing } = await loadActivityCatalog(db);
    const idx = existing.findIndex((a) => a.number === number);
    if (idx < 0) return res.status(404).json({ error: 'Activity not found' });
    const merged = ensureActivityShape({ ...existing[idx], ...req.body, number });
    if (!merged) return res.status(400).json({ error: 'Invalid activity payload' });
    const next = [...existing];
    next[idx] = merged;
    const saved = await saveActivityCatalog(db, next);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/catalog/:number', async (req, res) => {
  try {
    const db = await ensureMongo();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const number = Number(req.params.number);
    const { activities: existing } = await loadActivityCatalog(db);
    const next = existing.filter((a) => a.number !== number);
    if (next.length === existing.length) return res.status(404).json({ error: 'Activity not found' });
    const saved = await saveActivityCatalog(db, next);
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function buildUnitFilter(query = {}) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.phase) filter.phase = query.phase;
  if (query.building) filter.$or = [{ building: query.building }, { tower: query.building }];
  return filter;
}

async function resolveUnitIds(body = {}) {
  if (Array.isArray(body.unitIds) && body.unitIds.length) return body.unitIds;
  const filter = buildUnitFilter(body);
  if (!Object.keys(filter).length) return null;
  const units = await Unit.find(filter, { _id: 1 }).lean();
  return units.map((u) => u._id);
}

function demandTotals(demands) {
  const totalDue = demands.reduce((s, d) => s + (d.totalAmount || 0), 0);
  const totalReceived = demands.reduce((s, d) => s + (d.paidAmount || 0), 0);
  return {
    totalDue,
    totalReceived,
    totalPending: totalDue - totalReceived,
    count: demands.length,
  };
}

router.get('/', async (req, res) => {
  try {
    const unitFilter = buildUnitFilter(req.query);
    const taskKind = String(req.query.taskKind || '').trim();

    const units = await Unit.find(unitFilter).populate('customerId').sort({ project: 1, unitNumber: 1 }).lean();
    const unitIds = units.map((u) => u._id);

    const [steps, demands] = await Promise.all([
      PipelineStep.find({
        unitId: { $in: unitIds },
        status: { $in: ['pending', 'in_progress', 'overdue'] },
      }).lean(),
      Demand.find({ unitId: { $in: unitIds } }).lean(),
    ]);

    await backfillStepTaskKinds(steps, PipelineStep);

    const stepsByUnit = {};
    for (const s of steps) {
      const kind = s.taskKind || getStepTaskKind(s.stepNumber);
      if (taskKind === 'cx' || taskKind === 'backend') {
        if (kind !== taskKind) continue;
      }
      const key = String(s.unitId);
      if (!stepsByUnit[key]) stepsByUnit[key] = { cx: [], backend: [] };
      stepsByUnit[key][kind].push(s);
    }

    const demandsByUnit = {};
    for (const d of demands) {
      const key = String(d.unitId);
      if (!demandsByUnit[key]) demandsByUnit[key] = [];
      demandsByUnit[key].push(d);
    }

    const rows = units.map((u) => {
      const key = String(u._id);
      const open = stepsByUnit[key] || { cx: [], backend: [] };
      const unitDemands = demandsByUnit[key] || [];
      const clp = demandTotals(unitDemands);
      return {
        unitId: u._id,
        unitNumber: u.unitNumber,
        project: u.project,
        entity: u.entity,
        phase: u.phase,
        building: u.building || u.tower,
        customerName: u.customerId?.name,
        crmExecutive: u.crmExecutive,
        cxExecutive: u.cxExecutive,
        backendExecutive: u.backendExecutive,
        currentStepNumber: u.currentStepNumber,
        openCxCount: open.cx.length,
        openBackendCount: open.backend.length,
        openCxSteps: open.cx.map((s) => ({ stepNumber: s.stepNumber, stepName: s.stepName, assignedTo: s.assignedTo, status: s.status })),
        openBackendSteps: open.backend.map((s) => ({ stepNumber: s.stepNumber, stepName: s.stepName, assignedTo: s.assignedTo, status: s.status })),
        clpDue: clp.totalDue,
        clpReceived: clp.totalReceived,
        clpPending: clp.totalPending,
        clpDemandCount: clp.count,
      };
    });

    const filteredRows = taskKind === 'cx' || taskKind === 'backend'
      ? rows.filter((r) => (taskKind === 'cx' ? r.openCxCount : r.openBackendCount) > 0)
      : rows;

    res.json({
      rows: filteredRows,
      count: filteredRows.length,
      taskKinds: TASK_KINDS,
      summary: {
        units: filteredRows.length,
        openCxTasks: filteredRows.reduce((s, r) => s + r.openCxCount, 0),
        openBackendTasks: filteredRows.reduce((s, r) => s + r.openBackendCount, 0),
        clpDue: filteredRows.reduce((s, r) => s + r.clpDue, 0),
        clpReceived: filteredRows.reduce((s, r) => s + r.clpReceived, 0),
        clpPending: filteredRows.reduce((s, r) => s + r.clpPending, 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/executives', async (req, res) => {
  try {
    const unitIds = await resolveUnitIds(req.body);
    if (!unitIds?.length) return res.status(400).json({ error: 'No units matched the filter' });

    const updates = {};
    if (req.body.cxExecutive !== undefined) updates.cxExecutive = String(req.body.cxExecutive).trim();
    if (req.body.backendExecutive !== undefined) updates.backendExecutive = String(req.body.backendExecutive).trim();
    if (!Object.keys(updates).length) return res.status(400).json({ error: 'cxExecutive or backendExecutive required' });

    const result = await Unit.updateMany({ _id: { $in: unitIds } }, { $set: updates });
    res.json({ ok: true, matched: result.matchedCount, modified: result.modifiedCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/assign-steps', async (req, res) => {
  try {
    const taskKind = String(req.body.taskKind || '').trim();
    const assignedTo = String(req.body.assignedTo || '').trim();
    if (!['cx', 'backend'].includes(taskKind)) return res.status(400).json({ error: 'taskKind must be cx or backend' });
    if (!assignedTo) return res.status(400).json({ error: 'assignedTo required' });

    const unitIds = await resolveUnitIds(req.body);
    if (!unitIds?.length) return res.status(400).json({ error: 'No units matched the filter' });

    const units = await Unit.find({ _id: { $in: unitIds } }).lean();
    const unitMap = Object.fromEntries(units.map((u) => [String(u._id), u]));

    const steps = await PipelineStep.find({
      unitId: { $in: unitIds },
      status: { $in: ['pending', 'in_progress', 'overdue'] },
    });

    await backfillStepTaskKinds(steps, PipelineStep);

    const by = req.body.by || 'Work allocation panel';
    const bulkOps = [];

    for (const step of steps) {
      const kind = step.taskKind || getStepTaskKind(step.stepNumber);
      if (kind !== taskKind) continue;
      if (step.assignedTo === assignedTo) continue;
      const activityEntry = {
        action: 'assigned',
        at: new Date(),
        by,
        detail: `Bulk assigned to ${assignedTo} (${taskKind})`,
      };
      const setFields = { assignedTo, taskKind: kind };
      if (step.status === 'pending') setFields.status = 'in_progress';
      bulkOps.push({
        updateOne: {
          filter: { _id: step._id },
          update: {
            $set: setFields,
            $push: { activityLog: activityEntry },
          },
        },
      });
    }

    if (bulkOps.length) await PipelineStep.bulkWrite(bulkOps);
    const updated = bulkOps.length;

    if (req.body.applyDefaultExecutives) {
      const execField = taskKind === 'cx' ? 'cxExecutive' : 'backendExecutive';
      await Unit.updateMany({ _id: { $in: unitIds } }, { $set: { [execField]: assignedTo } });
    } else if (req.body.syncExecutiveOnly) {
      const execField = taskKind === 'cx' ? 'cxExecutive' : 'backendExecutive';
      for (const unit of units) {
        if (!unit[execField]) {
          await Unit.findByIdAndUpdate(unit._id, { $set: { [execField]: assignedTo } });
        }
      }
    }

    res.json({ ok: true, stepsUpdated: updated, taskKind, assignedTo });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/auto-assign', async (req, res) => {
  try {
    const unitIds = await resolveUnitIds(req.body);
    if (!unitIds?.length) return res.status(400).json({ error: 'No units matched the filter' });

    const units = await Unit.find({ _id: { $in: unitIds } }).lean();
    const unitMap = Object.fromEntries(units.map((u) => [String(u._id), u]));

    const steps = await PipelineStep.find({
      unitId: { $in: unitIds },
      status: { $in: ['pending', 'in_progress', 'overdue'] },
      $or: [{ assignedTo: { $exists: false } }, { assignedTo: '' }, { assignedTo: null }],
    });

    await backfillStepTaskKinds(steps, PipelineStep);

    const by = req.body.by || 'Work allocation panel';
    let updated = 0;

    for (const step of steps) {
      const kind = step.taskKind || getStepTaskKind(step.stepNumber);
      const assignee = defaultAssigneeForKind(unitMap[String(step.unitId)], kind);
      if (!assignee) continue;
      step.assignedTo = assignee;
      step.taskKind = kind;
      pushActivity(step, 'assigned', by, `Auto-assigned to ${assignee} (${kind})`);
      await step.save();
      updated += 1;
    }

    res.json({ ok: true, stepsUpdated: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
