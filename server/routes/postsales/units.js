import { Router } from 'express';
import multer from 'multer';
import Unit from '../../models/postsales/Unit.js';
import Customer from '../../models/postsales/Customer.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import { ensureMongo } from '../../lib/mongo.js';
import { buildPipelineStepDocs } from '../../lib/postsales/helpers.js';
import { purgeAndDisableAutoSync } from '../../lib/postsales/purgeUnitData.js';
import { deleteSingleUnit } from '../../lib/postsales/deleteUnit.js';
import { verifyAllocationPassword } from '../../lib/postsales/allocationAdmin.js';
import { sortUnitsChronologically } from '../../lib/postsales/unitSort.js';
import { cleanupPrefixedUnitNumbers } from '../../lib/postsales/unitNumberCleanup.js';
import {
  buildTemplateWorkbook,
  listImportBatches,
  processCrmImport,
  sheetToRows,
} from '../../lib/postsales/crmUnitImport.js';
import {
  clearUnitClpOverride,
  getUnitClpOverridePayload,
  saveUnitClpOverride,
  uploadUnitClpOverride,
} from '../../lib/postsales/unitClpOverride.js';
import { parseClpScheduleWorkbook } from '../../lib/postsales/projectClpSchedule.js';
import { actorLabel } from '../../lib/postsales/activity.js';
import { cacheKeyFromQuery, readHttpCache, writeHttpCache } from '../../lib/postsales/httpCache.js';

const router = Router();
const PURGE_CONFIRM = 'DELETE_ALL_UNITS';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const clpUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
async function createPipelineSteps(unit, fundingType) {
  await PipelineStep.insertMany(buildPipelineStepDocs(unit, fundingType));
}

router.post('/purge-all', async (req, res) => {
  try {
    if (req.body?.confirm !== PURGE_CONFIRM) {
      return res.status(400).json({
        error: `Send { "confirm": "${PURGE_CONFIRM}" } to delete all units and related data. Auto-sync from Cashflow V1 will be turned off.`,
      });
    }
    const db = await ensureMongo();
    res.json(await purgeAndDisableAutoSync(db));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/crm-template', (_req, res) => {
  const buf = buildTemplateWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="PostSales_CRM_Units_Template.xlsx"');
  res.send(buf);
});

router.get('/import-batches', async (_req, res) => {
  try {
    const db = await ensureMongo();
    res.json({ batches: await listImportBatches(db) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/crm-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Excel file required (field name: file)' });
    const db = await ensureMongo();
    const rows = sheetToRows(req.file.buffer);
    if (!rows.length) return res.status(400).json({ error: 'No data rows in file' });

    const scope = {
      project: req.query.project || req.body?.project || undefined,
      phase: req.query.phase || req.body?.phase || undefined,
      building: req.query.building || req.body?.building || undefined,
    };
    const dryRun = String(req.query.dryRun ?? 'true').toLowerCase() !== 'false';
    const importedBy = req.authUser?.name || req.authUser?.email || 'crm_upload';

    console.log(`[CRM upload] dryRun=${dryRun} scope=${JSON.stringify(scope)} rows=${rows.length}`);
    const started = Date.now();
    const report = await processCrmImport(db, rows, scope, { dryRun, importedBy });
    console.log(`[CRM upload] done in ${Date.now() - started}ms`, report.summary);
    res.json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/cleanup-unit-numbers', async (req, res) => {
  try {
    if (!verifyAllocationPassword(req.body?.password)) {
      return res.status(403).json({ error: 'Invalid admin password' });
    }
    res.json(await cleanupPrefixedUnitNumbers());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const filter = {};
    if (req.query.project) filter.project = req.query.project;
    if (req.query.phase) filter.phase = req.query.phase;
    if (req.query.building) {
      filter.$or = [{ building: req.query.building }, { tower: req.query.building }];
    }
    const units = sortUnitsChronologically(await Unit.find(filter)
      .populate('customerId', 'name fundingType')
      .select('project unitNumber phase building tower entity fundingType bookingDate')
      .lean());
    res.json(units.map((u) => ({
      _id: u._id,
      project: u.project,
      unitNumber: u.unitNumber,
      phase: u.phase,
      building: u.building || u.tower,
      entity: u.entity,
      customerName: u.customerId?.name,
      fundingType: u.fundingType || u.customerId?.fundingType,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const cacheKey = `units:${cacheKeyFromQuery(req.query)}`;
    const cached = readHttpCache(cacheKey);
    if (cached) return res.json(cached);

    const filter = {};
    if (req.query.project) filter.project = req.query.project;
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.phase) filter.phase = req.query.phase;
    if (req.query.building) {
      filter.$or = [{ building: req.query.building }, { tower: req.query.building }];
    }
    if (req.query.crmExecutive) filter.crmExecutive = req.query.crmExecutive;
    if (req.query.status) filter.overallStatus = req.query.status;
    if (req.query.importBatchId) filter.lastImportBatchId = req.query.importBatchId;

    const units = sortUnitsChronologically(await Unit.find(filter)
      .populate('customerId', 'name fundingType')
      .select('project unitNumber phase building tower entity fundingType bookingDate totalCost currentStepNumber overallStatus lastImportBatchId cxExecutive backendExecutive crmExecutive customerId')
      .lean());
    const unitIds = units.map((u) => u._id);
    const steps = unitIds.length
      ? await PipelineStep.find(
          { unitId: { $in: unitIds } },
          { unitId: 1, stepNumber: 1, status: 1, slaBreach: 1 },
        ).lean()
      : [];
    const stepsByUnit = {};
    for (const s of steps) {
      if (!stepsByUnit[s.unitId]) stepsByUnit[s.unitId] = [];
      stepsByUnit[s.unitId].push(s);
    }

    const result = units.map((u) => ({
      ...u,
      customer: u.customerId,
      customerId: u.customerId?._id || u.customerId,
      customerName: u.customerId?.name,
      fundingType: u.customerId?.fundingType,
      steps: (stepsByUnit[u._id] || []).sort((a, b) => a.stepNumber - b.stepNumber),
      slaBreachCount: (stepsByUnit[u._id] || []).filter((s) => s.slaBreach || s.status === 'overdue').length,
    }));
    writeHttpCache(cacheKey, result, 45 * 1000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/clp-override', async (req, res) => {
  try {
    res.json(await getUnitClpOverridePayload(req.params.id));
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

router.put('/:id/clp-override', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    res.json(await saveUnitClpOverride(req.params.id, req.body.rows || [], by));
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

router.delete('/:id/clp-override', async (req, res) => {
  try {
    const by = actorLabel(req, req.body);
    res.json(await clearUnitClpOverride(req.params.id, by));
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/clp-override/upload', clpUpload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Excel/CSV file required (field: file)' });
    const by = actorLabel(req, req.body);
    const rawRows = parseClpScheduleWorkbook(req.file.buffer);
    res.json(await uploadUnitClpOverride(req.params.id, rawRows, by));
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id)
      .populate('customerId', 'name email phone fundingType pan aadhaar address')
      .lean();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    res.json({ ...unit, customer: unit.customerId, customerId: unit.customerId?._id || unit.customerId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customerId, ...unitData } = req.body;
    if (!customerId) return res.status(400).json({ error: 'customerId is required' });

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const unit = await Unit.create({ ...unitData, customerId, currentStepNumber: 1 });
    await createPipelineSteps(unit, customer.fundingType);
    const populated = await Unit.findById(unit._id).populate('customerId').lean();
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('customerId');
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    res.json(unit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/delete', async (req, res) => {
  try {
    if (!verifyAllocationPassword(req.body?.password)) {
      return res.status(403).json({ error: 'Invalid admin password' });
    }
    res.json(await deleteSingleUnit(req.params.id));
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!verifyAllocationPassword(req.body?.password)) {
      return res.status(403).json({ error: 'Invalid admin password required in body' });
    }
    res.json(await deleteSingleUnit(req.params.id));
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});

export default router;
