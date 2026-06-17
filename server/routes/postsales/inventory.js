import { Router } from 'express';
import { ensureMongo } from '../../lib/mongo.js';
import {
  buildInventoryFilterOptions,
  getV1InventoryStatus,
  syncSoldUnitsFromCashflowV1,
} from '../../lib/postsales/cashflowV1Sync.js';

const router = Router();

router.get('/filters', async (req, res) => {
  try {
    const db = await ensureMongo();
    const options = await buildInventoryFilterOptions(db, {
      project: req.query.project || undefined,
      phase: req.query.phase || undefined,
    });
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/v1-status', async (req, res) => {
  try {
    const db = await ensureMongo();
    res.json(await getV1InventoryStatus(db));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync-v1', async (req, res) => {
  try {
    const db = await ensureMongo();
    const result = await syncSoldUnitsFromCashflowV1(db, {
      project: req.body?.project || req.query.project || undefined,
      dryRun: !!req.body?.dryRun,
    });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
