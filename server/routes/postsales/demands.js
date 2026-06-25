import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import Demand from '../../models/postsales/Demand.js';
import Unit from '../../models/postsales/Unit.js';
import { ensureMongo } from '../../lib/mongo.js';
import { normalizeImportRow, paymentStatusFromAmounts } from '../../lib/postsales/collectionsLib.js';
import { activateClpLetterTaskFromDemand } from '../../lib/postsales/clpDemandTrigger.js';
import { isGstDemand, readGstDue, readGstReceived } from '../../lib/postsales/demandAmounts.js';
import { formatMilestoneLabel } from '../../lib/postsales/milestoneLabels.js';
import { sortDemandsByClpChronology } from '../../lib/postsales/clpMilestoneOrder.js';
import { backfillMilestoneOrders, backfillPostStageOrders } from '../../lib/postsales/milestoneOrderBackfill.js';
import { exportCollectionsForCashflow, syncDemandsFromV1 } from '../../lib/postsales/demandsV1Sync.js';
import { syncSoldUnitsFromCashflowV1 } from '../../lib/postsales/cashflowV1Sync.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

function buildUnitFilter(query = {}) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.phase) filter.phase = query.phase;
  if (query.building) filter.$or = [{ building: query.building }, { tower: query.building }];
  return filter;
}

function enrichDemand(d, unitMap) {
  const u = unitMap[String(d.unitId)];
  const received = Number(d.paidAmount) || 0;
  const agreementDue = isGstDemand(d)
    ? 0
    : (Number(d.demandAmount) || Math.max(0, (Number(d.totalAmount) || 0) - (Number(d.gstAmount) || 0)));
  const gstDue = isGstDemand(d) ? readGstDue(d) : (Number(d.gstAmount) || Math.round(agreementDue * 0.05));
  return {
    ...d,
    unitNumber: u?.unitNumber,
    project: u?.project,
    phase: u?.phase,
    building: u?.building || u?.tower,
    customerName: u?.customerId?.name,
    milestoneName: formatMilestoneLabel(d.milestoneName),
    milestoneNameRaw: d.milestoneName,
    milestoneOrder: d.milestoneOrder,
    targetDate: d.targetDate || d.dueDate,
    actualDate: d.actualDate,
    clpLetterTaskAt: d.clpLetterTaskAt,
    dueAmount: agreementDue,
    receivedAmount: received,
    pendingAmount: Number.isFinite(Number(d.pendingAmount))
      ? Number(d.pendingAmount)
      : (isGstDemand(d)
        ? Math.max(0, readGstDue(d) - readGstReceived(d))
        : Math.max(0, agreementDue - received)),
    gstAmount: isGstDemand(d) ? readGstDue(d) : (Number(d.gstAmount) || Math.round(agreementDue * 0.05)),
  };
}

async function filteredUnitIds(query) {
  const filter = buildUnitFilter(query);
  if (!Object.keys(filter).length) return null;
  const units = await Unit.find(filter, { _id: 1 }).lean();
  return units.map((u) => u._id);
}

async function importDemandRows(rows, { source = 'upload' } = {}) {
  const report = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (const raw of rows) {
    try {
      const row = normalizeImportRow(raw);
      if (!row.project || !row.unitNumber) {
        report.skipped += 1;
        report.errors.push({ row: raw, error: 'project and unitNumber required' });
        continue;
      }

      const unit = await Unit.findOne({ project: row.project, unitNumber: row.unitNumber });
      if (!unit) {
        report.skipped += 1;
        report.errors.push({ row: raw, error: `Unit not found: ${row.project} · ${row.unitNumber}` });
        continue;
      }

      const match = { unitId: unit._id, milestoneName: row.milestoneName };
      if (row.clpPercent) match.clpPercent = row.clpPercent;
      const existing = await Demand.findOne(match);

      const payload = {
        entity: unit.entity,
        milestoneName: row.milestoneName,
        clpPercent: row.clpPercent,
        demandAmount: row.dueAmount,
        gstAmount: row.gstAmount,
        totalAmount: row.totalAmount,
        paidAmount: row.receivedAmount,
        paymentStatus: paymentStatusFromAmounts(row.totalAmount, row.receivedAmount),
        issuedDate: existing?.issuedDate || new Date(),
        targetDate: row.dueDate ? new Date(row.dueDate) : existing?.targetDate,
        dueDate: row.dueDate ? new Date(row.dueDate) : existing?.dueDate,
        paidDate: row.receivedAmount > 0 ? new Date() : undefined,
        source,
      };

      if (existing) {
        await Demand.findByIdAndUpdate(existing._id, payload);
        report.updated += 1;
      } else {
        await Demand.create({ unitId: unit._id, ...payload });
        report.created += 1;
      }
    } catch (err) {
      report.errors.push({ row: raw, error: err.message });
    }
  }

  return report;
}

function sheetToRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

router.get('/export', async (req, res) => {
  try {
    const data = await exportCollectionsForCashflow({
      project: req.query.project || undefined,
      phase: req.query.phase || undefined,
      building: req.query.building || undefined,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sync-from-v1', async (req, res) => {
  try {
    const db = await ensureMongo();
    const result = await syncDemandsFromV1(db, {
      project: req.body?.project || req.query.project || undefined,
    });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.unitId) filter.unitId = req.query.unitId;
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

    const scopedUnitIds = await filteredUnitIds(req.query);
    if (scopedUnitIds) filter.unitId = { $in: scopedUnitIds };

    const demands = await Demand.find(filter).sort({ issuedDate: -1 }).lean();
    await backfillMilestoneOrders(Demand, demands);
    await backfillPostStageOrders(Demand, demands);
    const unitIds = [...new Set(demands.map((d) => String(d.unitId)))];
    const units = await Unit.find({ _id: { $in: unitIds } }).populate('customerId').lean();
    const unitMap = Object.fromEntries(units.map((u) => [String(u._id), u]));

    const enriched = sortDemandsByClpChronology(demands.map((d) => enrichDemand(d, unitMap)));

    const totalDue = enriched.reduce((s, d) => s + (d.dueAmount || 0), 0);
    const totalReceived = enriched.reduce((s, d) => s + (d.receivedAmount || 0), 0);

    res.json({
      demands: enriched,
      summary: {
        totalDemanded: totalDue,
        totalDue,
        totalCollected: totalReceived,
        totalReceived,
        totalOutstanding: totalDue - totalReceived,
        totalPending: totalDue - totalReceived,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file?.buffer) return res.status(400).json({ error: 'Excel file required (field name: file)' });
    const rows = sheetToRows(req.file.buffer);
    const report = await importDemandRows(rows, { source: 'upload' });
    res.json({ ok: true, ...report, rowCount: rows.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const unit = await Unit.findById(req.body.unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const payload = { ...req.body, entity: unit.entity, source: req.body.source || 'manual' };
    delete payload.entityOverride;
    const demand = await Demand.create(payload);
    res.status(201).json(demand);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/import', async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : Array.isArray(req.body) ? req.body : [];
    if (!rows.length) return res.status(400).json({ error: 'rows array required' });
    const report = await importDemandRows(rows, { source: 'upload' });
    res.json({ ok: true, ...report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/clp-letter-task', async (req, res) => {
  try {
    const demand = await Demand.findById(req.params.id).lean();
    if (!demand) return res.status(404).json({ error: 'Demand not found' });
    const result = await activateClpLetterTaskFromDemand(demand, { by: req.body.by || 'Demands panel' });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const prev = await Demand.findById(req.params.id);
    if (!prev) return res.status(404).json({ error: 'Demand not found' });

    const {
      paymentStatus, paidAmount, paidDate, receiptNumber,
      demandAmount, gstAmount, totalAmount, targetDate, actualDate, by,
    } = req.body;
    const updates = { source: req.body.source || 'payment' };
    if (paymentStatus !== undefined) updates.paymentStatus = paymentStatus;
    if (paidAmount !== undefined) updates.paidAmount = paidAmount;
    if (paidDate !== undefined) updates.paidDate = paidDate;
    if (receiptNumber !== undefined) updates.receiptNumber = receiptNumber;
    if (demandAmount !== undefined) updates.demandAmount = demandAmount;
    if (gstAmount !== undefined) updates.gstAmount = gstAmount;
    if (totalAmount !== undefined) updates.totalAmount = totalAmount;
    if (targetDate !== undefined) {
      updates.targetDate = targetDate ? new Date(targetDate) : null;
      updates.dueDate = targetDate ? new Date(targetDate) : null;
    }
    if (actualDate !== undefined) {
      updates.actualDate = actualDate ? new Date(actualDate) : null;
    }

    const demand = await Demand.findByIdAndUpdate(req.params.id, updates, { new: true });

    if (demand.paidAmount >= demand.totalAmount) {
      demand.paymentStatus = 'paid';
      await demand.save();
    } else if (demand.paidAmount > 0) {
      demand.paymentStatus = 'partial';
      await demand.save();
    }

    if (actualDate && !prev.actualDate) {
      await activateClpLetterTaskFromDemand(demand.toObject(), { by: by || 'Demands panel' });
      demand.clpLetterTaskAt = new Date();
      await demand.save();
    }

    const unit = await Unit.findById(demand.unitId).populate('customerId').lean();
    res.json(enrichDemand(demand.toObject(), { [String(demand.unitId)]: unit }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
