import { Router } from 'express';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Unit from '../../models/postsales/Unit.js';
import { ensureMongo } from '../../lib/mongo.js';
import { resolveSession } from '../auth.js';
import { STEPS } from '../../lib/postsales/steps.js';

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

router.get('/assignees', async (_req, res) => {
  try {
    const db = await ensureMongo();
    const authUsers = await db
      .collection('auth_users')
      .find({ status: { $ne: 'disabled' } }, { projection: { name: 1, email: 1, allowedApps: 1 } })
      .toArray();
    const crmExecs = await Unit.distinct('crmExecutive');
    const roles = [...new Set(STEPS.map((s) => s.assignedRole).filter(Boolean))];
    const people = new Map();

    for (const u of authUsers) {
      const apps = u.allowedApps || [];
      if (apps.includes('post_sales') || apps.includes('sales_dashboard') || apps.includes('admin_security')) {
        people.set(u.email, { id: u.email, label: u.name ? `${u.name} (${u.email})` : u.email, email: u.email, name: u.name });
      }
    }
    for (const c of crmExecs) {
      if (c && !people.has(c)) people.set(c, { id: c, label: c, name: c });
    }

    res.json({ assignees: [...people.values()].sort((a, b) => a.label.localeCompare(b.label)), roles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/my', async (req, res) => {
  try {
    const db = await ensureMongo();
    const sess = await resolveSession(db, req);
    const explicit = String(req.query.assignee || '').trim();
    const needles = explicit ? [explicit] : assigneeNeedles(sess?.user);
    if (!needles.length) return res.status(401).json({ error: 'Authentication required' });

    const steps = await PipelineStep.find({
      status: { $in: ['pending', 'in_progress', 'overdue'] },
      assignedTo: { $exists: true, $nin: ['', null] },
      $or: buildAssigneeOr(needles),
    })
      .sort({ dueDate: 1, stepNumber: 1 })
      .lean();

    const unitIds = [...new Set(steps.map((s) => String(s.unitId)))];
    const units = await Unit.find({ _id: { $in: unitIds } }).populate('customerId').lean();
    const unitMap = Object.fromEntries(units.map((u) => [String(u._id), u]));

    const tasks = steps.map((s) => {
      const u = unitMap[String(s.unitId)];
      const def = STEPS.find((d) => d.number === s.stepNumber);
      return {
        _id: s._id,
        unitId: s.unitId,
        stepNumber: s.stepNumber,
        stepName: s.stepName,
        phase: s.phase,
        status: s.status,
        assignedTo: s.assignedTo,
        assignedRole: s.assignedRole,
        triggerDate: s.triggerDate,
        dueDate: s.dueDate,
        slaBreach: s.slaBreach,
        slaBreachDays: s.slaBreachDays,
        unitNumber: u?.unitNumber,
        project: u?.project,
        entity: u?.entity,
        customerName: u?.customerId?.name,
        slaTarget: slaTargetLabel(def),
      };
    });

    res.json({ tasks, assignee: needles[0], count: tasks.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
