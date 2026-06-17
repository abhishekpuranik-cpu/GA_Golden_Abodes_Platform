import { Router } from 'express';
import Document from '../../models/postsales/Document.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import { attachPostSalesUser, actorLabel, pushActivity } from '../../lib/postsales/activity.js';

const router = Router();

router.use(attachPostSalesUser);

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.unitId) filter.unitId = req.query.unitId;
    if (req.query.stepNumber) filter.stepNumber = Number(req.query.stepNumber);
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
    const body = { ...req.body };
    if (body.status === 'uploaded' && !body.receivedDate) body.receivedDate = new Date();
    const doc = await Document.create(body);

    if (doc.unitId && doc.stepNumber) {
      const step = await PipelineStep.findOne({ unitId: doc.unitId, stepNumber: doc.stepNumber });
      if (step) {
        const by = actorLabel(req, req.body);
        pushActivity(step, 'document_uploaded', by, doc.label || doc.docType);
        await step.save();
      }
    }

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
