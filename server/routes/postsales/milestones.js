import { Router } from 'express';
import ConstructionMilestone from '../../models/postsales/ConstructionMilestone.js';
import Demand from '../../models/postsales/Demand.js';
import Unit from '../../models/postsales/Unit.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.project) filter.project = req.query.project;
    if (req.query.demandTriggerStatus) filter.demandTriggerStatus = req.query.demandTriggerStatus;
    const milestones = await ConstructionMilestone.find(filter).sort({ completedDate: -1 }).lean();
    res.json(milestones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const milestone = await ConstructionMilestone.create({
      ...req.body,
      loggedAt: new Date(),
      demandTriggerStatus: 'pending',
    });
    res.status(201).json(milestone);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/trigger', async (req, res) => {
  try {
    const milestone = await ConstructionMilestone.findById(req.params.id);
    if (!milestone) return res.status(404).json({ error: 'Milestone not found' });
    if (milestone.demandTriggerStatus === 'completed') {
      return res.status(400).json({ error: 'Demands already triggered for this milestone' });
    }

    const units = await Unit.find({
      project: milestone.project,
      overallStatus: 'active',
      currentStepNumber: { $gte: 12 },
    }).lean();

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 14);

    const demands = [];
    for (const unit of units) {
      const demandAmount = (unit.totalCost || 0) * ((milestone.clpPercent || 0) / 100);
      const gstAmount = demandAmount * 0.05;
      const totalAmount = demandAmount + gstAmount;
      demands.push({
        unitId: unit._id,
        entity: unit.entity,
        milestoneId: milestone._id,
        milestoneName: milestone.milestoneName,
        clpPercent: milestone.clpPercent,
        demandAmount,
        gstAmount,
        totalAmount,
        issuedDate: now,
        dueDate,
        paymentStatus: 'pending',
        paidAmount: 0,
      });
    }

    if (demands.length) await Demand.insertMany(demands);

    milestone.demandTriggerStatus = demands.length ? 'triggered' : 'completed';
    milestone.demandsCreated = demands.length;
    await milestone.save();

    res.json({
      ok: true,
      demandsCreated: demands.length,
      unitsAffected: units.length,
      milestone,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
