import Demand from '../../models/postsales/Demand.js';
import Unit from '../../models/postsales/Unit.js';
import { loadCashflowEnvelope } from '../dmGovernance/integrations/appStateReader.js';
import { extractV1SoldInventory } from './cashflowV1Sync.js';
import { normUnitKey } from './projectMap.js';
import {
  groupUnitInstallments,
  paymentStatusFromAmounts,
  demandToInstallments,
} from './collectionsLib.js';

function findV1Unit(envelope, v1ProjectId, v1UnitKey) {
  const cfg = envelope?.data?.[v1ProjectId];
  if (!cfg?.units) return null;
  return cfg.units.find((u) => normUnitKey(u.unitNo) === v1UnitKey) || null;
}

export async function extractCollectionsFromV1(db, { project } = {}) {
  const envelope = await loadCashflowEnvelope(db);
  if (!envelope) return { ok: false, error: 'Cashflow V1 state not found' };

  const v1Rows = extractV1SoldInventory(envelope);
  const filtered = project ? v1Rows.filter((r) => r.project === project) : v1Rows;
  const rows = [];

  for (const row of filtered) {
    const v1Unit = findV1Unit(envelope, row.v1ProjectId, row.v1UnitKey);
    const milestones = v1Unit ? groupUnitInstallments(v1Unit) : [];
    if (!milestones.length && row.v1ReceivedToDate > 0) {
      milestones.push({
        milestoneName: 'Collections to date',
        dueAmount: row.v1ReceivedToDate,
        receivedAmount: row.v1ReceivedToDate,
        pendingAmount: 0,
      });
    }
    for (const m of milestones) {
      rows.push({ ...row, ...m });
    }
  }

  return { ok: true, envelopeTs: envelope.ts || null, rows };
}

export async function syncDemandsFromV1(db, { project, overwrite = 'v1_only' } = {}) {
  const extracted = await extractCollectionsFromV1(db, { project });
  if (!extracted.ok) return extracted;

  const report = { created: 0, updated: 0, skipped: 0, errors: [], envelopeTs: extracted.envelopeTs };

  for (const row of extracted.rows) {
    try {
      let unit = await Unit.findOne({
        $or: [
          { v1ProjectId: row.v1ProjectId, v1UnitKey: row.v1UnitKey },
          { project: row.project, unitNumber: row.unitNumber },
        ],
      });

      if (!unit) {
        report.skipped += 1;
        continue;
      }

      const match = { unitId: unit._id, milestoneName: row.milestoneName };
      if (row.clpPercent) match.clpPercent = row.clpPercent;

      const existing = await Demand.findOne(match);
      if (existing && overwrite === 'v1_only' && existing.source === 'upload') {
        report.skipped += 1;
        continue;
      }

      const totalAmount = row.dueAmount + Math.round((row.dueAmount || 0) * 0.05);
      const payload = {
        entity: unit.entity,
        milestoneName: row.milestoneName,
        milestoneOrder: row.milestoneOrder ?? 0,
        clpPercent: row.clpPercent,
        demandAmount: row.dueAmount,
        gstAmount: Math.round((row.dueAmount || 0) * 0.05),
        totalAmount,
        paidAmount: row.receivedAmount,
        paymentStatus: paymentStatusFromAmounts(totalAmount, row.receivedAmount),
        dueDate: row.dueDate ? new Date(row.dueDate) : undefined,
        paidDate: row.receivedAmount > 0 ? new Date() : undefined,
        source: 'v1_import',
      };

      if (existing) {
        await Demand.findByIdAndUpdate(existing._id, payload);
        report.updated += 1;
      } else {
        await Demand.create({ unitId: unit._id, ...payload });
        report.created += 1;
      }
    } catch (err) {
      report.errors.push({ unit: row.unitNumber, milestone: row.milestoneName, error: err.message });
    }
  }

  return { ok: true, ...report };
}

export async function exportCollectionsForCashflow({ project, phase, building } = {}) {
  const unitFilter = {};
  if (project) unitFilter.project = project;
  if (phase) unitFilter.phase = phase;
  if (building) unitFilter.$or = [{ building }, { tower: building }];

  const units = await Unit.find(unitFilter).lean();
  const unitIds = units.map((u) => u._id);
  const demands = await Demand.find({ unitId: { $in: unitIds } }).lean();

  const byUnit = {};
  for (const d of demands) {
    const key = String(d.unitId);
    if (!byUnit[key]) byUnit[key] = [];
    byUnit[key].push(d);
  }

  const exported = units.map((u) => {
    const unitDemands = byUnit[String(u._id)] || [];
    const installments = unitDemands.flatMap(demandToInstallments);
    const receivedToDate = unitDemands.reduce((s, d) => s + (d.paidAmount || 0), 0);
    return {
      unitId: u._id,
      v1ProjectId: u.v1ProjectId,
      v1UnitKey: u.v1UnitKey,
      project: u.project,
      unitNumber: u.unitNumber,
      phase: u.phase,
      building: u.building || u.tower,
      receivedToDate,
      installments,
      demands: unitDemands.map((d) => ({
        milestoneName: d.milestoneName,
        clpPercent: d.clpPercent,
        dueAmount: d.totalAmount,
        receivedAmount: d.paidAmount,
        pendingAmount: Math.max(0, (d.totalAmount || 0) - (d.paidAmount || 0)),
        dueDate: d.dueDate,
      })),
    };
  });

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    count: exported.length,
    units: exported,
  };
}
