import { Router } from 'express';

import PipelineStep from '../../models/postsales/PipelineStep.js';

import Unit from '../../models/postsales/Unit.js';

import { STEPS } from '../../lib/postsales/steps.js';

import { checkBlockedSteps, computeDueDate, getStepDef, backfillStepTaskKinds } from '../../lib/postsales/helpers.js';

import { getStepTaskKind, defaultAssigneeForKind } from '../../lib/postsales/taskKinds.js';

import { attachPostSalesUser, actorLabel, pushActivity } from '../../lib/postsales/activity.js';



const router = Router({ mergeParams: true });



router.use(attachPostSalesUser);



router.get('/', async (req, res) => {

  try {

    const unitId = req.params.unitId || req.query.unitId;

    if (!unitId) return res.status(400).json({ error: 'unitId required' });

    const steps = await PipelineStep.find({ unitId }).sort({ stepNumber: 1 }).lean();

    await backfillStepTaskKinds(steps, PipelineStep);

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



    const { status, checklist, notes, nextAction, nextActionDate, escalatedTo, escalationReason, assignedTo } = req.body;

    const by = actorLabel(req, req.body);



    if (status === 'in_progress' || status === 'completed') {

      const blockMsg = await checkBlockedSteps(unitId, stepNumber, PipelineStep);

      if (blockMsg) return res.status(400).json({ error: blockMsg });

    }



    if (status === 'in_progress' && step.status === 'pending') {

      const def = getStepDef(stepNumber);

      step.triggerDate = new Date();

      step.dueDate = computeDueDate(def, step.triggerDate);

      if (!step.taskKind) step.taskKind = getStepTaskKind(stepNumber);

      if (!step.assignedTo) {

        const unit = await Unit.findById(unitId).lean();

        const autoAssignee = defaultAssigneeForKind(unit, step.taskKind);

        if (autoAssignee) {

          step.assignedTo = autoAssignee;

          pushActivity(step, 'assigned', by, `Auto-assigned to ${autoAssignee}`);

        }

      }

      pushActivity(step, 'started', by, `SLA due ${step.dueDate ? step.dueDate.toISOString().slice(0, 10) : '—'}`);

    }



    if (checklist) step.checklist = checklist;

    if (notes !== undefined) step.notes = notes;

    if (nextAction !== undefined || nextActionDate !== undefined) {
      const prevAction = step.nextAction || '';
      const prevDate = step.nextActionDate ? step.nextActionDate.toISOString().slice(0, 10) : '';
      if (nextAction !== undefined) step.nextAction = nextAction;
      if (nextActionDate !== undefined) {
        step.nextActionDate = nextActionDate ? new Date(nextActionDate) : null;
      }
      const newAction = step.nextAction || '';
      const newDate = step.nextActionDate ? step.nextActionDate.toISOString().slice(0, 10) : '';
      if (newAction !== prevAction || newDate !== prevDate) {
        pushActivity(step, 'note', by, [newAction, newDate].filter(Boolean).join(' · ') || 'Follow-up cleared');
      }
    }



    if (assignedTo !== undefined && assignedTo !== step.assignedTo) {

      pushActivity(step, 'assigned', by, `Assigned to ${assignedTo || '—'}`);

      step.assignedTo = assignedTo;

    }



    if (escalatedTo) {

      step.escalatedTo = escalatedTo;

      step.escalationDate = new Date();

      step.escalationReason = escalationReason || '';

      pushActivity(step, 'escalated', by, escalatedTo);

    }



    if (status) {

      step.status = status;

      if (status === 'completed') {

        step.completedDate = new Date();

        step.completedBy = by;

        step.slaBreach = false;

        pushActivity(step, 'completed', by, notes || 'Step marked complete');



        const nextDef = getStepDef(stepNumber + 1);

        if (nextDef) {

          const nextStep = await PipelineStep.findOne({ unitId, stepNumber: stepNumber + 1 });

          if (nextStep && nextStep.status !== 'completed') {

            nextStep.status = 'in_progress';

            nextStep.triggerDate = new Date();

            nextStep.dueDate = computeDueDate(nextDef, nextStep.triggerDate);

            if (!nextStep.taskKind) nextStep.taskKind = getStepTaskKind(stepNumber + 1);

            if (!nextStep.assignedTo) {

              const unit = await Unit.findById(unitId).lean();

              const autoAssignee = defaultAssigneeForKind(unit, nextStep.taskKind);

              if (autoAssignee) {

                nextStep.assignedTo = autoAssignee;

                pushActivity(nextStep, 'assigned', by, `Auto-assigned to ${autoAssignee}`);

              }

            }

            pushActivity(nextStep, 'started', by, `Auto-started after step ${stepNumber} completed`);

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



    const by = actorLabel(req, req.body);

    item.done = !!req.body.done;

    item.doneAt = item.done ? new Date() : undefined;

    item.doneBy = item.done ? by : '';

    pushActivity(step, 'checklist', by, item.item);

    step.markModified('checklist');

    await step.save();

    res.json(step);

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.post('/:stepNumber/comments', async (req, res) => {

  try {

    const unitId = req.params.unitId || req.body.unitId;

    const stepNumber = Number(req.params.stepNumber);

    const text = String(req.body.text || '').trim();

    if (!text) return res.status(400).json({ error: 'Comment text is required' });

    const step = await PipelineStep.findOne({ unitId, stepNumber });

    if (!step) return res.status(404).json({ error: 'Step not found' });

    const by = actorLabel(req, req.body);

    const comment = { text, at: new Date(), by };

    if (!step.comments) step.comments = [];

    step.comments.push(comment);

    pushActivity(step, 'note', by, text);

    await step.save();

    res.status(201).json(step);

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



export default router;

