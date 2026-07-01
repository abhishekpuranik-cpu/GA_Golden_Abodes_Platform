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
import {
  rowsWithChangedAchievedDates,
  syncProjectScheduleAchievedDates,
} from '../../lib/postsales/clpScheduleSync.js';

const router = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function syncAchievedRows(project, rows, { phase, building, by, syncTasks = true, rowsOnly } = {}) {
  const achievedRows = (rowsOnly || rows || []).filter((r) => r.achievedDate && r.milestone);
  if (!achievedRows.length) return null;
  return syncProjectScheduleAchievedDates(project, {
    phase: phase || '',
    building: building || '',
    by: by || 'CLP Schedule',
    rowsOnly: achievedRows,
    syncTasks,
  });
}

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

    const prev = await ProjectClpSchedule.findOne({ project }).lean();
    const rows = normalizeClpScheduleRows(req.body.rows || [], project);
    const doc = await saveProjectClpSchedule(project, rows, req.body.updatedBy || '');

    let sync = null;
    if (req.body.syncOnSave !== false) {
      const changedRows = rowsWithChangedAchievedDates(prev?.rows, rows);
      sync = changedRows.length
        ? await syncAchievedRows(project, rows, {
          phase: req.body.phase,
          building: req.body.building,
          by: req.body.updatedBy || 'Milestones tab',
          syncTasks: req.body.syncTasks !== false,
          rowsOnly: changedRows,
        })
        : { results: [], totals: { milestones: 0, forecastsUpdated: 0, tasksCreated: 0 }, errors: [], unitsAffected: 0, skipped: true, reason: 'No achieved dates changed' };
    }

    res.json({ ...doc, sync });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Save failed' });
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

    const prev = await ProjectClpSchedule.findOne({ project }).lean();
    const rawRows = parseClpScheduleWorkbook(req.file.buffer);
    const rows = normalizeClpScheduleRows(rawRows, project);
    const doc = await saveProjectClpSchedule(project, rows, req.body.updatedBy || 'Upload');

    const changedRows = rowsWithChangedAchievedDates(prev?.rows, rows);
    const sync = changedRows.length
      ? await syncAchievedRows(project, rows, {
        phase: req.body.phase,
        building: req.body.building,
        by: req.body.updatedBy || 'Upload',
        rowsOnly: changedRows,
      })
      : null;

    res.json({ ok: true, rowCount: rows.length, schedule: doc, sync });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Upload failed' });
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
      tower: req.body.building || req.body.tower || '',
      phase: req.body.phase || '',
      by: req.body.by || 'Milestones tab',
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/clp-schedule/sync-achieved', async (req, res) => {
  try {
    const project = String(req.body.project || '').trim();
    if (!project) return res.status(400).json({ error: 'project required' });
    const doc = await ProjectClpSchedule.findOne({ project }).lean();
    if (!doc) return res.status(404).json({ error: 'CLP schedule not found' });

    const sync = await syncAchievedRows(project, doc.rows, {
      phase: req.body.phase,
      building: req.body.building,
      by: req.body.by || 'Milestones tab',
      syncTasks: req.body.syncTasks !== false,
    });
    res.json(sync || { results: [], totals: {}, errors: [], unitsAffected: 0 });
  } catch (e) {
    res.status(400).json({ error: e.message || 'Sync failed' });
  }
});

export default router;
