import { Router } from 'express';
import LoanTracker from '../../models/postsales/LoanTracker.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const unitId = req.query.unitId;
    if (!unitId) return res.status(400).json({ error: 'unitId required' });
    const loan = await LoanTracker.findOne({ unitId }).lean();
    res.json(loan || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  try {
    const { unitId, ...data } = req.body;
    if (!unitId) return res.status(400).json({ error: 'unitId required' });
    const loan = await LoanTracker.findOneAndUpdate(
      { unitId },
      { ...data, unitId },
      { new: true, upsert: true, runValidators: true }
    );
    res.json(loan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
