import Unit from '../../models/postsales/Unit.js';
import ProjectClpSchedule from '../../models/postsales/ProjectClpSchedule.js';
import { normalizeClpScheduleRows } from './projectClpSchedule.js';
import { sortScheduleRows } from './clpBookingMilestones.js';
import { ensureClpLetterTasksForUnit } from './clpLetterTasks.js';

/** Effective CLP rows for a unit: unit override schedule, else project schedule. */
export async function getEffectiveClpRowsForUnit(unit) {
  const overrideRows = unit?.clpScheduleOverride?.rows;
  if (Array.isArray(overrideRows) && overrideRows.length) {
    return sortScheduleRows(overrideRows);
  }
  if (!unit?.project) return [];
  const schedule = await ProjectClpSchedule.findOne({ project: unit.project }).lean();
  return sortScheduleRows(schedule?.rows || []);
}

export function unitHasClpOverride(unit) {
  return Array.isArray(unit?.clpScheduleOverride?.rows) && unit.clpScheduleOverride.rows.length > 0;
}

export async function getUnitClpOverridePayload(unitId) {
  const unit = await Unit.findById(unitId).lean();
  if (!unit) throw new Error('Unit not found');

  const projectSchedule = unit.project
    ? await ProjectClpSchedule.findOne({ project: unit.project }).lean()
    : null;
  const projectRows = sortScheduleRows(projectSchedule?.rows || []);
  const unitRows = sortScheduleRows(unit.clpScheduleOverride?.rows || []);

  return {
    unitId: unit._id,
    project: unit.project,
    unitNumber: unit.unitNumber,
    hasOverride: unitRows.length > 0,
    projectRows,
    unitRows,
    updatedBy: unit.clpScheduleOverride?.updatedBy,
    updatedAt: unit.clpScheduleOverride?.updatedAt,
  };
}

export async function saveUnitClpOverride(unitId, rows, updatedBy = '') {
  const unit = await Unit.findById(unitId);
  if (!unit) throw new Error('Unit not found');

  const normalized = normalizeClpScheduleRows(rows || []);
  if (!normalized.length) {
    unit.clpScheduleOverride = undefined;
    unit.markModified('clpScheduleOverride');
  } else {
    unit.clpScheduleOverride = {
      rows: normalized,
      updatedBy,
      updatedAt: new Date(),
    };
  }
  await unit.save();

  const sync = await ensureClpLetterTasksForUnit(unitId, updatedBy || 'Unit CLP');
  return { unit: unit.toObject(), ...sync };
}

export async function clearUnitClpOverride(unitId, updatedBy = '') {
  return saveUnitClpOverride(unitId, [], updatedBy);
}

export async function uploadUnitClpOverride(unitId, rawRows, updatedBy = '') {
  const normalized = normalizeClpScheduleRows(rawRows || []);
  if (!normalized.length) throw new Error('No valid CLP rows in upload');
  return saveUnitClpOverride(unitId, normalized, updatedBy);
}
