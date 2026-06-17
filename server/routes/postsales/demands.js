import { Router } from 'express';
import Demand from '../../models/postsales/Demand.js';
import Unit from '../../models/postsales/Unit.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.unitId) filter.unitId = req.query.unitId;
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

    const demands = await Demand.find(filter).sort({ issuedDate: -1 }).lean();
    const unitIds = [...new Set(demands.map((d) => String(d.unitId)))];
    const units = await Unit.find({ _id: { $in: unitIds } }).populate('customerId').lean();
    const unitMap = Object.fromEntries(units.map((u) => [String(u._id), u]));

    const enriched = demands.map((d) => {
      const u = unitMap[String(d.unitId)];
      return {
        ...d,
        unitNumber: u?.unitNumber,
        project: u?.project,
        customerName: u?.customerId?.name,
      };
    });

    const totalDemanded = demands.reduce((s, d) => s + (d.totalAmount || 0), 0);
    const totalCollected = demands.reduce((s, d) => s + (d.paidAmount || 0), 0);

    res.json({
      demands: enriched,
      summary: {
        totalDemanded,
        totalCollected,
        totalOutstanding: totalDemanded - totalCollected,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const unit = await Unit.findById(req.body.unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const payload = { ...req.body, entity: unit.entity };
    delete payload.entityOverride;
    const demand = await Demand.create(payload);
    res.status(201).json(demand);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { paymentStatus, paidAmount, paidDate, receiptNumber } = req.body;
    const updates = {};
    if (paymentStatus !== undefined) updates.paymentStatus = paymentStatus;
    if (paidAmount !== undefined) updates.paidAmount = paidAmount;
    if (paidDate !== undefined) updates.paidDate = paidDate;
    if (receiptNumber !== undefined) updates.receiptNumber = receiptNumber;

    const demand = await Demand.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!demand) return res.status(404).json({ error: 'Demand not found' });

    if (demand.paidAmount >= demand.totalAmount) {
      demand.paymentStatus = 'paid';
      await demand.save();
    } else if (demand.paidAmount > 0) {
      demand.paymentStatus = 'partial';
      await demand.save();
    }

    res.json(demand);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
