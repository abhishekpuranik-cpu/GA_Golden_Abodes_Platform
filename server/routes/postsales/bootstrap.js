import { Router } from 'express';
import { ensureMongo } from '../../lib/mongo.js';
import { syncSoldUnitsFromCashflowV1 } from '../../lib/postsales/cashflowV1Sync.js';
import { syncDemandsFromV1 } from '../../lib/postsales/demandsV1Sync.js';

const router = Router();

/** Startup refresh: link sold units from V1 + pull collections into Post Sales (non-destructive). */
router.post('/', async (req, res) => {
  try {
    const db = await ensureMongo();
    const project = req.body?.project || req.query.project || undefined;
    const syncUnits = req.body?.syncUnits !== false;
    const syncDemands = req.body?.syncDemands !== false;

    const result = { ok: true, units: null, demands: null };

    if (syncUnits) {
      result.units = await syncSoldUnitsFromCashflowV1(db, { project });
    }
    if (syncDemands) {
      result.demands = await syncDemandsFromV1(db, { project });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
