import CollectionForecast from '../../models/postsales/CollectionForecast.js';
import Demand from '../../models/postsales/Demand.js';
import Unit from '../../models/postsales/Unit.js';
import { agreementDueOnRow, isGstDemand } from './demandAmounts.js';
import { createOrReopenClpLetterTask } from './clpLetterTasks.js';
import { formatMilestoneLabel } from './milestoneLabels.js';

function slug(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildAchievedDateMap(rows = []) {
  const map = new Map();
  for (const row of rows || []) {
    const dt = parseDate(row.achievedDate);
    if (!dt || !row.milestone) continue;
    map.set(slug(row.milestone), dt);
  }
  return map;
}

/** Resolve achieved date from project CLP schedule for a demand milestone label. */
export function achievedDateForMilestone(scheduleMap, milestoneName) {
  if (!scheduleMap?.size) return null;
  const s = slug(milestoneName);
  if (scheduleMap.has(s)) return scheduleMap.get(s);
  for (const [key, date] of scheduleMap) {
    if (key.includes(s) || s.includes(key)) return date;
  }
  return null;
}

function buildUnitFilter(project, { phase, building } = {}) {
  const filter = {
    project,
    overallStatus: { $ne: 'cancelled' },
  };
  if (phase) filter.phase = phase;
  if (building) {
    filter.$or = [{ building }, { tower: building }];
  }
  return filter;
}

function buildClpTaskFilter(project, { phase, building } = {}) {
  return {
    ...buildUnitFilter(project, { phase, building }),
    currentStepNumber: { $gte: 9 },
  };
}

async function findDemandForUnit(unitId, milestoneName) {
  const label = formatMilestoneLabel(milestoneName);
  const s = slug(milestoneName);
  const demands = await Demand.find({ unitId }).lean();
  return demands.find((d) => {
    if (isGstDemand(d)) return false;
    const dn = slug(d.milestoneName);
    return dn === s || dn === slug(label) || dn.includes(s) || s.includes(dn);
  });
}

async function ensureDemandForUnit({ unit, row, achievedDate, now }) {
  const existing = await findDemandForUnit(unit._id, row.milestone);
  if (existing) return { demand: existing, created: false };

  const label = formatMilestoneLabel(row.milestone);
  const demandAmount = (unit.totalCost || 0) * ((row.percentDue || 0) / 100);
  const gstAmount = Math.round(demandAmount * 0.05);
  const totalAmount = demandAmount + gstAmount;
  const dueDate = row.targetDate ? new Date(row.targetDate) : new Date(now);
  if (!row.targetDate) dueDate.setDate(dueDate.getDate() + 14);

  const demand = await Demand.create({
    unitId: unit._id,
    entity: unit.entity,
    milestoneName: label,
    clpPercent: row.percentDue || 0,
    demandAmount,
    gstAmount,
    totalAmount,
    issuedDate: now,
    dueDate,
    targetDate: row.targetDate || dueDate,
    actualDate: achievedDate,
    paymentStatus: 'pending',
    paidAmount: 0,
    source: 'clp_schedule',
  });
  return { demand, created: true };
}

async function syncForecastInstallmentDate(unitId, demand, expectedDate) {
  const clpDue = agreementDueOnRow(demand);
  const clpReceived = num(demand.paidAmount);
  const clpPending = Math.max(0, clpDue - clpReceived);
  if (clpPending <= 0) return false;

  let forecast = await CollectionForecast.findOne({ unitId });
  if (!forecast) {
    forecast = new CollectionForecast({ unitId, milestones: [] });
  }

  const msSlug = slug(demand.milestoneName);
  let ms = forecast.milestones.find(
    (m) => String(m.demandId) === String(demand._id) || slug(m.milestoneName) === msSlug,
  );

  if (!ms) {
    ms = {
      demandId: demand._id,
      milestoneName: demand.milestoneName,
      installments: [],
    };
    forecast.milestones.push(ms);
  } else {
    ms.demandId = ms.demandId || demand._id;
    ms.milestoneName = ms.milestoneName || demand.milestoneName;
  }

  const instPayload = {
    amount: clpPending,
    expectedDate,
    includesTax: false,
    taxAmount: 0,
    riskCategory: 'clear',
    note: '',
    receivedAmount: clpReceived,
    status: clpPending <= 0 ? 'complete' : 'planned',
    scheduleLinked: true,
  };

  if (!ms.installments?.length) {
    ms.installments = [instPayload];
  } else {
    ms.installments = ms.installments.map((inst, idx) => (
      idx === 0
        ? {
          ...(inst.toObject?.() ?? inst),
          expectedDate,
          amount: num(inst.amount) || clpPending,
          scheduleLinked: true,
        }
        : inst
    ));
  }

  forecast.markModified('milestones');
  await forecast.save();
  return true;
}

/**
 * Push one schedule row's achieved date to matching units (demands, Reports forecast, Step 12 tasks).
 */
export async function syncScheduleRowToUnits(project, row, { phase, building, by = 'CLP Schedule' } = {}) {
  const achievedDate = parseDate(row.achievedDate);
  if (!achievedDate || !row.milestone) {
    return { skipped: true, reason: 'Missing achieved date or milestone name' };
  }

  const now = new Date();
  const allUnits = await Unit.find(buildUnitFilter(project, { phase, building })).lean();
  const clpUnits = await Unit.find(buildClpTaskFilter(project, { phase, building })).populate('customerId').lean();
  const clpUnitIds = new Set(clpUnits.map((u) => String(u._id)));

  let demandsUpdated = 0;
  let demandsCreated = 0;
  let forecastsUpdated = 0;
  let tasksCreated = 0;

  for (const unit of allUnits) {
    let demand = await findDemandForUnit(unit._id, row.milestone);
    const canCreate = clpUnitIds.has(String(unit._id));

    if (!demand && canCreate && row.percentDue) {
      const created = await ensureDemandForUnit({ unit, row, achievedDate, now });
      demand = created.demand;
      if (created.created) demandsCreated += 1;
    }
    if (!demand) continue;

    if (await syncForecastInstallmentDate(unit._id, demand, achievedDate)) {
      forecastsUpdated += 1;
    }

    const prevActual = demand.actualDate ? new Date(demand.actualDate).getTime() : null;
    if (prevActual !== achievedDate.getTime()) {
      await Demand.findByIdAndUpdate(demand._id, {
        actualDate: achievedDate,
        ...(row.targetDate && !demand.targetDate ? { targetDate: parseDate(row.targetDate) } : {}),
        ...(row.percentDue && !demand.clpPercent ? { clpPercent: row.percentDue } : {}),
      });
      demand = await Demand.findById(demand._id).lean();
      demandsUpdated += 1;
    }
  }

  for (const unit of clpUnits) {
    const demand = await findDemandForUnit(unit._id, row.milestone);
    if (!demand?.actualDate) continue;
    const task = await createOrReopenClpLetterTask({
      unit,
      demand,
      milestone: row,
      by,
      triggeredBy: 'clp_schedule',
    });
    if (task) tasksCreated += 1;
  }

  return {
    skipped: false,
    milestone: row.milestone,
    unitsAffected: allUnits.length,
    demandsUpdated,
    demandsCreated,
    forecastsUpdated,
    tasksCreated,
  };
}

/** Sync all achieved rows for a project (idempotent). */
export async function syncProjectScheduleAchievedDates(project, { phase, building, by = 'CLP Schedule', rowsOnly } = {}) {
  const rows = (rowsOnly || []).filter((r) => r.achievedDate && r.milestone);
  const results = [];
  for (const row of rows) {
    results.push(await syncScheduleRowToUnits(project, row, { phase, building, by }));
  }

  const totals = results.reduce(
    (acc, r) => ({
      milestones: acc.milestones + (r.skipped ? 0 : 1),
      demandsUpdated: acc.demandsUpdated + (r.demandsUpdated || 0),
      demandsCreated: acc.demandsCreated + (r.demandsCreated || 0),
      forecastsUpdated: acc.forecastsUpdated + (r.forecastsUpdated || 0),
      tasksCreated: acc.tasksCreated + (r.tasksCreated || 0),
    }),
    { milestones: 0, demandsUpdated: 0, demandsCreated: 0, forecastsUpdated: 0, tasksCreated: 0 },
  );

  return { results, totals };
}
