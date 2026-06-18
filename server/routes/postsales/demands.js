import { Router } from 'express';
import Demand from '../../models/postsales/Demand.js';
import Unit from '../../models/postsales/Unit.js';

const router = Router();

function buildUnitFilter(query = {}) {
  const filter = {};
  if (query.project) filter.project = query.project;
  if (query.phase) filter.phase = query.phase;
  if (query.building) filter.$or = [{ building: query.building }, { tower: query.building }];
  return filter;
}

function enrichDemand(d, unitMap) {
  const u = unitMap[String(d.unitId)];
  const due = d.totalAmount || 0;
  const received = d.paidAmount || 0;
  return {
    ...d,
    unitNumber: u?.unitNumber,
    project: u?.project,
    phase: u?.phase,
    building: u?.building || u?.tower,
    customerName: u?.customerId?.name,
    dueAmount: due,
    receivedAmount: received,
    pendingAmount: due - received,
  };
}

async function filteredUnitIds(query) {
  const filter = buildUnitFilter(query);
  if (!Object.keys(filter).length) return null;
  const units = await Unit.find(filter, { _id: 1 }).lean();
  return units.map((u) => u._id);
}

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.unitId) filter.unitId = req.query.unitId;
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;

    const scopedUnitIds = await filteredUnitIds(req.query);
    if (scopedUnitIds) filter.unitId = { $in: scopedUnitIds };

    const demands = await Demand.find(filter).sort({ issuedDate: -1 }).lean();
    const unitIds = [...new Set(demands.map((d) => String(d.unitId)))];
    const units = await Unit.find({ _id: { $in: unitIds } }).populate('customerId').lean();
    const unitMap = Object.fromEntries(units.map((u) => [String(u._id), u]));

    const enriched = demands.map((d) => enrichDemand(d, unitMap));

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

router.post('/', async (req, res) => {
  try {
    const unit = await Unit.findById(req.body.unitId);
    if (!unit) return res.status(404).json({ error: 'Unit not found' });
    const payload = { ...req.body, entity: unit.entity };
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

    const report = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      try {
        const project = String(row.project || '').trim();
        const unitNumber = String(row.unitNumber || '').trim();
        if (!project || !unitNumber) {
          report.skipped += 1;
          report.errors.push({ row, error: 'project and unitNumber required' });
          continue;
        }

        const unit = await Unit.findOne({ project, unitNumber });
        if (!unit) {
          report.skipped += 1;
          report.errors.push({ row, error: `Unit not found: ${project} · ${unitNumber}` });
          continue;
        }

        const dueAmount = Number(row.dueAmount ?? row.totalAmount ?? row.demandAmount ?? 0);
        const receivedAmount = Number(row.receivedAmount ?? row.paidAmount ?? 0);
        const gstAmount = Number(row.gstAmount ?? Math.round(dueAmount * 0.05));
        const totalAmount = Number(row.totalAmount ?? dueAmount + gstAmount);
        const milestoneName = String(row.milestoneName || row.milestone || 'CLP milestone').trim();
        const clpPercent = Number(row.clpPercent ?? row.clp ?? 0) || undefined;

        const match = {
          unitId: unit._id,
          milestoneName,
          ...(clpPercent ? { clpPercent } : {}),
        };

        const existing = await Demand.findOne(match);
        const paymentStatus = receivedAmount >= totalAmount
          ? 'paid'
          : receivedAmount > 0
            ? 'partial'
            : row.paymentStatus || 'pending';

        const payload = {
          entity: unit.entity,
          milestoneName,
          clpPercent,
          demandAmount: dueAmount,
          gstAmount,
          totalAmount,
          paidAmount: receivedAmount,
          paymentStatus,
          issuedDate: row.issuedDate ? new Date(row.issuedDate) : existing?.issuedDate || new Date(),
          dueDate: row.dueDate ? new Date(row.dueDate) : existing?.dueDate,
          paidDate: row.paidDate ? new Date(row.paidDate) : receivedAmount > 0 ? new Date() : undefined,
          receiptNumber: row.receiptNumber || existing?.receiptNumber,
        };

        if (existing) {
          await Demand.findByIdAndUpdate(existing._id, payload);
          report.updated += 1;
        } else {
          await Demand.create({ unitId: unit._id, ...payload });
          report.created += 1;
        }
      } catch (err) {
        report.errors.push({ row, error: err.message });
      }
    }

    res.json({ ok: true, ...report });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { paymentStatus, paidAmount, paidDate, receiptNumber, demandAmount, gstAmount, totalAmount } = req.body;
    const updates = {};
    if (paymentStatus !== undefined) updates.paymentStatus = paymentStatus;
    if (paidAmount !== undefined) updates.paidAmount = paidAmount;
    if (paidDate !== undefined) updates.paidDate = paidDate;
    if (receiptNumber !== undefined) updates.receiptNumber = receiptNumber;
    if (demandAmount !== undefined) updates.demandAmount = demandAmount;
    if (gstAmount !== undefined) updates.gstAmount = gstAmount;
    if (totalAmount !== undefined) updates.totalAmount = totalAmount;

    const demand = await Demand.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!demand) return res.status(404).json({ error: 'Demand not found' });

    if (demand.paidAmount >= demand.totalAmount) {
      demand.paymentStatus = 'paid';
      await demand.save();
    } else if (demand.paidAmount > 0) {
      demand.paymentStatus = 'partial';
      await demand.save();
    }

    res.json(demand);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
