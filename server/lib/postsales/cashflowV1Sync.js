import Customer from '../../models/postsales/Customer.js';
import Unit from '../../models/postsales/Unit.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import { loadCashflowEnvelope } from '../dmGovernance/integrations/appStateReader.js';
import { buildPipelineStepDocs } from './helpers.js';
import {
  normUnitKey,
  parseUnitNumber,
  POST_SALES_PROJECTS,
  resolvePostSalesProject,
} from './projectMap.js';

function inferFundingType(v1Unit) {
  const src = String(v1Unit?.fundingSource || v1Unit?.fundingType || '').toLowerCase();
  if (src.includes('self') || src.includes('own')) return 'self_funded';
  return 'home_loan';
}

function parseDate(v) {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function extractV1SoldInventory(envelope) {
  if (!envelope?.data || typeof envelope.data !== 'object') return [];

  const manualById = Object.fromEntries((envelope.manualProjs || []).map((p) => [String(p.id), p]));
  const rows = [];

  for (const v1ProjectId of Object.keys(envelope.data)) {
    const cfg = envelope.data[v1ProjectId];
    const mapped = resolvePostSalesProject(v1ProjectId, cfg, manualById[v1ProjectId]);
    if (!mapped) continue;

    for (const u of cfg.units || []) {
      if (!u?.unitNo) continue;
      const building = String(u.building || u.tower || u.wing || '').trim();
      const phase = String(u.phase || u.projectPhase || mapped.phase || '').trim();
      rows.push({
        v1ProjectId: String(v1ProjectId),
        v1UnitKey: normUnitKey(u.unitNo),
        project: mapped.name,
        entity: mapped.entity,
        unitNumber: parseUnitNumber(u.unitNo, building),
        building: building || undefined,
        phase: phase || undefined,
        tower: building || undefined,
        customerName: String(u.clientName || u.customerName || u.client || 'Customer').trim() || 'Customer',
        bookingDate: parseDate(u.bookingDate || u.bookingDt),
        bookingAmount: Number(u.bookingAmount || u.receivedToDate || 0) || 0,
        totalCost: Number(u.totalValue || u.agreementAmount || 0) || 0,
        fundingType: inferFundingType(u),
        v1ReceivedToDate: Number(u.receivedToDate || 0) || 0,
      });
    }
  }

  return rows;
}

export async function getV1InventoryStatus(db) {
  const envelope = await loadCashflowEnvelope(db);
  if (!envelope) {
    return { available: false, error: 'Cashflow V1 state not found in MongoDB' };
  }

  const v1Rows = extractV1SoldInventory(envelope);
  const byProject = {};
  for (const r of v1Rows) {
    byProject[r.project] = (byProject[r.project] || 0) + 1;
  }

  const postSalesCount = await Unit.countDocuments({});
  const linkedCount = await Unit.countDocuments({ v1UnitKey: { $exists: true, $ne: '' } });

  return {
    available: true,
    v1SoldCount: v1Rows.length,
    postSalesCount,
    linkedCount,
    byProject,
    v1UpdatedAt: envelope.ts || null,
    projects: POST_SALES_PROJECTS.map((p) => p.name),
  };
}

async function createPipelineSteps(unit, fundingType) {
  const docs = buildPipelineStepDocs(unit, fundingType, { startedBy: 'Cashflow V1 sync' });
  if (docs[0]?.activityLog?.[0]) docs[0].activityLog[0].detail = 'Imported from sold inventory';
  await PipelineStep.insertMany(docs);
}

export async function syncSoldUnitsFromCashflowV1(db, { project, dryRun = false } = {}) {
  const envelope = await loadCashflowEnvelope(db);
  if (!envelope) return { ok: false, error: 'Cashflow V1 state not found' };

  let v1Rows = extractV1SoldInventory(envelope);
  if (project) v1Rows = v1Rows.filter((r) => r.project === project);

  const report = { created: 0, updated: 0, skipped: 0, errors: [], preview: [] };

  for (const row of v1Rows) {
    try {
      let unit = await Unit.findOne({
        $or: [
          { v1ProjectId: row.v1ProjectId, v1UnitKey: row.v1UnitKey },
          { project: row.project, unitNumber: row.unitNumber },
        ],
      });

      if (unit) {
        const patch = {
          building: row.building || unit.building,
          phase: row.phase || unit.phase,
          tower: row.tower || unit.tower,
          v1ProjectId: row.v1ProjectId,
          v1UnitKey: row.v1UnitKey,
          totalCost: row.totalCost || unit.totalCost,
          bookingAmount: row.bookingAmount || unit.bookingAmount,
          bookingDate: row.bookingDate || unit.bookingDate,
        };
        if (dryRun) {
          report.preview.push({ action: 'update', unitNumber: row.unitNumber, project: row.project });
          report.updated += 1;
          continue;
        }
        await Unit.findByIdAndUpdate(unit._id, patch);
        report.updated += 1;
        continue;
      }

      if (dryRun) {
        report.preview.push({ action: 'create', unitNumber: row.unitNumber, project: row.project, customerName: row.customerName });
        report.created += 1;
        continue;
      }

      const customer = await Customer.create({
        name: row.customerName,
        fundingType: row.fundingType,
        kycStatus: 'pending',
      });

      unit = await Unit.create({
        unitNumber: row.unitNumber,
        project: row.project,
        entity: row.entity,
        phase: row.phase,
        building: row.building,
        tower: row.tower,
        customerId: customer._id,
        bookingDate: row.bookingDate || new Date(),
        bookingAmount: row.bookingAmount,
        totalCost: row.totalCost,
        gstApplicable: true,
        paymentPlan: 'CLP',
        v1ProjectId: row.v1ProjectId,
        v1UnitKey: row.v1UnitKey,
        currentStepNumber: 1,
      });

      await createPipelineSteps(unit, row.fundingType);
      report.created += 1;
    } catch (err) {
      report.errors.push({ unit: row.unitNumber, project: row.project, error: err.message });
    }
  }

  return { ok: true, dryRun, project: project || 'all', ...report };
}

export async function buildInventoryFilterOptions(db, { project, phase } = {}) {
  const unitFilter = {};
  if (project) unitFilter.project = project;
  if (phase) unitFilter.phase = phase;

  const units = await Unit.find(unitFilter, { project: 1, phase: 1, building: 1, tower: 1 }).lean();

  let v1Rows = [];
  try {
    const envelope = await loadCashflowEnvelope(db);
    if (envelope) {
      v1Rows = extractV1SoldInventory(envelope);
      if (project) v1Rows = v1Rows.filter((r) => r.project === project);
      if (phase) v1Rows = v1Rows.filter((r) => r.phase === phase);
    }
  } catch {
    /* optional */
  }

  const projects = [...new Set([
    ...POST_SALES_PROJECTS.map((p) => p.name),
    ...units.map((u) => u.project).filter(Boolean),
    ...v1Rows.map((r) => r.project).filter(Boolean),
  ])].sort();

  const phases = [...new Set([
    ...units.map((u) => u.phase).filter(Boolean),
    ...v1Rows.map((r) => r.phase).filter(Boolean),
  ])].sort();

  const buildings = [...new Set([
    ...units.map((u) => u.building || u.tower).filter(Boolean),
    ...v1Rows.map((r) => r.building).filter(Boolean),
  ])].sort();

  return { projects, phases, buildings };
}
