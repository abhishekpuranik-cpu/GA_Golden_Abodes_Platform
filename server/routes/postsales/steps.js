import { Router } from 'express';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Unit from '../../models/postsales/Unit.js';
import { STEPS } from '../../lib/postsales/steps.js';
import { checkBlockedSteps, computeDueDate, getStepDef } from '../../lib/postsales/helpers.js';

const router = Router({ mergeParams: true });

router.get('/', async (req, res) => {
  try {
    const unitId = req.params.unitId || req.query.unitId;
    if (!unitId) return res.status(400).json({ error: 'unitId required' });
    const steps = await PipelineStep.find({ unitId }).sort({ stepNumber: 1 }).lean();
    res.json(steps);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:stepNumber', async (req, res) => {
  try {
    const unitId = req.params.unitId || req.body.unitId;
    const stepNumber = Number(req.params.stepNumber);
    const step = await PipelineStep.findOne({ unitId, stepNumber });
    if (!step) return res.status(404).json({ error: 'Step not found' });

    const { status, checklist, notes, escalatedTo, escalationReason, assignedTo } = req.body;

    if (status === 'in_progress' || status === 'completed') {
      const blockMsg = await checkBlockedSteps(unitId, stepNumber, PipelineStep);
      if (blockMsg) return res.status(400).json({ error: blockMsg });
    }

    if (status === 'in_progress' && step.status === 'pending') {
      const def = getStepDef(stepNumber);
      step.triggerDate = new Date();
      step.dueDate = computeDueDate(def, step.triggerDate);
    }

    if (checklist) step.checklist = checklist;
    if (notes !== undefined) step.notes = notes;
    if (assignedTo !== undefined) step.assignedTo = assignedTo;

    if (escalatedTo) {
      step.escalatedTo = escalatedTo;
      step.escalationDate = new Date();
      step.escalationReason = escalationReason || '';
    }

    if (status) {
      step.status = status;
      if (status === 'completed') {
        step.completedDate = new Date();
        step.slaBreach = false;

        const nextDef = getStepDef(stepNumber + 1);
        if (nextDef) {
          const nextStep = await PipelineStep.findOne({ unitId, stepNumber: stepNumber + 1 });
          if (nextStep && nextStep.status !== 'completed') {
            nextStep.status = 'in_progress';
            nextStep.triggerDate = new Date();
            nextStep.dueDate = computeDueDate(nextDef, nextStep.triggerDate);
            await nextStep.save();
          }
          await Unit.findByIdAndUpdate(unitId, { currentStepNumber: stepNumber + 1 });
        } else {
          await Unit.findByIdAndUpdate(unitId, { currentStepNumber: 20, overallStatus: 'possession_given' });
        }
      }
    }

    await step.save();
    res.json(step);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:stepNumber/checklist/:index', async (req, res) => {
  try {
    const unitId = req.params.unitId;
    const stepNumber = Number(req.params.stepNumber);
    const index = Number(req.params.index);
    const step = await PipelineStep.findOne({ unitId, stepNumber });
    if (!step) return res.status(404).json({ error: 'Step not found' });
    if (step.status === 'completed') return res.status(400).json({ error: 'Step already completed' });

    const item = step.checklist[index];
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });

    item.done = !!req.body.done;
    item.doneAt = item.done ? new Date() : undefined;
    item.doneBy = req.body.doneBy || req.body.by || '';
    step.markModified('checklist');
    await step.save();
    res.json(step);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
