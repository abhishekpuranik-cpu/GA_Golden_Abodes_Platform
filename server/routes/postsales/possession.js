import { Router } from 'express';
import PossessionClearance from '../../models/postsales/PossessionClearance.js';

const router = Router();

function computeOverall(doc) {
  const stages = [doc.accountsClearance, doc.legalClearance, doc.projectsClearance, doc.facilityClearance];
  const cleared = stages.filter((s) => s?.status === 'cleared').length;
  if (cleared === 4) return 'cleared';
  if (cleared > 0) return 'partial';
  return 'pending';
}

router.get('/', async (req, res) => {
  try {
    const unitId = req.query.unitId;
    if (!unitId) return res.status(400).json({ error: 'unitId required' });
    const record = await PossessionClearance.findOne({ unitId }).lean();
    res.json(record || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { unitId, accountsClearance, legalClearance, projectsClearance, facilityClearance, ...rest } = req.body;
    if (!unitId) return res.status(400).json({ error: 'unitId required' });

    const existing = await PossessionClearance.findOne({ unitId });

    if (legalClearance?.status === 'cleared') {
      const acct = existing?.accountsClearance?.status || accountsClearance?.status;
      if (acct !== 'cleared') {
        return res.status(400).json({ error: 'Accounts clearance must be cleared before Legal clearance.' });
      }
    }
    if (projectsClearance?.status === 'cleared') {
      const legal = existing?.legalClearance?.status || legalClearance?.status;
      if (legal !== 'cleared') {
        return res.status(400).json({ error: 'Legal clearance must be cleared before Projects clearance.' });
      }
    }
    if (facilityClearance?.status === 'cleared') {
      const projects = existing?.projectsClearance?.status || projectsClearance?.status;
      if (projects !== 'cleared') {
        return res.status(400).json({ error: 'Projects clearance must be cleared before Facility clearance.' });
      }
    }

    const updates = { unitId, ...rest };
    if (accountsClearance) updates.accountsClearance = accountsClearance;
    if (legalClearance) updates.legalClearance = legalClearance;
    if (projectsClearance) updates.projectsClearance = projectsClearance;
    if (facilityClearance) updates.facilityClearance = facilityClearance;

    let record = await PossessionClearance.findOneAndUpdate(
      { unitId },
      updates,
      { new: true, upsert: true, runValidators: true }
    );

    record.overallStatus = computeOverall(record);
    await record.save();
    res.json(record);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
