import XLSX from 'xlsx';
import Customer from '../../models/postsales/Customer.js';
import Unit from '../../models/postsales/Unit.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Demand from '../../models/postsales/Demand.js';
import { buildPipelineStepDocs } from './helpers.js';
import { loadInventoryCatalog, saveInventoryCatalog } from './inventoryCatalog.js';
import { POST_SALES_PROJECTS, normUnitKey } from './projectMap.js';
import { paymentStatusFromAmounts } from './collectionsLib.js';
import {
  extractCollectionMilestones,
  inferPipelineStep,
  isCollectionReport,
  iterCollectionBlocks,
} from './collectionReportParse.js';
import { deriveStepDueDates } from './pipelineDueFromCrm.js';
export const CRM_TEMPLATE_COLUMNS = [
  'Project', 'Phase', 'Building', 'Unit Number', 'Customer Name', 'Booking Date',
  'Total Cost', 'Booking Amount', 'Funding Type', 'Phone', 'Email', 'PAN',
  'Sales Executive', 'CRM Executive', 'Payment Plan', 'Status',
];

function norm(s) {
  return String(s || '').trim();
}

function slug(s) {
  return norm(s).toLowerCase().replace(/\s+/g, ' ');
}

export function buildCrmUnitKey({ project, phase, building, unitNumber }) {
  return [project, phase, building, unitNumber]
    .map((x) => norm(x).toLowerCase())
    .join('|');
}

function parseDate(v) {
  if (!v) return undefined;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function inferFundingType(raw) {
  const s = String(raw || '').trim();
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower.includes('self') || lower.includes('own')) return 'self_funded';
  return 'home_loan';
}

function inferPaymentPlan(raw) {
  const s = norm(raw);
  if (!s) return undefined;
  if (['CLP', 'Flexi', 'Down Payment'].includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower.includes('flexi')) return 'Flexi';
  if (lower.includes('down')) return 'Down Payment';
  if (lower.includes('clp')) return 'CLP';
  return undefined;
}

function inferOverallStatus(raw) {
  const s = String(raw || 'active').toLowerCase();
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('hold')) return 'on_hold';
  if (s.includes('possession')) return 'possession_given';
  return 'active';
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== '') return row[k];
  }
  return undefined;
}

export function normalizeCrmRow(raw) {
  const project = norm(pick(raw, ['project', 'Project', 'PROJECT']));
  const phase = norm(pick(raw, ['phase', 'Phase', 'PHASE', 'projectPhase']));
  const building = norm(pick(raw, ['building', 'Building', 'BUILDING', 'tower', 'Tower', 'Wing', 'Block']));
  const unitNumber = norm(pick(raw, ['unitNumber', 'unit', 'Unit', 'Unit Number', 'Unit No', 'unitNo', 'UnitNo']));
  const customerName = norm(pick(raw, ['customerName', 'customer', 'Customer Name', 'Customer', 'Client Name', 'clientName', 'Client']));
  const bookingDate = parseDate(pick(raw, ['bookingDate', 'Booking Date', 'bookingDt', 'Booking Dt', 'Date of Booking']));
  const registrationDate = parseDate(pick(raw, ['registrationDate', 'Registration Date', 'Reg Date']));
  const totalCost = Number(pick(raw, ['totalCost', 'Total Cost', 'totalValue', 'Agreement Amount', 'Sale Value', 'Total Agreement']) ?? 0);
  const bookingAmount = Number(pick(raw, ['bookingAmount', 'Booking Amount', 'bookingToken', 'Token Amount', 'token']) ?? 0);
  const saleableArea = Number(pick(raw, ['saleableArea', 'Area (sqft)', 'Area', 'Carpet Area', 'Saleable Area']) ?? 0) || undefined;
  const fundingType = inferFundingType(pick(raw, ['fundingType', 'Funding Type', 'Funding Source', 'fundingSource', 'Pay Type', 'payType']));
  const phone = norm(pick(raw, ['phone', 'Phone', 'Mobile', 'mobile']));
  const email = norm(pick(raw, ['email', 'Email']));
  const pan = norm(pick(raw, ['pan', 'PAN']));
  const salesExecutive = norm(pick(raw, ['salesExecutive', 'Sales Executive', 'Sales Exec']));
  const crmExecutive = norm(pick(raw, ['crmExecutive', 'CRM Executive', 'CRM Exec']));
  const paymentPlan = inferPaymentPlan(pick(raw, ['paymentPlan', 'Payment Plan', 'Pay Plan']));
  const overallStatus = inferOverallStatus(pick(raw, ['status', 'Status', 'Unit Status']));
  const crmBookingId = norm(pick(raw, ['crmBookingId', 'Booking ID', 'bookingId', 'CRM ID']));

  return {
    project,
    phase,
    building,
    unitNumber,
    customerName,
    bookingDate,
    registrationDate,
    totalCost,
    bookingAmount,
    saleableArea,
    fundingType,
    phone,
    email,
    pan,
    salesExecutive,
    crmExecutive,
    paymentPlan,
    overallStatus,
    crmBookingId,
    crmUnitKey: buildCrmUnitKey({ project, phase, building, unitNumber }),
    v1UnitKey: normUnitKey(unitNumber),
  };
}

export function sheetToRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/** Legacy helper — Amount Due rows only (prefer processCrmImport for full collection parse). */
export function preprocessCrmSheetRows(rawRows) {
  if (!isCollectionReport(rawRows)) return rawRows;
  return iterCollectionBlocks(rawRows).map((b) => b.due);
}

function applyImportScope(row, scope) {
  const out = { ...row };
  if (scope.project && !out.project) out.project = norm(scope.project);
  if (scope.phase && !out.phase) out.phase = norm(scope.phase);
  if (scope.building && !out.building) out.building = norm(scope.building);
  out.crmUnitKey = buildCrmUnitKey(out);
  return out;
}
export function buildTemplateWorkbook() {
  const ws = XLSX.utils.aoa_to_sheet([
    CRM_TEMPLATE_COLUMNS,
    ['Golden HQ', 'Phase 1', 'Tower A', 'A-1203', 'Ramesh Mehta', '2024-06-15', 8500000, 500000, 'home_loan', '9876500001', 'ramesh@example.com', '', 'Sales Team A', 'Priya Sharma', 'CLP', 'active'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CRM Units');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function resolveEntity(project, catalog) {
  const fromCatalog = (catalog.projects || []).find((p) => slug(p.name) === slug(project));
  if (fromCatalog?.entity) return fromCatalog.entity;
  const mapped = POST_SALES_PROJECTS.find((p) => slug(p.name) === slug(project));
  return mapped?.entity || 'GAPL';
}

function scopeMatches(row, scope) {
  if (scope.project && slug(row.project) !== slug(scope.project)) return false;
  if (scope.phase && row.phase && slug(row.phase) !== slug(scope.phase)) return false;
  if (scope.building && row.building && slug(row.building) !== slug(scope.building)) return false;
  return true;
}
function validateRow(row, catalog, scope) {
  if (!row.project) return 'Project is required';
  if (!row.unitNumber) return 'Unit Number is required';
  if (!row.customerName) return 'Customer Name is required';
  if (!scopeMatches(row, scope)) return 'Row outside selected Project / Phase / Building filter';
  const knownProject = (catalog.projects || []).some((p) => slug(p.name) === slug(row.project))
    || POST_SALES_PROJECTS.some((p) => slug(p.name) === slug(row.project));
  if (!knownProject) return `Unknown project "${row.project}" — add it in Inventory first`;
  return null;
}

async function upsertUnitDemands(unit, milestones, demandByKey, { source = 'upload' } = {}) {
  const report = { created: 0, updated: 0 };
  const ops = [];
  for (const m of milestones) {
    const key = `${unit._id}|${m.milestoneName}`;
    const existing = demandByKey.get(key);
    const gstAmount = Math.round((m.dueAmount || 0) * 0.05);
    const totalAmount = (m.dueAmount || 0) + gstAmount;
    const payload = {
      entity: unit.entity,
      milestoneName: m.milestoneName,
      demandAmount: m.dueAmount,
      gstAmount,
      totalAmount,
      paidAmount: m.receivedAmount,
      paymentStatus: paymentStatusFromAmounts(totalAmount, m.receivedAmount),
      issuedDate: existing?.issuedDate || new Date(),
      dueDate: m.dueDate || existing?.dueDate,
      paidDate: m.receivedAmount > 0 ? (existing?.paidDate || new Date()) : undefined,
      source,
    };
    if (existing) {
      ops.push({ updateOne: { filter: { _id: existing._id }, update: { $set: payload } } });
      report.updated += 1;
    } else {
      ops.push({ insertOne: { document: { unitId: unit._id, ...payload } } });
      report.created += 1;
    }
  }
  if (ops.length) {
    await Demand.bulkWrite(ops, { ordered: false });
    for (const m of milestones) {
      if (!demandByKey.has(`${unit._id}|${m.milestoneName}`)) {
        demandByKey.set(`${unit._id}|${m.milestoneName}`, { unitId: unit._id, milestoneName: m.milestoneName });
      }
    }
  }
  return report;
}

function buildUnitLookup(units) {
  const byCrmKey = new Map();
  const byProjectUnit = new Map();
  for (const u of units) {
    if (u.crmUnitKey) byCrmKey.set(u.crmUnitKey, u);
    const k = `${slug(u.project)}|${slug(u.unitNumber)}`;
    if (!byProjectUnit.has(k)) byProjectUnit.set(k, []);
    byProjectUnit.get(k).push(u);
  }
  return { byCrmKey, byProjectUnit };
}

function resolveExistingUnit(row, lookup) {
  let unit = lookup.byCrmKey.get(row.crmUnitKey);
  if (unit) return unit;
  const candidates = lookup.byProjectUnit.get(`${slug(row.project)}|${slug(row.unitNumber)}`) || [];
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  if (row.phase || row.building) {
    const match = candidates.find((u) => {
      if (row.phase && slug(u.phase) !== slug(row.phase)) return false;
      if (row.building && slug(u.building || u.tower) !== slug(row.building)) return false;
      return true;
    });
    if (match) return match;
  }
  return candidates[0];
}

function registerUnitInLookup(unit, lookup) {
  if (unit.crmUnitKey) lookup.byCrmKey.set(unit.crmUnitKey, unit);
  const k = `${slug(unit.project)}|${slug(unit.unitNumber)}`;
  if (!lookup.byProjectUnit.has(k)) lookup.byProjectUnit.set(k, []);
  lookup.byProjectUnit.get(k).push(unit);
}

function collectPipelineBulkOps(unitId, targetStep, stepDueDates, stepsByUnit, importedBy) {
  const steps = stepsByUnit.get(String(unitId)) || [];
  const now = new Date();
  const ops = [];
  for (const s of steps) {
    const crmDue = stepDueDates[s.stepNumber];
    const patch = {};
    if (crmDue) patch.dueDate = crmDue;
    if (s.stepNumber < targetStep && s.status !== 'completed') {
      patch.status = 'completed';
      patch.completedDate = crmDue || now;
      patch.completedBy = importedBy;
    } else if (s.stepNumber === targetStep && s.status === 'pending') {
      patch.status = 'in_progress';
      patch.triggerDate = stepDueDates[s.stepNumber - 1] || crmDue || now;
    }
    if (Object.keys(patch).length) {
      ops.push({ updateOne: { filter: { _id: s._id }, update: { $set: patch } } });
    }
  }
  return ops;
}

async function loadImportCaches(scope) {
  const filter = {};
  if (scope.project) filter.project = scope.project;
  const existingUnits = await Unit.find(filter).populate('customerId').lean();
  const lookup = buildUnitLookup(existingUnits);
  const unitIds = existingUnits.map((u) => u._id);
  const [demands, steps] = unitIds.length
    ? await Promise.all([
        Demand.find({ unitId: { $in: unitIds } }).lean(),
        PipelineStep.find({ unitId: { $in: unitIds } }, { unitId: 1, stepNumber: 1, status: 1 }).lean(),
      ])
    : [[], []];
  const demandByKey = new Map();
  for (const d of demands) demandByKey.set(`${d.unitId}|${d.milestoneName}`, d);
  const stepsByUnit = new Map();
  for (const s of steps) {
    const k = String(s.unitId);
    if (!stepsByUnit.has(k)) stepsByUnit.set(k, []);
    stepsByUnit.get(k).push(s);
  }
  return { lookup, demandByKey, stepsByUnit };
}

function masterChanges(existing, row, customer) {
  const changes = [];
  const add = (field, from, to) => {
    if (String(from ?? '') !== String(to ?? '')) changes.push({ field, from: from ?? '—', to: to ?? '—' });
  };

  add('customerName', customer?.name, row.customerName);
  add('bookingDate', existing.bookingDate?.toISOString?.().slice(0, 10), row.bookingDate?.toISOString?.().slice(0, 10));
  add('registrationDate', existing.registrationDate?.toISOString?.().slice(0, 10), row.registrationDate?.toISOString?.().slice(0, 10));
  add('totalCost', existing.totalCost, row.totalCost || existing.totalCost);
  add('bookingAmount', existing.bookingAmount, row.bookingAmount || existing.bookingAmount);
  add('saleableArea', existing.saleableArea, row.saleableArea || existing.saleableArea);
  add('phase', existing.phase, row.phase || existing.phase);
  add('building', existing.building || existing.tower, row.building || existing.building);
  add('overallStatus', existing.overallStatus, row.overallStatus);
  if (row.phone) add('phone', customer?.phone, row.phone);
  if (row.email) add('email', customer?.email, row.email);
  if (row.pan) add('pan', customer?.pan, row.pan);
  if (row.fundingType) add('fundingType', customer?.fundingType, row.fundingType);
  if (row.paymentPlan) add('paymentPlan', existing.paymentPlan, row.paymentPlan);
  if (row.salesExecutive) add('salesExecutive', existing.salesExecutive, row.salesExecutive);
  if (row.crmExecutive && !existing.crmExecutive) add('crmExecutive', existing.crmExecutive, row.crmExecutive);

  return changes.filter((c) => c.from !== c.to);
}

async function enrichCatalogFromRows(db, rows) {
  const catalog = await loadInventoryCatalog(db);
  const byName = new Map((catalog.projects || []).map((p) => [slug(p.name), { ...p, phases: [...(p.phases || [])] }]));

  for (const row of rows) {
    if (!row.project) continue;
    const key = slug(row.project);
    let proj = byName.get(key);
    if (!proj) {
      proj = { name: row.project, entity: resolveEntity(row.project, catalog), phases: [] };
      byName.set(key, proj);
    }
    if (row.phase) {
      let ph = proj.phases.find((x) => slug(x.name) === slug(row.phase));
      if (!ph) {
        ph = { name: row.phase, buildings: [] };
        proj.phases.push(ph);
      }
      if (row.building && !ph.buildings.includes(row.building)) {
        ph.buildings.push(row.building);
        ph.buildings.sort();
      }
    }
  }

  catalog.projects = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  await saveInventoryCatalog(db, catalog);
}

async function logImportBatch(db, batch) {
  await db.collection('post_sales_settings').updateOne(
    { _id: 'crm_import_log' },
    {
      $push: {
        batches: {
          $each: [batch],
          $position: 0,
          $slice: 50,
        },
      },
    },
    { upsert: true },
  );
}

async function processCollectionReportImport(db, rawRows, scope, { dryRun = true, importedBy = 'crm_upload' } = {}) {
  const catalog = await loadInventoryCatalog(db);
  const batchId = `CRM_${Date.now()}`;
  const report = {
    ok: true,
    dryRun,
    batchId,
    format: 'collection_report',
    summary: {
      create: 0,
      update: 0,
      unchanged: 0,
      errors: 0,
      demandsCreated: 0,
      demandsUpdated: 0,
      pipelineAdvanced: 0,
    },
    rows: [],
  };

  const blocks = iterCollectionBlocks(rawRows);
  const normalized = [];

  for (const block of blocks) {
    try {
      let row = applyImportScope(normalizeCrmRow(block.due), scope);
      const err = validateRow(row, catalog, scope);
      if (err) {
        report.summary.errors += 1;
        report.rows.push({ action: 'error', ...row, error: err });
        continue;
      }
      const milestones = extractCollectionMilestones(block);
      const startAtStep = inferPipelineStep(milestones, {
        registrationDate: row.registrationDate,
        bookingAmount: row.bookingAmount,
      });
      const stepDueDates = deriveStepDueDates(milestones, {
        bookingDate: row.bookingDate,
        registrationDate: row.registrationDate,
      });
      normalized.push({ row, milestones, startAtStep, stepDueDates });
    } catch (e) {
      report.summary.errors += 1;
      report.rows.push({ action: 'error', error: e.message });
    }
  }

  const caches = await loadImportCaches(scope);
  let pipelineBulkOps = [];

  for (const { row, milestones, startAtStep, stepDueDates } of normalized) {
    try {
      const existing = resolveExistingUnit(row, caches.lookup);
      const demandCount = milestones.length;

      if (!existing) {
        report.summary.create += 1;
        if (dryRun) report.summary.demandsCreated += demandCount;
        report.rows.push({
          action: 'create',
          project: row.project,
          phase: row.phase,
          building: row.building,
          unitNumber: row.unitNumber,
          customerName: row.customerName,
          bookingDate: row.bookingDate,
          totalCost: row.totalCost,
          pipelineStep: startAtStep,
          demands: demandCount,
        });
        if (!dryRun) {
          const customer = await Customer.create({
            name: row.customerName,
            phone: row.phone || undefined,
            email: row.email || undefined,
            pan: row.pan || undefined,
            fundingType: row.fundingType || 'home_loan',
            kycStatus: 'pending',
          });
          const unit = await Unit.create({
            unitNumber: row.unitNumber,
            project: row.project,
            entity: resolveEntity(row.project, catalog),
            phase: row.phase || undefined,
            building: row.building || undefined,
            tower: row.building || undefined,
            saleableArea: row.saleableArea,
            customerId: customer._id,
            bookingDate: row.bookingDate || new Date(),
            registrationDate: row.registrationDate,
            bookingAmount: row.bookingAmount || 0,
            totalCost: row.totalCost || 0,
            gstApplicable: true,
            paymentPlan: row.paymentPlan || 'CLP',
            salesExecutive: row.salesExecutive || undefined,
            crmExecutive: row.crmExecutive || undefined,
            cxExecutive: row.crmExecutive || undefined,
            backendExecutive: row.crmExecutive || undefined,
            overallStatus: row.overallStatus,
            currentStepNumber: startAtStep,
            crmUnitKey: row.crmUnitKey,
            v1UnitKey: row.v1UnitKey,
            firstImportedAt: new Date(),
            lastImportBatchId: batchId,
          });
          const unitDoc = unit.toObject ? unit.toObject() : unit;
          unitDoc.customerId = customer;
          registerUnitInLookup(unitDoc, caches.lookup);
          const steps = buildPipelineStepDocs(unit, row.fundingType || 'home_loan', {
            startedBy: importedBy,
            startAtStep,
            stepDueDates,
          });
          const inserted = await PipelineStep.insertMany(steps);
          caches.stepsByUnit.set(String(unit._id), inserted.map((s) => s.toObject?.() || s));
          const dr = await upsertUnitDemands(unit, milestones, caches.demandByKey, { source: 'upload' });
          report.summary.demandsCreated += dr.created;
          report.summary.demandsUpdated += dr.updated;
        }
        continue;
      }

      const customer = existing.customerId;
      const changes = masterChanges(existing, row, customer);
      const targetStep = Math.max(existing.currentStepNumber || 1, startAtStep);
      const stepAdvance = targetStep > (existing.currentStepNumber || 1);
      const needsUpdate = changes.length > 0 || stepAdvance || demandCount > 0 || Object.keys(stepDueDates).length > 0;

      if (!needsUpdate) {
        report.summary.unchanged += 1;
        report.rows.push({
          action: 'unchanged',
          unitId: String(existing._id),
          project: row.project,
          phase: row.phase,
          building: row.building,
          unitNumber: row.unitNumber,
          customerName: row.customerName,
          currentStep: existing.currentStepNumber,
        });
        continue;
      }

      report.summary.update += 1;
      if (dryRun) {
        report.summary.demandsCreated += demandCount;
        if (stepAdvance) report.summary.pipelineAdvanced += 1;
      }

      report.rows.push({
        action: 'update',
        unitId: String(existing._id),
        project: row.project,
        phase: row.phase,
        building: row.building,
        unitNumber: row.unitNumber,
        customerName: row.customerName,
        currentStep: existing.currentStepNumber,
        pipelineStep: targetStep,
        demands: demandCount,
        changes,
      });

      if (!dryRun) {
        await Customer.findByIdAndUpdate(customer._id, {
          name: row.customerName || customer.name,
          ...(row.phone ? { phone: row.phone } : {}),
          ...(row.email ? { email: row.email } : {}),
          ...(row.pan ? { pan: row.pan } : {}),
          ...(row.fundingType ? { fundingType: row.fundingType } : {}),
        });
        await Unit.findByIdAndUpdate(existing._id, {
          crmUnitKey: row.crmUnitKey,
          v1UnitKey: row.v1UnitKey,
          lastImportBatchId: batchId,
          overallStatus: row.overallStatus,
          currentStepNumber: targetStep,
          ...(row.phase ? { phase: row.phase } : {}),
          ...(row.building ? { building: row.building, tower: row.building } : {}),
          ...(row.bookingDate ? { bookingDate: row.bookingDate } : {}),
          ...(row.registrationDate ? { registrationDate: row.registrationDate } : {}),
          ...(row.totalCost ? { totalCost: row.totalCost } : {}),
          ...(row.bookingAmount ? { bookingAmount: row.bookingAmount } : {}),
          ...(row.saleableArea ? { saleableArea: row.saleableArea } : {}),
          ...(row.paymentPlan ? { paymentPlan: row.paymentPlan } : {}),
          ...(row.salesExecutive ? { salesExecutive: row.salesExecutive } : {}),
          ...(row.crmExecutive && !existing.crmExecutive ? { crmExecutive: row.crmExecutive, cxExecutive: row.crmExecutive, backendExecutive: row.crmExecutive } : {}),
        });
        const dr = await upsertUnitDemands(existing, milestones, caches.demandByKey, { source: 'upload' });
        report.summary.demandsUpdated += dr.updated;
        report.summary.demandsCreated += dr.created;
        pipelineBulkOps.push(...collectPipelineBulkOps(existing._id, targetStep, stepDueDates, caches.stepsByUnit, importedBy));
        if (stepAdvance) report.summary.pipelineAdvanced += 1;
      }
    } catch (e) {
      report.summary.errors += 1;
      report.rows.push({ action: 'error', project: row.project, unitNumber: row.unitNumber, error: e.message });
    }
  }

  if (!dryRun && pipelineBulkOps.length) {
    for (let i = 0; i < pipelineBulkOps.length; i += 500) {
      await PipelineStep.bulkWrite(pipelineBulkOps.slice(i, i + 500), { ordered: false });
    }
  }

  if (!dryRun && (report.summary.create > 0 || report.summary.update > 0)) {
    await enrichCatalogFromRows(db, normalized.map((n) => n.row));
    await logImportBatch(db, {
      batchId,
      at: new Date(),
      importedBy,
      scope,
      format: 'collection_report',
      summary: report.summary,
    });
  }

  return report;
}

export async function processCrmImport(db, rawRows, scope = {}, { dryRun = true, importedBy = 'crm_upload' } = {}) {
  if (isCollectionReport(rawRows)) {
    return processCollectionReportImport(db, rawRows, scope, { dryRun, importedBy });
  }

  const catalog = await loadInventoryCatalog(db);
  const batchId = `CRM_${Date.now()}`;
  const report = {
    ok: true,
    dryRun,
    batchId,
    summary: { create: 0, update: 0, unchanged: 0, errors: 0, skipped: 0 },
    rows: [],
  };

  const normalized = [];
  for (const raw of rawRows) {
    try {
      let row = applyImportScope(normalizeCrmRow(raw), scope);
      const err = validateRow(row, catalog, scope);
      if (err) {
        report.summary.errors += 1;
        report.rows.push({ action: 'error', ...row, error: err });
        continue;
      }
      normalized.push(row);
    } catch (e) {
      report.summary.errors += 1;
      report.rows.push({ action: 'error', error: e.message, raw });
    }
  }

  const caches = await loadImportCaches(scope);

  for (const row of normalized) {
    try {
      const existing = resolveExistingUnit(row, caches.lookup);
      if (!existing) {
        report.summary.create += 1;
        report.rows.push({
          action: 'create',
          project: row.project,
          phase: row.phase,
          building: row.building,
          unitNumber: row.unitNumber,
          customerName: row.customerName,
          bookingDate: row.bookingDate,
          totalCost: row.totalCost,
        });
        if (!dryRun) {
          const customer = await Customer.create({
            name: row.customerName,
            phone: row.phone || undefined,
            email: row.email || undefined,
            pan: row.pan || undefined,
            fundingType: row.fundingType || 'home_loan',
            kycStatus: 'pending',
          });
          const unit = await Unit.create({
            unitNumber: row.unitNumber,
            project: row.project,
            entity: resolveEntity(row.project, catalog),
            phase: row.phase || undefined,
            building: row.building || undefined,
            tower: row.building || undefined,
            saleableArea: row.saleableArea,
            customerId: customer._id,
            bookingDate: row.bookingDate || new Date(),
            registrationDate: row.registrationDate,
            bookingAmount: row.bookingAmount || 0,
            totalCost: row.totalCost || 0,
            gstApplicable: true,
            paymentPlan: row.paymentPlan || 'CLP',
            salesExecutive: row.salesExecutive || undefined,
            crmExecutive: row.crmExecutive || undefined,
            cxExecutive: row.crmExecutive || undefined,
            backendExecutive: row.crmExecutive || undefined,
            overallStatus: row.overallStatus,
            currentStepNumber: 1,
            crmUnitKey: row.crmUnitKey,
            v1UnitKey: row.v1UnitKey,
            firstImportedAt: new Date(),
            lastImportBatchId: batchId,
          });
          const steps = buildPipelineStepDocs(unit, row.fundingType || 'home_loan', { startedBy: importedBy });
          if (steps[0]?.activityLog?.[0]) steps[0].activityLog[0].detail = 'CRM import — pipeline started at step 1';
          await PipelineStep.insertMany(steps);
        }
        continue;
      }

      const customer = existing.customerId;
      const changes = masterChanges(existing, row, customer);
      if (!changes.length) {
        report.summary.unchanged += 1;
        report.rows.push({
          action: 'unchanged',
          unitId: String(existing._id),
          project: row.project,
          phase: row.phase,
          building: row.building,
          unitNumber: row.unitNumber,
          customerName: row.customerName,
          currentStep: existing.currentStepNumber,
        });
        continue;
      }

      report.summary.update += 1;
      report.rows.push({
        action: 'update',
        unitId: String(existing._id),
        project: row.project,
        phase: row.phase,
        building: row.building,
        unitNumber: row.unitNumber,
        customerName: row.customerName,
        currentStep: existing.currentStepNumber,
        changes,
      });

      if (!dryRun) {
        await Customer.findByIdAndUpdate(customer._id, {
          name: row.customerName || customer.name,
          ...(row.phone ? { phone: row.phone } : {}),
          ...(row.email ? { email: row.email } : {}),
          ...(row.pan ? { pan: row.pan } : {}),
          ...(row.fundingType ? { fundingType: row.fundingType } : {}),
        });
        const unitPatch = {
          crmUnitKey: row.crmUnitKey,
          v1UnitKey: row.v1UnitKey,
          lastImportBatchId: batchId,
          overallStatus: row.overallStatus,
          ...(row.phase ? { phase: row.phase } : {}),
          ...(row.building ? { building: row.building, tower: row.building } : {}),
          ...(row.bookingDate ? { bookingDate: row.bookingDate } : {}),
          ...(row.registrationDate ? { registrationDate: row.registrationDate } : {}),
          ...(row.totalCost ? { totalCost: row.totalCost } : {}),
          ...(row.bookingAmount ? { bookingAmount: row.bookingAmount } : {}),
          ...(row.saleableArea ? { saleableArea: row.saleableArea } : {}),
          ...(row.paymentPlan ? { paymentPlan: row.paymentPlan } : {}),
          ...(row.salesExecutive ? { salesExecutive: row.salesExecutive } : {}),
          ...(row.crmExecutive && !existing.crmExecutive ? { crmExecutive: row.crmExecutive, cxExecutive: row.crmExecutive, backendExecutive: row.crmExecutive } : {}),
        };
        await Unit.findByIdAndUpdate(existing._id, unitPatch);
      }
    } catch (e) {
      report.summary.errors += 1;
      report.rows.push({ action: 'error', project: row.project, unitNumber: row.unitNumber, error: e.message });
    }
  }

  if (!dryRun && (report.summary.create > 0 || report.summary.update > 0)) {
    await enrichCatalogFromRows(db, normalized);
    await logImportBatch(db, {
      batchId,
      at: new Date(),
      importedBy,
      scope,
      summary: report.summary,
    });
  }

  return report;
}

export async function listImportBatches(db) {
  const doc = await db.collection('post_sales_settings').findOne({ _id: 'crm_import_log' });
  return doc?.batches || [];
}
