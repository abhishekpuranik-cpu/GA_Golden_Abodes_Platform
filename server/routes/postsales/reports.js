import { Router } from 'express';
import multer from 'multer';
import Unit from '../../models/postsales/Unit.js';
import Demand from '../../models/postsales/Demand.js';
import {
  buildCollectionRegisterWorkbook,
  buildForecastUpdatesFromExcel,
  buildReportsTemplateWorkbook,
  parseReportsWorkbook,
} from '../../lib/postsales/collectionReportsExcel.js';
import { buildDisbursementForecast } from '../../lib/postsales/collectionReports.js';
import { loadCollectionRegister, upsertForecastPayload } from '../../lib/postsales/loadCollectionRegister.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.get('/collection-register', async (req, res) => {
  try {
    const { rows, summary, asOf } = await loadCollectionRegister(req.query);
    res.json({ rows, summary, asOf });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/disbursement-forecast', async (req, res) => {
  try {
    const { rows, demandsByUnit } = await loadCollectionRegister(req.query);
    const data = buildDisbursementForecast(
      rows,
      demandsByUnit,
      {
        from: req.query.from,
        to: req.query.to,
        categoryFilter: req.query.category || '',
      },
    );
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/template', (_req, res) => {
  const buf = buildReportsTemplateWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="PostSales_Reports_Template.xlsx"');
  res.send(buf);
});

router.get('/export', async (req, res) => {
  try {
    const { rows, demandsByUnit } = await loadCollectionRegister(req.query);
    const disbData = buildDisbursementForecast(rows, demandsByUnit, {
      from: req.query.from,
      to: req.query.to,
    });
    const buf = buildCollectionRegisterWorkbook(rows, disbData);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="PostSales_Collection_Register_${stamp}.xlsx"`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Excel file required (field: file)' });

    const { registerRows, forecastRows } = parseReportsWorkbook(req.file.buffer);
    const units = await Unit.find({ overallStatus: { $ne: 'cancelled' } }, { _id: 1, project: 1, unitNumber: 1 }).lean();
    const unitLookup = new Map(units.map((u) => [`${u.project}|${u.unitNumber}`, u]));

    const { updates, errors } = buildForecastUpdatesFromExcel(registerRows, forecastRows, unitLookup);

    const unitIds = updates.map((u) => u.unitId);
    const demands = await Demand.find({ unitId: { $in: unitIds } }).lean();
    const demandsByUnit = new Map();
    for (const d of demands) {
      const k = String(d.unitId);
      if (!demandsByUnit.has(k)) demandsByUnit.set(k, []);
      demandsByUnit.get(k).push(d);
    }

    const slug = (s) => String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    const matchDemand = (unitDemands, milestoneName) => unitDemands.find((d) => {
      const a = slug(milestoneName);
      return slug(d.milestoneName) === a || slug(d.milestoneName).includes(a) || a.includes(slug(d.milestoneName));
    });

    let saved = 0;
    for (const u of updates) {
      const unitDemands = demandsByUnit.get(String(u.unitId)) || [];
      u.payload.milestones = (u.payload.milestones || []).map((m) => {
        const d = matchDemand(unitDemands, m.milestoneName);
        return d ? { ...m, demandId: d._id, milestoneName: d.milestoneName } : m;
      });
      await upsertForecastPayload(u.unitId, u.payload);
      saved += 1;
    }

    res.json({
      ok: true,
      saved,
      skipped: errors.length,
      errors: errors.slice(0, 50),
      message: `Updated forecasts for ${saved} unit(s)${errors.length ? `, ${errors.length} row(s) skipped` : ''}.`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/forecasts/:unitId', async (req, res) => {
  try {
    const { unitId } = req.params;
    const unit = await Unit.findById(unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const doc = await upsertForecastPayload(unit._id, req.body || {});
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
