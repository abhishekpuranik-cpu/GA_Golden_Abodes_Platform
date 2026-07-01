import CollectionForecast from '../../models/postsales/CollectionForecast.js';
import Unit from '../../models/postsales/Unit.js';
import { createOrReopenClpLetterTask } from './clpLetterTasks.js';
import { formatMilestoneLabel } from './milestoneLabels.js';
import { milestoneKey, slugMilestone } from './milestoneKey.js';

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
    map.set(slugMilestone(row.milestone), dt);
  }
  return map;
}

/** Resolve achieved date from project CLP schedule for a milestone label. */
export function achievedDateForMilestone(scheduleMap, milestoneName) {
  if (!scheduleMap?.size) return null;
  const s = slugMilestone(milestoneName);
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

function buildStep12UnitFilter(project, { phase, building } = {}) {
  return {
    ...buildUnitFilter(project, { phase, building }),
    currentStepNumber: { $gte: 12 },
  };
}

function pendingAmount(unit, row, forecastMs) {
  const fromInst = (forecastMs?.installments || []).reduce(
    (s, i) => s + Math.max(0, num(i.amount) - num(i.receivedAmount)),
    0,
  );
  if (fromInst > 0) return fromInst;
  return Math.max(0, (unit.totalCost || 0) * ((row.percentDue || 0) / 100));
}

async function syncForecastMilestone(unit, row, achievedDate) {
  const label = formatMilestoneLabel(row.milestone);
  const key = slugMilestone(label);
  const amount = Math.max(0, (unit.totalCost || 0) * ((row.percentDue || 0) / 100));

  let forecast = await CollectionForecast.findOne({ unitId: unit._id });
  if (!forecast) {
    forecast = new CollectionForecast({ unitId: unit._id, milestones: [] });
  }

  let ms = forecast.milestones.find(
    (m) => slugMilestone(m.milestoneName) === key || slugMilestone(row.milestone) === slugMilestone(m.milestoneName),
  );

  if (!ms) {
    ms = {
      milestoneName: label,
      clpPercent: row.percentDue || 0,
      scheduleOrder: row.scheduleOrder ?? 0,
      achievedDate,
      installments: [],
    };
    forecast.milestones.push(ms);
  } else {
    ms.milestoneName = ms.milestoneName || label;
    ms.clpPercent = ms.clpPercent ?? row.percentDue ?? 0;
    ms.scheduleOrder = row.scheduleOrder ?? ms.scheduleOrder ?? 0;
    ms.achievedDate = achievedDate;
  }

  const pending = pendingAmount(unit, row, ms);
  const instPayload = {
    amount: pending || amount,
    expectedDate: achievedDate,
    includesTax: false,
    taxAmount: 0,
    riskCategory: 'clear',
    note: '',
    receivedAmount: num(ms.installments?.[0]?.receivedAmount),
    status: pending <= 0 ? 'complete' : 'planned',
    scheduleLinked: true,
  };

  if (!ms.installments?.length) {
    ms.installments = [instPayload];
  } else {
    ms.installments = ms.installments.map((inst, idx) => (
      idx === 0
        ? {
          ...(inst.toObject?.() ?? inst),
          expectedDate: achievedDate,
          amount: num(inst.amount) || pending || amount,
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
 * Milestones Achieved Date → Reports forecast + Step 12 tasks (no Demand tab).
 */
export async function syncScheduleRowToUnits(project, row, { phase, building, by = 'CLP Schedule' } = {}) {
  const achievedDate = parseDate(row.achievedDate);
  if (!achievedDate || !row.milestone) {
    return { skipped: true, reason: 'Missing achieved date or milestone name' };
  }

  const allUnits = await Unit.find(buildUnitFilter(project, { phase, building })).populate('customerId').lean();
  const step12Units = await Unit.find(buildStep12UnitFilter(project, { phase, building })).populate('customerId').lean();

  let forecastsUpdated = 0;
  let tasksCreated = 0;

  for (const unit of allUnits) {
    if (await syncForecastMilestone(unit, row, achievedDate)) {
      forecastsUpdated += 1;
    }
  }

  for (const unit of step12Units) {
    const task = await createOrReopenClpLetterTask({
      unit,
      milestoneName: row.milestone,
      clpPercent: row.percentDue,
      achievedDate,
      scheduleOrder: row.scheduleOrder,
      by,
      triggeredBy: 'clp_schedule',
    });
    if (task) tasksCreated += 1;
  }

  return {
    skipped: false,
    milestone: row.milestone,
    unitsAffected: allUnits.length,
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
      forecastsUpdated: acc.forecastsUpdated + (r.forecastsUpdated || 0),
      tasksCreated: acc.tasksCreated + (r.tasksCreated || 0),
    }),
    { milestones: 0, forecastsUpdated: 0, tasksCreated: 0 },
  );

  return { results, totals };
}

export { milestoneKey, slugMilestone };
