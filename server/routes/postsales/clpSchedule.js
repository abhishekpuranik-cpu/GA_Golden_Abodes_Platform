import { Router } from 'express';
import multer from 'multer';
import ProjectClpSchedule from '../../models/postsales/ProjectClpSchedule.js';
import {
  buildClpScheduleTemplate,
  normalizeClpScheduleRows,
  parseClpScheduleWorkbook,
  saveProjectClpSchedule,
  triggerDemandTasksForAchievedRow,
} from '../../lib/postsales/projectClpSchedule.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/clp-schedule', async (req, res) => {
  try {
    const project = String(req.query.project || '').trim();
    if (!project) return res.status(400).json({ error: 'project query required' });
    const doc = await ProjectClpSchedule.findOne({ project }).lean();
    res.json(doc || { project, rows: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/clp-schedule', async (req, res) => {
  try {
    const project = String(req.body.project || '').trim();
    if (!project) return res.status(400).json({ error: 'project required' });
    const rows = normalizeClpScheduleRows(req.body.rows || [], project);
    const doc = await saveProjectClpSchedule(project, rows, req.body.updatedBy || '');
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/clp-schedule/template', (_req, res) => {
  const buf = buildClpScheduleTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="CLP_Schedule_Template.xlsx"');
  res.send(buf);
});

router.post('/clp-schedule/upload', upload.single('file'), async (req, res) => {
  try {
    const project = String(req.body.project || req.query.project || '').trim();
    if (!project) return res.status(400).json({ error: 'project required' });
    if (!req.file?.buffer) return res.status(400).json({ error: 'Excel file required (field: file)' });
    const rawRows = parseClpScheduleWorkbook(req.file.buffer);
    const rows = normalizeClpScheduleRows(rawRows, project);
    const doc = await saveProjectClpSchedule(project, rows, req.body.updatedBy || 'Upload');
    res.json({ ok: true, rowCount: rows.length, schedule: doc });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/clp-schedule/trigger-demands', async (req, res) => {
  try {
    const project = String(req.body.project || '').trim();
    const rowId = req.body.rowId;
    if (!project || !rowId) return res.status(400).json({ error: 'project and rowId required' });

    const doc = await ProjectClpSchedule.findOne({ project });
    if (!doc) return res.status(404).json({ error: 'CLP schedule not found' });
    const row = doc.rows.id(rowId);
    if (!row) return res.status(404).json({ error: 'Schedule row not found' });

    const result = await triggerDemandTasksForAchievedRow(project, row.toObject(), {
      tower: req.body.tower || '',
      by: req.body.by || 'Milestones tab',
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
