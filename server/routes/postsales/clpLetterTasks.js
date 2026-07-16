import { Router } from 'express';
import ClpLetterTask from '../../models/postsales/ClpLetterTask.js';
import Unit from '../../models/postsales/Unit.js';
import { attachPostSalesUser, actorLabel } from '../../lib/postsales/activity.js';
import {
  addClpLetterTaskComment,
  completeAllClpLetterChecklist,
  completeClpLetterTask,
  ensureClpLetterTasksForUnit,
  getClpLetterTaskLog,
  listClpLetterTasksForUnit,
  toggleClpLetterChecklist,
  updateClpLetterTaskMeta,
  updateClpLetterTaskStatus,
} from '../../lib/postsales/clpLetterTasks.js';

const router = Router();
router.use(attachPostSalesUser);

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.unitId) filter.unitId = req.query.unitId;
    if (req.query.demandId) filter.demandId = req.query.demandId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.assignee) filter.assignee = new RegExp(`^${String(req.query.assignee).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

    const tasks = await ClpLetterTask.find(filter).sort({ dueDate: 1, createdAt: -1 }).lean();
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/unit/:unitId', async (req, res) => {
  try {
    const tasks = await listClpLetterTasksForUnit(req.params.unitId);
    res.json({ tasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/unit/:unitId/sync', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    const result = await ensureClpLetterTasksForUnit(req.params.unitId, by);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/log', async (req, res) => {
  try {
    const log = await getClpLetterTaskLog(req.params.id);
    res.json({ log });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const task = await ClpLetterTask.findById(req.params.id).lean();
    if (!task) return res.status(404).json({ error: 'CLP letter task not found' });
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    const task = await ClpLetterTask.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'CLP letter task not found' });

    if (req.body.assignee !== undefined) task.assignee = req.body.assignee;
    if (req.body.dueDate !== undefined) task.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
    if (req.body.note !== undefined) task.note = req.body.note;
    if (req.body.nextAction !== undefined) task.nextAction = req.body.nextAction;
    if (req.body.nextActionDate !== undefined) {
      task.nextActionDate = req.body.nextActionDate ? new Date(req.body.nextActionDate) : null;
    }
    await task.save();
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/comments', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    const { text, nextAction, nextActionDate } = req.body;
    let task = await addClpLetterTaskComment(req.params.id, text, by);
    if (nextAction !== undefined || nextActionDate !== undefined) {
      task = await updateClpLetterTaskMeta(req.params.id, { nextAction, nextActionDate, by });
    }
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/meta', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    const task = await updateClpLetterTaskMeta(req.params.id, {
      nextAction: req.body.nextAction,
      nextActionDate: req.body.nextActionDate,
      note: req.body.note,
      by,
    });
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    const { status, note } = req.body;
    if (!status) return res.status(400).json({ error: 'status required' });
    const task = await updateClpLetterTaskStatus(req.params.id, status, by, note);
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/checklist/complete-all', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    const task = await completeAllClpLetterChecklist(req.params.id, by);
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/checklist/:index', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    const task = await toggleClpLetterChecklist(req.params.id, Number(req.params.index), req.body.done, by);
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/complete', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    const task = await completeClpLetterTask(req.params.id, by, req.body.note);
    res.json(task);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
