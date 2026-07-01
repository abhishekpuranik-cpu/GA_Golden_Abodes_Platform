import Unit from '../../models/postsales/Unit.js';
import Demand from '../../models/postsales/Demand.js';
import CollectionForecast from '../../models/postsales/CollectionForecast.js';
import ProjectClpSchedule from '../../models/postsales/ProjectClpSchedule.js';
import { buildCollectionRegisterRow } from './collectionReports.js';
import { buildAchievedDateMap } from './clpScheduleSync.js';
import { backfillMilestoneOrders, backfillPostStageOrders } from './milestoneOrderBackfill.js';
import { applyBookingDisbursement } from './clpBookingSettlement.js';
import { syncDisbursementTasksFromForecast } from './disbursementTasks.js';

export function buildUnitFilter(query = {}) {
  const filter = { overallStatus: { $ne: 'cancelled' } };
  if (query.project) filter.project = query.project;
  if (query.phase) filter.phase = query.phase;
  if (query.building) {
    filter.$and = [...(filter.$and || []), { $or: [{ building: query.building }, { tower: query.building }] }];
  }
  if (query.cxExecutive) {
    filter.$and = [...(filter.$and || []), { $or: [{ cxExecutive: query.cxExecutive }, { crmExecutive: query.cxExecutive }] }];
  }
  return filter;
}

function mapInstallmentInput(i) {
  const amount = Number(i.amount) || 0;
  const expectedDate = new Date(i.expectedDate);
  if (amount <= 0 || Number.isNaN(expectedDate.getTime())) return null;
  return {
    ...(i._id ? { _id: i._id } : {}),
    amount,
    expectedDate,
    includesTax: !!i.includesTax,
    taxAmount: Number(i.taxAmount) || 0,
    riskCategory: ['clear', 'risky', 'delayed'].includes(i.riskCategory) ? i.riskCategory : 'clear',
    note: i.note || '',
    receivedAmount: Number(i.receivedAmount) || 0,
    status: ['planned', 'complete', 'delayed'].includes(i.status) ? i.status : 'planned',
    revisedDate: i.revisedDate ? new Date(i.revisedDate) : undefined,
  };
}

export async function loadCollectionRegister(query = {}) {
  const filter = buildUnitFilter(query);
  const units = await Unit.find(filter).populate('customerId').sort({ project: 1, unitNumber: 1 }).lean();
  const unitIds = units.map((u) => u._id);

  const [demands, forecasts, schedules] = await Promise.all([
    Demand.find({ unitId: { $in: unitIds } }).lean(),
    CollectionForecast.find({ unitId: { $in: unitIds } }).lean(),
    ProjectClpSchedule.find({ project: { $in: [...new Set(units.map((u) => u.project).filter(Boolean))] } }).lean(),
  ]);
  await backfillMilestoneOrders(Demand, demands);
  await backfillPostStageOrders(Demand, demands);

  const demandsByUnit = new Map();
  for (const d of demands) {
    const k = String(d.unitId);
    if (!demandsByUnit.has(k)) demandsByUnit.set(k, []);
    demandsByUnit.get(k).push(d);
  }

  const forecastByUnit = new Map(forecasts.map((f) => [String(f.unitId), f]));
  const scheduleByProject = Object.fromEntries(
    schedules.map((s) => [s.project, buildAchievedDateMap(s.rows)]),
  );
  const q = String(query.search || '').trim().toLowerCase();

  let rows = units.map((unit) => buildCollectionRegisterRow(
    unit,
    unit.customerId,
    demandsByUnit.get(String(unit._id)) || [],
    forecastByUnit.get(String(unit._id)),
    new Date(),
    scheduleByProject[unit.project] || null,
  ));

  if (q) {
    rows = rows.filter((r) => [r.unitNumber, r.clientName, r.project, r.phase, r.building, r.collectionRemarks]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q));
  }

  if (query.priority) {
    rows = rows.filter((r) => r.cxPriority === query.priority);
  }

  const summary = rows.reduce(
    (acc, r) => ({
      units: acc.units + 1,
      totalDue: acc.totalDue + r.totalDue,
      receivedAmount: acc.receivedAmount + r.receivedAmount,
      pendingAsOfToday: acc.pendingAsOfToday + r.pendingAsOfToday,
      gstDue: acc.gstDue + r.gstDue,
      gstReceived: acc.gstReceived + r.gstReceived,
      gstPending: acc.gstPending + r.gstPending,
      totalOutstanding: acc.totalOutstanding + r.totalOutstanding,
    }),
    { units: 0, totalDue: 0, receivedAmount: 0, pendingAsOfToday: 0, gstDue: 0, gstReceived: 0, gstPending: 0, totalOutstanding: 0 },
  );

  return { rows, summary, demandsByUnit, asOf: new Date().toISOString().slice(0, 10) };
}

function forecastMatchKey(m) {
  return `${String(m.demandId || '')}|${String(m.milestoneName || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')}`;
}

export async function upsertForecastPayload(unitId, body) {
  const unit = await Unit.findById(unitId);
  if (!unit) throw new Error('Unit not found');

  const existing = await CollectionForecast.findOne({ unitId: unit._id }).lean();

  const payload = {
    unitId: unit._id,
    ...(body.collectionRemarks !== undefined ? { collectionRemarks: String(body.collectionRemarks) } : {}),
    ...(body.cxPriority ? { cxPriority: body.cxPriority } : {}),
    ...(body.followUpOwner !== undefined ? { followUpOwner: String(body.followUpOwner) } : {}),
    ...(body.gstDue !== undefined ? { gstDueOverride: Number(body.gstDue) } : {}),
    ...(body.gstReceived !== undefined ? { gstReceivedOverride: Number(body.gstReceived) } : {}),
    ...(body.gstPending !== undefined ? { gstPendingOverride: Number(body.gstPending) } : {}),
    ...(body.bookingDisbursedAmount !== undefined ? { bookingDisbursedAmount: Number(body.bookingDisbursedAmount) || 0 } : {}),
  };

  if (Array.isArray(body.milestones)) {
    const existingByKey = new Map((existing?.milestones || []).map((m) => [forecastMatchKey(m), m]));
    payload.milestones = body.milestones.map((m) => {
      const saved = existingByKey.get(forecastMatchKey(m));
      const savedInstById = new Map((saved?.installments || []).filter((i) => i._id).map((i) => [String(i._id), i]));
      return {
        ...(saved?._id ? { _id: saved._id } : {}),
        ...(m._id ? { _id: m._id } : {}),
        demandId: m.demandId || saved?.demandId,
        milestoneName: m.milestoneName,
        installments: (m.installments || []).map((inst, idx) => {
          const mapped = mapInstallmentInput(inst);
          if (!mapped) return null;
          if (inst._id) mapped._id = inst._id;
          else if (saved?.installments?.[idx]?._id) mapped._id = saved.installments[idx]._id;
          else {
            const byPos = [...savedInstById.values()][idx];
            if (byPos?._id) mapped._id = byPos._id;
          }
          return mapped;
        }).filter(Boolean),
      };
    });
  }

  let settlementSummary = null;
  if (body.applyBookingSettlement && Number(body.bookingDisbursedAmount) > 0) {
    const demands = await Demand.find({ unitId: unit._id }).lean();
    settlementSummary = await applyBookingDisbursement(unit, demands, body.bookingDisbursedAmount);
    payload.bookingSettlementAppliedAt = new Date();
  }

  let doc = await CollectionForecast.findOneAndUpdate(
    { unitId: unit._id },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (body.syncDisbursementTasks !== false) {
    await syncDisbursementTasksFromForecast(unit, doc, payload.followUpOwner || unit.cxExecutive);
    doc = await CollectionForecast.findById(doc._id);
  }

  return { doc: doc?.lean?.() ?? doc, settlementSummary };
}
