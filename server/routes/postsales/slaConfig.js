import { Router } from 'express';
import { ensureMongo } from '../../lib/mongo.js';
import { ESCALATION_MATRIX } from '../../lib/postsales/steps.js';
import {
  ensureActivityShape,
  loadActivityCatalog,
  saveActivityCatalog,
} from '../../lib/postsales/activityCatalog.js';
import { requireAllocationAdmin } from '../../lib/postsales/allocationAdmin.js';
import { recalculateAllPipelineSlas } from '../../lib/postsales/recalculatePipelineSla.js';

const router = Router();

const SLA_FIELDS = [
  'slaDays',
  'slaUnit',
  'slaAck',
  'slaResolution',
  'triggerEvent',
  'blockedBy',
  'escalation',
];

function pickSlaFields(raw) {
  const out = { number: Number(raw.number) };
  if (!out.number) return null;
  for (const key of SLA_FIELDS) {
    if (raw[key] !== undefined) out[key] = raw[key];
  }
  return out;
}

router.get('/', async (_req, res) => {
  try {
    const db = await ensureMongo();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const { activities, updatedAt } = await loadActivityCatalog(db);
    res.json({
      steps: activities,
      updatedAt,
      escalationMatrix: ESCALATION_MATRIX,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', requireAllocationAdmin, async (req, res) => {
  try {
    const db = await ensureMongo();
    if (!db) return res.status(503).json({ error: 'Database unavailable' });
    const incoming = Array.isArray(req.body?.steps) ? req.body.steps : null;
    if (!incoming?.length) return res.status(400).json({ error: 'steps array required' });

    const { activities: existing } = await loadActivityCatalog(db);
    const byNumber = Object.fromEntries(existing.map((a) => [a.number, a]));

    for (const raw of incoming) {
      const patch = pickSlaFields(raw);
      if (!patch || !byNumber[patch.number]) continue;
      byNumber[patch.number] = ensureActivityShape({ ...byNumber[patch.number], ...patch, number: patch.number });
    }

    const saved = await saveActivityCatalog(db, Object.values(byNumber));
    res.json({
      steps: saved.activities,
      updatedAt: saved.updatedAt,
      escalationMatrix: ESCALATION_MATRIX,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/recalculate', requireAllocationAdmin, async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true;
    const project = req.body?.project ? String(req.body.project).trim() : '';
    const phase = req.body?.phase ? String(req.body.phase).trim() : '';
    const result = await recalculateAllPipelineSlas({
      project: project || undefined,
      phase: phase || undefined,
      dryRun,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
