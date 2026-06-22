import { Router } from 'express';
import ConstructionMilestone from '../../models/postsales/ConstructionMilestone.js';
import { processClpMilestoneCompletion } from '../../lib/postsales/clpDemandTrigger.js';
import { formatMilestoneLabel } from '../../lib/postsales/milestoneLabels.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.project) filter.project = req.query.project;
    if (req.query.demandTriggerStatus) filter.demandTriggerStatus = req.query.demandTriggerStatus;
    const milestones = await ConstructionMilestone.find(filter).sort({ completedDate: -1 }).lean();
    res.json(milestones.map((m) => ({
      ...m,
      milestoneName: formatMilestoneLabel(m.milestoneName),
      milestoneNameRaw: m.milestoneName,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const rawName = String(req.body.milestoneName || '').trim();
    const milestone = await ConstructionMilestone.create({
      ...req.body,
      milestoneName: rawName,
      loggedAt: new Date(),
      demandTriggerStatus: 'pending',
    });

    const result = await processClpMilestoneCompletion(milestone, {
      by: req.body.loggedBy || 'Engineering',
      createDemands: true,
    });

    res.status(201).json({
      ...milestone.toObject(),
      milestoneName: formatMilestoneLabel(milestone.milestoneName),
      ...result,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/trigger', async (req, res) => {
  try {
    const milestone = await ConstructionMilestone.findById(req.params.id);
    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
    if (milestone.demandTriggerStatus === 'completed') {
      return res.status(400).json({ error: 'Workflow already completed for this milestone' });
    }

    const result = await processClpMilestoneCompletion(milestone, {
      by: req.body.by || 'Work allocation panel',
      createDemands: true,
    });

    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
