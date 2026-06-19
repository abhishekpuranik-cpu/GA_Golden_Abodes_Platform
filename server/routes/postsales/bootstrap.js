import { Router } from 'express';
import { ensureMongo } from '../../lib/mongo.js';
import { syncSoldUnitsFromCashflowV1 } from '../../lib/postsales/cashflowV1Sync.js';
import { syncDemandsFromV1 } from '../../lib/postsales/demandsV1Sync.js';
import { getSyncPreferences } from '../../lib/postsales/purgeUnitData.js';

const router = Router();

/** Startup refresh: link sold units from V1 + pull collections (respects sync preferences). */
router.get('/sync-preferences', async (req, res) => {
  try {
    const db = await ensureMongo();
    res.json(await getSyncPreferences(db));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = await ensureMongo();
    const prefs = await getSyncPreferences(db);
    const project = req.body?.project || req.query.project || undefined;
    const syncUnits = req.body?.syncUnits !== false && prefs.autoSyncUnitsOnLoad;
    const syncDemands = req.body?.syncDemands !== false && prefs.autoSyncDemandsOnLoad;

    const result = { ok: true, units: null, demands: null, skipped: [] };

    if (req.body?.syncUnits === false) result.skipped.push('units');
    else if (!syncUnits) result.skipped.push('units (auto-sync off)');

    if (req.body?.syncDemands === false) result.skipped.push('demands');
    else if (!syncDemands) result.skipped.push('demands (auto-sync off)');

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
