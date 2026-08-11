import { Router } from 'express';

import PipelineStep from '../../models/postsales/PipelineStep.js';

import Unit from '../../models/postsales/Unit.js';

import { STEPS } from '../../lib/postsales/steps.js';

import { checkBlockedSteps, computeDueDate, getStepDef, hydrateStepTaskKinds } from '../../lib/postsales/helpers.js';

import { getStepTaskKind, defaultAssigneeForKind } from '../../lib/postsales/taskKinds.js';

import { attachPostSalesUser, actorLabel, pushActivity } from '../../lib/postsales/activity.js';
import ClpLetterTask from '../../models/postsales/ClpLetterTask.js';
import {
  checklistComplete,
  CLP_STEP,
} from '../../lib/postsales/clpLetterTasks.js';
import { mutatePipelineStep, serializePipelineStep } from '../../lib/postsales/stepMutations.js';



const router = Router({ mergeParams: true });



router.use(attachPostSalesUser);



router.get('/', async (req, res) => {

  try {

    const unitId = req.params.unitId || req.query.unitId;

    if (!unitId) return res.status(400).json({ error: 'unitId required' });

    const steps = await PipelineStep.find({ unitId })
      .sort({ stepNumber: 1 })
      .select('-activityLog')
      .lean();

    res.json(hydrateStepTaskKinds(steps));

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});



router.get('/:stepNumber/log', async (req, res) => {
  try {
    const unitId = req.params.unitId;
    const stepNumber = Number(req.params.stepNumber);
    const step = await PipelineStep.findOne({ unitId, stepNumber }).lean();
    if (!step) return res.status(404).json({ error: 'Step not found' });
    res.json({ log: step.activityLog || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



router.get('/:stepNumber', async (req, res) => {
  try {
    const unitId = req.params.unitId;
    const stepNumber = Number(req.params.stepNumber);
    const step = await PipelineStep.findOne({ unitId, stepNumber }).select('-activityLog').lean();
    if (!step) return res.status(404).json({ error: 'Step not found' });
    res.json(hydrateStepTaskKinds([step])[0]);
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
      if (status === 'completed' && stepNumber !== CLP_STEP && !checklistComplete(step.checklist)) {
        return res.status(400).json({ error: 'Complete all checklist items before marking this step done.' });
      }

      if (status === 'completed' && stepNumber === CLP_STEP) {
        const openClp = await ClpLetterTask.countDocuments({
          unitId,
          status: { $in: ['open', 'in_progress', 'delayed'] },
        });
        if (openClp > 0) {
          return res.status(400).json({ error: `${openClp} CLP letter activity(ies) still open. Complete them first.` });
        }
      }

      if (status === 'in_progress' && step.status === 'completed') {
        step.completedDate = undefined;
        step.completedBy = undefined;
        pushActivity(step, 'reopened', by, notes || 'Step reopened for further work');
      }

      step.status = status;

      if (status === 'completed') {

        step.completedDate = new Date();

        step.completedBy = by;

        step.slaBreach = false;

        pushActivity(step, 'completed', by, notes || 'Step marked complete');

        if (stepNumber === CLP_STEP) {
          await step.save();
          return res.json(step);
        }

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

    const by = actorLabel(req, req.body);

    const step = await mutatePipelineStep(unitId, stepNumber, async (doc) => {
      if (doc.status === 'completed' && req.body.done) {
        const err = new Error('Reopen the step before editing checklist.');
        err.status = 400;
        throw err;
      }
      const item = doc.checklist[index];
      if (!item) {
        const err = new Error('Checklist item not found');
        err.status = 404;
        throw err;
      }
      item.done = !!req.body.done;
      item.doneAt = item.done ? new Date() : undefined;
      item.doneBy = item.done ? by : '';
      pushActivity(doc, 'checklist', by, item.item);
    });

    res.json(serializePipelineStep(step));

  } catch (err) {

    res.status(err.status || 400).json({ error: err.message });

  }

});



router.post('/:stepNumber/work-update', async (req, res) => {
  try {
    const unitId = req.params.unitId || req.body.unitId;
    const stepNumber = Number(req.params.stepNumber);
    const {
      text,
      nextAction,
      nextActionDate,
      assignedTo,
      markComplete,
      status,
    } = req.body || {};
    const by = actorLabel(req, req.body);
    const commentText = String(text || '').trim();

    const step = await mutatePipelineStep(unitId, stepNumber, async (doc) => {
      if (commentText) {
        if (!doc.comments) doc.comments = [];
        doc.comments.push({ text: commentText, at: new Date(), by });
        pushActivity(doc, 'note', by, commentText);
      }

      if (nextAction !== undefined || nextActionDate !== undefined) {
        const prevAction = doc.nextAction || '';
        const prevDate = doc.nextActionDate ? doc.nextActionDate.toISOString().slice(0, 10) : '';
        if (nextAction !== undefined) doc.nextAction = nextAction;
        if (nextActionDate !== undefined) {
          doc.nextActionDate = nextActionDate ? new Date(nextActionDate) : null;
        }
        const newAction = doc.nextAction || '';
        const newDate = doc.nextActionDate ? doc.nextActionDate.toISOString().slice(0, 10) : '';
        if (!commentText && (newAction !== prevAction || newDate !== prevDate)) {
          pushActivity(doc, 'note', by, [newAction, newDate].filter(Boolean).join(' · ') || 'Follow-up cleared');
        }
      }

      if (assignedTo !== undefined && assignedTo !== doc.assignedTo) {
        pushActivity(doc, 'assigned', by, `Assigned to ${assignedTo || '—'}`);
        doc.assignedTo = assignedTo;
      }

      const wantComplete = markComplete || status === 'completed';
      if (wantComplete) {
        if (!checklistComplete(doc.checklist)) {
          const err = new Error('Complete all checklist items before marking this step done.');
          err.status = 400;
          throw err;
        }
        doc.status = 'completed';
        doc.completedDate = new Date();
        doc.completedBy = by;
        doc.slaBreach = false;
        pushActivity(doc, 'completed', by, commentText || 'Step marked complete');
      }
    });

    let result = step;
    if (markComplete || status === 'completed') {
      const blockMsg = await checkBlockedSteps(unitId, stepNumber, PipelineStep);
      if (blockMsg) return res.status(400).json({ error: blockMsg });

      if (stepNumber !== CLP_STEP) {
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
      result = await PipelineStep.findOne({ unitId, stepNumber });
    }

    res.json(serializePipelineStep(result));
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});



router.post('/:stepNumber/comments', async (req, res) => {

  try {

    const unitId = req.params.unitId || req.body.unitId;

    const stepNumber = Number(req.params.stepNumber);

    const text = String(req.body.text || '').trim();

    if (!text) return res.status(400).json({ error: 'Comment text is required' });

    const by = actorLabel(req, req.body);

    const step = await mutatePipelineStep(unitId, stepNumber, async (doc) => {
      if (!doc.comments) doc.comments = [];
      doc.comments.push({ text, at: new Date(), by });
      pushActivity(doc, 'note', by, text);
    });

    res.status(201).json(serializePipelineStep(step));

  } catch (err) {

    res.status(err.status || 400).json({ error: err.message });

  }

});



export default router;

