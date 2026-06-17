import { Router } from 'express';
import Unit from '../../models/postsales/Unit.js';
import Customer from '../../models/postsales/Customer.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import { STEPS } from '../../lib/postsales/steps.js';
import { buildChecklist, computeDueDate } from '../../lib/postsales/helpers.js';

const router = Router();

async function createPipelineSteps(unit, fundingType) {
  const now = new Date();
  const docs = STEPS.map((def) => {
    const status = def.number === 1 ? 'in_progress' : 'pending';
    const triggerDate = def.number === 1 ? now : undefined;
    const dueDate = def.number === 1 ? computeDueDate(def, now) : undefined;
    return {
      unitId: unit._id,
      stepNumber: def.number,
      stepName: def.name,
      phase: def.phase,
      status,
      assignedRole: def.assignedRole,
      triggerDate,
      dueDate,
      checklist: buildChecklist(def, fundingType),
    };
  });
  await PipelineStep.insertMany(docs);
}

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.project) filter.project = req.query.project;
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.crmExecutive) filter.crmExecutive = req.query.crmExecutive;
    if (req.query.status) filter.overallStatus = req.query.status;

    const units = await Unit.find(filter).populate('customerId').sort({ updatedAt: -1 }).lean();
    const unitIds = units.map((u) => u._id);
    const steps = await PipelineStep.find({ unitId: { $in: unitIds } }).lean();
    const stepsByUnit = {};
    for (const s of steps) {
      if (!stepsByUnit[s.unitId]) stepsByUnit[s.unitId] = [];
      stepsByUnit[s.unitId].push(s);
    }

    const result = units.map((u) => ({
      ...u,
      customer: u.customerId,
      customerId: u.customerId?._id || u.customerId,
      customerName: u.customerId?.name,
      fundingType: u.customerId?.fundingType,
      steps: (stepsByUnit[u._id] || []).sort((a, b) => a.stepNumber - b.stepNumber),
      slaBreachCount: (stepsByUnit[u._id] || []).filter((s) => s.slaBreach || s.status === 'overdue').length,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id).populate('customerId').lean();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const steps = await PipelineStep.find({ unitId: unit._id }).sort({ stepNumber: 1 }).lean();
    res.json({ ...unit, customer: unit.customerId, steps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customerId, ...unitData } = req.body;
    if (!customerId) return res.status(400).json({ error: 'customerId is required' });

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const unit = await Unit.create({ ...unitData, customerId, currentStepNumber: 1 });
    await createPipelineSteps(unit, customer.fundingType);
    const populated = await Unit.findById(unit._id).populate('customerId').lean();
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('customerId');
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    res.json(unit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const unit = await Unit.findByIdAndDelete(req.params.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    await PipelineStep.deleteMany({ unitId: unit._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
