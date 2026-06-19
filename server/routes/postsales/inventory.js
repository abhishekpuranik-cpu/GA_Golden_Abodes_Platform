import { Router } from 'express';

import { ensureMongo } from '../../lib/mongo.js';

import {

  buildInventoryFilterOptions,

  getV1InventoryStatus,

  syncSoldUnitsFromCashflowV1,

} from '../../lib/postsales/cashflowV1Sync.js';

import {

  addCatalogBuilding,

  addCatalogPhase,

  addCatalogProject,

  deleteCatalogBuilding,

  deleteCatalogPhase,

  deleteCatalogProject,

  getCatalogWithCounts,

  importCatalogFromV1,

  pushCatalogToV1,

  updateCatalogBuilding,

  updateCatalogPhase,

  updateCatalogProject,

} from '../../lib/postsales/inventoryCatalog.js';



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



router.get('/catalog', async (req, res) => {

  try {

    const db = await ensureMongo();

    res.json(await getCatalogWithCounts(db));

  } catch (err) {

    res.status(500).json({ error: err.message });

  }

});



router.post('/catalog/projects', async (req, res) => {

  try {

    const db = await ensureMongo();

    res.json(await addCatalogProject(db, req.body || {}));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.patch('/catalog/projects', async (req, res) => {

  try {

    const { oldName, ...body } = req.body || {};

    if (!oldName) return res.status(400).json({ error: 'oldName is required' });

    const db = await ensureMongo();

    res.json(await updateCatalogProject(db, oldName, body));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.delete('/catalog/projects/:name', async (req, res) => {

  try {

    const db = await ensureMongo();

    res.json(await deleteCatalogProject(db, req.params.name, { force: req.query.force === 'true' }));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.post('/catalog/phases', async (req, res) => {

  try {

    const { project, name } = req.body || {};

    if (!project) return res.status(400).json({ error: 'project is required' });

    const db = await ensureMongo();

    res.json(await addCatalogPhase(db, project, name));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.patch('/catalog/phases', async (req, res) => {

  try {

    const { project, oldName, name } = req.body || {};

    if (!project || !oldName) return res.status(400).json({ error: 'project and oldName are required' });

    const db = await ensureMongo();

    res.json(await updateCatalogPhase(db, project, oldName, name));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.delete('/catalog/phases', async (req, res) => {

  try {

    const { project, name } = req.query;

    if (!project || !name) return res.status(400).json({ error: 'project and name query params are required' });

    const db = await ensureMongo();

    res.json(await deleteCatalogPhase(db, project, name, { force: req.query.force === 'true' }));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.post('/catalog/buildings', async (req, res) => {

  try {

    const { project, phase, name } = req.body || {};

    if (!project || !phase) return res.status(400).json({ error: 'project and phase are required' });

    const db = await ensureMongo();

    res.json(await addCatalogBuilding(db, project, phase, name));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.patch('/catalog/buildings', async (req, res) => {

  try {

    const { project, phase, oldName, name } = req.body || {};

    if (!project || !phase || !oldName) return res.status(400).json({ error: 'project, phase, and oldName are required' });

    const db = await ensureMongo();

    res.json(await updateCatalogBuilding(db, project, phase, oldName, name));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.delete('/catalog/buildings', async (req, res) => {

  try {

    const { project, phase, name } = req.query;

    if (!project || !phase || !name) return res.status(400).json({ error: 'project, phase, and name query params are required' });

    const db = await ensureMongo();

    res.json(await deleteCatalogBuilding(db, project, phase, name, { force: req.query.force === 'true' }));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.post('/catalog/import-v1', async (req, res) => {

  try {

    const db = await ensureMongo();

    res.json(await importCatalogFromV1(db));

  } catch (err) {

    res.status(400).json({ error: err.message });

  }

});



router.post('/catalog/push-v1', async (req, res) => {

  try {

    const db = await ensureMongo();

    res.json(await pushCatalogToV1(db));

  } catch (err) {

    res.status(400).json({ error: err.message });

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


