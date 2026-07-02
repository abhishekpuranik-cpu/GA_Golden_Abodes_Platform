import CollectionForecast from '../../models/postsales/CollectionForecast.js';
import ClpLetterTask from '../../models/postsales/ClpLetterTask.js';
import { repairClpLetterTaskIndexes } from './clpLetterTaskIndexes.js';
import {
  resolveAchievedDateForUnitRow,
  sortScheduleRows,
} from './clpBookingMilestones.js';
import Unit from '../../models/postsales/Unit.js';
import { buildChecklist, computeDueDate, getStepDef } from './helpers.js';
import { formatMilestoneLabel } from './milestoneLabels.js';
import { milestoneKey, slugMilestone } from './milestoneKey.js';
import { defaultAssigneeForKind, getStepTaskKind } from './taskKinds.js';

const CLP_STEP = 12;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateKey(v) {
  const d = parseDate(v);
  return d ? d.toISOString().slice(0, 10) : '';
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

export function achievedDateForMilestone(scheduleMap, milestoneName) {
  if (!scheduleMap?.size) return null;
  const s = slugMilestone(milestoneName);
  if (scheduleMap.has(s)) return scheduleMap.get(s);
  for (const [key, date] of scheduleMap) {
    if (key.includes(s) || s.includes(key)) return date;
  }
  return null;
}

/** Rows whose achieved date changed (for incremental sync on save). */
export function rowsWithChangedAchievedDates(prevRows = [], nextRows = []) {
  const prev = new Map(
    (prevRows || []).map((r) => [slugMilestone(r.milestone), dateKey(r.achievedDate)]),
  );
  return (nextRows || []).filter((r) => {
    if (!r.milestone || !r.achievedDate) return false;
    return prev.get(slugMilestone(r.milestone)) !== dateKey(r.achievedDate);
  });
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

function findForecastMilestone(milestones, row) {
  const label = formatMilestoneLabel(row.milestone);
  const key = slugMilestone(label);
  const rowKey = slugMilestone(row.milestone);
  return milestones.find(
    (m) => slugMilestone(m.milestoneName) === key || slugMilestone(m.milestoneName) === rowKey,
  );
}

function pendingAmount(unit, row, ms) {
  const fromInst = (ms?.installments || []).reduce(
    (s, i) => s + Math.max(0, num(i.amount) - num(i.receivedAmount)),
    0,
  );
  if (fromInst > 0) return fromInst;
  return Math.max(0, (unit.totalCost || 0) * ((row.percentDue || 0) / 100));
}

function applyScheduleRowToForecastMilestones(milestones, unit, row, sortedRows) {
  const achievedDate = resolveAchievedDateForUnitRow(row, unit, sortedRows || [row]);
  if (!achievedDate || !row.milestone) return false;

  const label = formatMilestoneLabel(row.milestone);
  const amount = Math.max(0, (unit.totalCost || 0) * ((row.percentDue || 0) / 100));
  let ms = findForecastMilestone(milestones, row);

  if (!ms) {
    ms = {
      milestoneName: label,
      clpPercent: row.percentDue || 0,
      scheduleOrder: row.scheduleOrder ?? 0,
      achievedDate,
      installments: [],
    };
    milestones.push(ms);
  } else {
    const prev = dateKey(ms.achievedDate);
    const next = dateKey(achievedDate);
    const prevInst = dateKey(ms.installments?.[0]?.expectedDate);
    if (prev === next && prevInst === next && ms.clpPercent != null) return false;
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
          ...inst,
          expectedDate: achievedDate,
          amount: num(inst.amount) || pending || amount,
          scheduleLinked: true,
        }
        : inst
    ));
  }
  return true;
}

function collectBulkErrors(err, errors) {
  if (err?.writeErrors?.length) {
    for (const w of err.writeErrors) {
      const raw = w.errmsg || w.err?.message || String(w);
      errors.push(friendlyBulkError(raw));
    }
    return;
  }
  if (err?.message) errors.push(friendlyBulkError(err.message));
}

function friendlyBulkError(msg) {
  if (/demandId.*null|E11000.*demandId/i.test(msg)) {
    return 'Step 12 task index conflict (fixed on retry) — click Sync to units again.';
  }
  if (/E11000.*milestoneKey/i.test(msg)) {
    return 'Duplicate milestone checklist for a unit — open that unit’s Step 12 once, then retry sync.';
  }
  return msg;
}

async function bulkSyncForecasts(allUnits, rows) {
  if (!allUnits.length || !rows.length) return { forecastsUpdated: 0, errors: [] };

  const sortedRows = sortScheduleRows(rows);
  const unitIds = allUnits.map((u) => u._id);
  const forecasts = await CollectionForecast.find({ unitId: { $in: unitIds } }).lean();
  const forecastMap = new Map(forecasts.map((f) => [String(f.unitId), f]));

  const ops = [];
  let forecastsUpdated = 0;

  for (const unit of allUnits) {
    const existing = forecastMap.get(String(unit._id));
    const milestones = JSON.parse(JSON.stringify(existing?.milestones || []));
    let changed = false;
    for (const row of sortedRows) {
      if (applyScheduleRowToForecastMilestones(milestones, unit, row, sortedRows)) changed = true;
    }
    if (!changed) continue;
    forecastsUpdated += 1;
    ops.push({
      updateOne: {
        filter: { unitId: unit._id },
        update: { $set: { milestones } },
        upsert: true,
      },
    });
  }

  const errors = [];
  if (ops.length) {
    try {
      await CollectionForecast.bulkWrite(ops, { ordered: false });
    } catch (e) {
      collectBulkErrors(e, errors);
    }
  }
  return { forecastsUpdated, errors };
}

/** Push schedule rows (incl. booking-anchored first 4) into one unit's collection forecast. */
export async function upsertUnitForecastMilestones(unit, scheduleRows) {
  const sortedRows = sortScheduleRows(scheduleRows);
  if (!sortedRows.length || !unit?._id) return;

  const existing = await CollectionForecast.findOne({ unitId: unit._id }).lean();
  const milestones = JSON.parse(JSON.stringify(existing?.milestones || []));
  let changed = false;
  for (const row of sortedRows) {
    if (applyScheduleRowToForecastMilestones(milestones, unit, row, sortedRows)) changed = true;
  }
  if (!changed) return;
  await CollectionForecast.updateOne(
    { unitId: unit._id },
    { $set: { milestones } },
    { upsert: true },
  );
}

async function bulkSyncStep12Tasks(step12Units, rows, by) {
  if (!step12Units.length || !rows.length) return { tasksCreated: 0, errors: [] };

  const unitIds = step12Units.map((u) => u._id);
  const existing = await ClpLetterTask.find({ unitId: { $in: unitIds } }).lean();
  const existingByKey = new Map(
    existing.map((t) => [`${String(t.unitId)}|${t.milestoneKey || milestoneKey(t.milestoneName)}`, t]),
  );

  const def = getStepDef(CLP_STEP);
  const taskKind = getStepTaskKind(CLP_STEP);
  const now = new Date();
  const dueDate = computeDueDate(def, now);
  const ops = [];
  let tasksCreated = 0;
  const sortedRows = sortScheduleRows(rows);

  for (const unit of step12Units) {
    const checklist = buildChecklist(def, unit.fundingType);
    const assignee = defaultAssigneeForKind(unit, taskKind);

    for (const row of sortedRows) {
      const achieved = resolveAchievedDateForUnitRow(row, unit, sortedRows);
      if (!achieved || !row.milestone) continue;

      const label = formatMilestoneLabel(row.milestone);
      const key = milestoneKey(label);
      const mapKey = `${String(unit._id)}|${key}`;
      const prev = existingByKey.get(mapKey);
      if (prev?.status === 'complete') continue;

      const status = achieved ? 'in_progress' : 'open';
      if (
        prev
        && dateKey(prev.achievedDate) === dateKey(achieved)
        && prev.status === status
      ) {
        continue;
      }

      tasksCreated += 1;
      ops.push({
        updateOne: {
          filter: { unitId: unit._id, milestoneKey: key },
          update: {
            $set: {
              milestoneName: label,
              clpPercent: row.percentDue ?? prev?.clpPercent,
              scheduleOrder: row.scheduleOrder ?? prev?.scheduleOrder ?? 0,
              achievedDate: achieved,
              status: prev?.status === 'complete' ? prev.status : status,
              dueDate,
              assignee: prev?.assignee || assignee,
              triggeredBy: 'clp_schedule',
            },
            $setOnInsert: {
              unitId: unit._id,
              milestoneKey: key,
              checklist,
              activityLog: [{
                action: 'created',
                at: now,
                by,
                detail: `CLP letter — ${label} · achieved ${achieved.toISOString().slice(0, 10)}`,
              }],
            },
          },
          upsert: true,
        },
      });
    }
  }

  const errors = [];
  if (ops.length) {
    try {
      await ClpLetterTask.bulkWrite(ops, { ordered: false });
    } catch (e) {
      collectBulkErrors(e, errors);
    }
  }
  return { tasksCreated, errors };
}

/**
 * Batch sync: one unit query, bulk forecast + task writes.
 */
export async function syncProjectScheduleAchievedDates(
  project,
  { phase, building, by = 'CLP Schedule', rowsOnly, syncTasks = true } = {},
) {
  const rows = (rowsOnly || []).filter((r) => r.achievedDate && r.milestone);
  if (!rows.length) {
    return { results: [], totals: { milestones: 0, forecastsUpdated: 0, tasksCreated: 0 }, errors: [], unitsAffected: 0 };
  }

  await repairClpLetterTaskIndexes();

  const allUnits = await Unit.find(buildUnitFilter(project, { phase, building })).lean();
  if (!allUnits.length) {
    return {
      results: rows.map((r) => ({ milestone: r.milestone, skipped: true, reason: 'No units in scope' })),
      totals: { milestones: 0, forecastsUpdated: 0, tasksCreated: 0 },
      errors: [],
      unitsAffected: 0,
    };
  }

  const forecastResult = await bulkSyncForecasts(allUnits, rows);
  let taskErrors = [];
  let tasksCreated = 0;

  if (syncTasks) {
    const step12Units = allUnits.filter((u) => (u.currentStepNumber || 0) >= 12);
    const taskResult = await bulkSyncStep12Tasks(step12Units, rows, by);
    tasksCreated = taskResult.tasksCreated;
    taskErrors = taskResult.errors;
  }

  const errors = [...forecastResult.errors, ...taskErrors];

  return {
    results: rows.map((r) => ({ milestone: r.milestone, skipped: false })),
    totals: {
      milestones: rows.length,
      forecastsUpdated: forecastResult.forecastsUpdated,
      tasksCreated,
    },
    errors,
    unitsAffected: allUnits.length,
  };
}

/** @deprecated use syncProjectScheduleAchievedDates — kept for trigger-demands route */
export async function syncScheduleRowToUnits(project, row, options = {}) {
  return syncProjectScheduleAchievedDates(project, { ...options, rowsOnly: [row] });
}

export { milestoneKey, slugMilestone };
