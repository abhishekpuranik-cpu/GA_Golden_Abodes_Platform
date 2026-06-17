import { Router } from 'express';
import Document from '../../models/postsales/Document.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.unitId) filter.unitId = req.query.unitId;
    const docs = await Document.find(filter).sort({ stepNumber: 1, docType: 1 }).lean();
    const grouped = {};
    for (const d of docs) {
      const key = d.stepNumber || 0;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(d);
    }
    res.json({ documents: docs, grouped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const doc = await Document.create(req.body);
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.status === 'received' && !updates.receivedDate) updates.receivedDate = new Date();
    if (updates.status === 'verified' && !updates.verifiedDate) updates.verifiedDate = new Date();
    const doc = await Document.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
