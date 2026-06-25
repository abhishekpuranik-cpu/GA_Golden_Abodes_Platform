import Unit from '../../models/postsales/Unit.js';
import Demand from '../../models/postsales/Demand.js';
import CollectionForecast from '../../models/postsales/CollectionForecast.js';
import { buildCollectionRegisterRow } from './collectionReports.js';
import { backfillMilestoneOrders, backfillPostStageOrders } from './milestoneOrderBackfill.js';

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

export async function loadCollectionRegister(query = {}) {
  const filter = buildUnitFilter(query);
  const units = await Unit.find(filter).populate('customerId').sort({ project: 1, unitNumber: 1 }).lean();
  const unitIds = units.map((u) => u._id);

  const [demands, forecasts] = await Promise.all([
    Demand.find({ unitId: { $in: unitIds } }).lean(),
    CollectionForecast.find({ unitId: { $in: unitIds } }).lean(),
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
  const q = String(query.search || '').trim().toLowerCase();

  let rows = units.map((unit) => buildCollectionRegisterRow(
    unit,
    unit.customerId,
    demandsByUnit.get(String(unit._id)) || [],
    forecastByUnit.get(String(unit._id)),
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
      taxDue: acc.taxDue + r.taxDue,
      taxReceived: acc.taxReceived + r.taxReceived,
      taxPending: acc.taxPending + r.taxPending,
      totalOutstanding: acc.totalOutstanding + r.totalOutstanding,
    }),
    { units: 0, totalDue: 0, receivedAmount: 0, pendingAsOfToday: 0, taxDue: 0, taxReceived: 0, taxPending: 0, totalOutstanding: 0 },
  );

  return { rows, summary, demandsByUnit, asOf: new Date().toISOString().slice(0, 10) };
}

export async function upsertForecastPayload(unitId, body) {
  const payload = {
    unitId,
    ...(body.collectionRemarks !== undefined ? { collectionRemarks: String(body.collectionRemarks) } : {}),
    ...(body.cxPriority ? { cxPriority: body.cxPriority } : {}),
    ...(body.followUpOwner !== undefined ? { followUpOwner: String(body.followUpOwner) } : {}),
    ...(Array.isArray(body.milestones) ? {
      milestones: body.milestones.map((m) => ({
        demandId: m.demandId || undefined,
        milestoneName: m.milestoneName,
        installments: (m.installments || []).map((i) => ({
          amount: Number(i.amount) || 0,
          expectedDate: new Date(i.expectedDate),
          includesTax: !!i.includesTax,
          taxAmount: Number(i.taxAmount) || 0,
          riskCategory: ['clear', 'risky', 'delayed'].includes(i.riskCategory) ? i.riskCategory : 'clear',
          note: i.note || '',
          receivedAmount: Number(i.receivedAmount) || 0,
        })).filter((i) => i.amount > 0 && i.expectedDate && !Number.isNaN(new Date(i.expectedDate).getTime())),
      })),
    } : {}),
  };

  return CollectionForecast.findOneAndUpdate(
    { unitId },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}
