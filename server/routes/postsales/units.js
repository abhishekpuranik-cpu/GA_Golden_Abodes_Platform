import { Router } from 'express';
import multer from 'multer';
import Unit from '../../models/postsales/Unit.js';
import Customer from '../../models/postsales/Customer.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import { ensureMongo } from '../../lib/mongo.js';
import { buildPipelineStepDocs } from '../../lib/postsales/helpers.js';
import { purgeAndDisableAutoSync } from '../../lib/postsales/purgeUnitData.js';
import {
  buildTemplateWorkbook,
  listImportBatches,
  processCrmImport,
  sheetToRows,
} from '../../lib/postsales/crmUnitImport.js';

const router = Router();
const PURGE_CONFIRM = 'DELETE_ALL_UNITS';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
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

router.get('/list', async (req, res) => {
  try {
    const filter = {};
    if (req.query.project) filter.project = req.query.project;
    if (req.query.phase) filter.phase = req.query.phase;
    if (req.query.building) {
      filter.$or = [{ building: req.query.building }, { tower: req.query.building }];
    }
    const units = await Unit.find(filter)
      .populate('customerId', 'name fundingType')
      .select('project unitNumber phase building tower entity fundingType')
      .sort({ project: 1, unitNumber: 1 })
      .lean();
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

    const units = await Unit.find(filter).populate('customerId').sort({ updatedAt: -1 }).lean();
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
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id).populate('customerId').lean();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const steps = await PipelineStep.find({ unitId: unit._id }).sort({ stepNumber: 1 }).lean();
    res.json({ ...unit, customer: unit.customerId, steps });
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

router.delete('/:id', async (req, res) => {
  try {
    const unit = await Unit.findByIdAndDelete(req.params.id);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    await PipelineStep.deleteMany({ unitId: unit._id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
