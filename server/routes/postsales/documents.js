import { Router } from 'express';
import multer from 'multer';
import Document from '../../models/postsales/Document.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import ClpLetterTask from '../../models/postsales/ClpLetterTask.js';
import { attachPostSalesUser, actorLabel, pushActivity } from '../../lib/postsales/activity.js';
import { pushClpActivity } from '../../lib/postsales/clpLetterTasks.js';
import { ensureMongo } from '../../lib/mongo.js';
import {
  MAX_UPLOAD_BYTES,
  openPostSalesFileStream,
  storePostSalesFile
} from '../../lib/postsales/documentFiles.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 }
});

router.use(attachPostSalesUser);

async function recordDocumentUpload(req, doc) {
  const by = actorLabel(req, req.body);
  if (doc.clpLetterTaskId) {
    const task = await ClpLetterTask.findById(doc.clpLetterTaskId);
    if (task) {
      const detail = doc.checklistItem
        ? `${doc.milestoneName ? `${doc.milestoneName} · ` : ''}Checklist: ${doc.checklistItem} — ${doc.fileName || doc.label || doc.docType}`
        : (doc.label || doc.fileName || doc.docType);
      pushClpActivity(task, 'document_uploaded', by, detail);
      await task.save();
    }
  }
  if (doc.unitId && doc.stepNumber) {
    const step = await PipelineStep.findOne({ unitId: doc.unitId, stepNumber: doc.stepNumber });
    if (step) {
      pushActivity(step, 'document_uploaded', by, doc.label || doc.fileName || doc.docType);
      await step.save();
    }
  }
}

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.unitId) filter.unitId = req.query.unitId;
    if (req.query.stepNumber) filter.stepNumber = Number(req.query.stepNumber);
    if (req.query.clpLetterTaskId) filter.clpLetterTaskId = req.query.clpLetterTaskId;
    const docs = await Document.find(filter).sort({ stepNumber: 1, checklistIndex: 1, createdAt: -1 }).lean();
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

router.get('/files/:fileId', async (req, res) => {
  if (!req.psUser) return res.status(401).json({ error: 'Authentication required' });
  try {
    const db = await ensureMongo();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const opened = await openPostSalesFileStream(db, req.params.fileId);
    if (!opened) return res.status(404).json({ error: 'File not found' });
    res.setHeader('Content-Type', opened.meta.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(opened.meta.fileName || 'file')}"`
    );
    opened.stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (multerErr) => {
    if (multerErr) {
      return res.status(400).json({ error: multerErr.message || 'Upload failed' });
    }
    try {
      const { unitId, docType, label, status, clpLetterTaskId, checklistIndex, checklistItem, milestoneName } = req.body;
      const stepNumber = req.body.stepNumber ? Number(req.body.stepNumber) : undefined;
      if (!unitId || !docType) {
        return res.status(400).json({ error: 'unitId and docType are required' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'File is required' });
      }

      const body = {
        unitId,
        stepNumber,
        docType,
        label: label || undefined,
        status: status || 'uploaded',
        uploadedBy: actorLabel(req, req.body),
        ...(clpLetterTaskId ? { clpLetterTaskId } : {}),
        ...(checklistIndex != null && checklistIndex !== '' ? { checklistIndex: Number(checklistIndex) } : {}),
        ...(checklistItem ? { checklistItem } : {}),
        ...(milestoneName ? { milestoneName } : {}),
      };

      if (body.status === 'uploaded' && !body.receivedDate) body.receivedDate = new Date();

      const db = await ensureMongo();
      if (!db) return res.status(503).json({ error: 'Database unavailable' });
      const stored = await storePostSalesFile(db, {
        buffer: req.file.buffer,
        fileName: req.file.originalname || 'file',
        mimeType: req.file.mimetype || 'application/octet-stream',
        meta: {
          unitId: String(unitId),
          docType,
          uploadedBy: body.uploadedBy
        }
      });
      body.fileId = stored.id;
      body.fileName = stored.fileName;
      body.mimeType = stored.mimeType;
      body.fileSize = stored.size;

      const doc = await Document.create(body);
      await recordDocumentUpload(req, doc);
      res.status(201).json(doc);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
});

router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.status === 'uploaded' && !body.receivedDate) body.receivedDate = new Date();
    if (!body.fileId) {
      return res.status(400).json({ error: 'fileId is required — upload a file via POST /documents/upload' });
    }
    const doc = await Document.create(body);
    await recordDocumentUpload(req, doc);
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
