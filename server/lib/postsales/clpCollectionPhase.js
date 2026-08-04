/**
 * CLP collection phases:
 * - Building-wide (slabs → top floor): one construction date → all units due together.
 * - Unit-specific (internal works → possession): each unit collects when that unit completes.
 */
import { clpMilestoneSortIndex } from './clpMilestoneOrder.js';
import { formatMilestoneLabel } from './milestoneLabels.js';
import { milestoneKey, slugMilestone } from './milestoneKey.js';

/** From internal plumbing / wall onwards — per clpMilestoneOrder.js sort index. */
export const UNIT_SPECIFIC_SORT_FROM = 13;

function achievedDateForMilestone(scheduleMap, milestoneName) {
  if (!scheduleMap?.size && !(scheduleMap instanceof Map)) {
    if (scheduleMap && typeof scheduleMap === 'object' && !Array.isArray(scheduleMap)) {
      const s = slugMilestone(milestoneName);
      for (const [key, val] of Object.entries(scheduleMap)) {
        const sk = slugMilestone(key);
        if (sk === s || sk.includes(s) || s.includes(sk)) {
          const d = new Date(val);
          return Number.isNaN(d.getTime()) ? null : d;
        }
      }
    }
    return null;
  }
  if (!scheduleMap?.size) return null;
  const s = slugMilestone(milestoneName);
  if (scheduleMap.has(s)) return scheduleMap.get(s);
  for (const [key, date] of scheduleMap) {
    if (key.includes(s) || s.includes(key)) return date;
  }
  return null;
}

export function isUnitSpecificClpMilestone(name) {
  return clpMilestoneSortIndex(name) >= UNIT_SPECIFIC_SORT_FROM;
}

export function isBuildingWideClpMilestone(name) {
  const s = String(name || '').trim();
  if (!s) return false;
  if (/^gst$/i.test(s)) return false;
  return !isUnitSpecificClpMilestone(s);
}

export function unitMilestoneDatesMap(unit) {
  if (!unit?.clpMilestoneDates) return {};
  if (unit.clpMilestoneDates instanceof Map) return Object.fromEntries(unit.clpMilestoneDates);
  return unit.clpMilestoneDates;
}

export function lookupUnitMilestoneDate(unitDates, milestoneName) {
  if (!unitDates || !milestoneName) return null;
  const label = formatMilestoneLabel(milestoneName);
  const key = milestoneKey(label);
  const raw = unitDates[key] || unitDates[label] || unitDates[milestoneName];
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function resolveMilestoneAchievedDate(d, ctx = {}) {
  const name = d?.milestoneNameRaw || d?.milestoneName || '';
  const unitDate = lookupUnitMilestoneDate(ctx.unitMilestoneDates, name);
  if (unitDate) return unitDate;
  if (d?.actualDate) {
    const a = new Date(d.actualDate);
    if (!Number.isNaN(a.getTime())) return a;
  }

  if (isUnitSpecificClpMilestone(name)) return null;

  const projectDate = achievedDateForMilestone(ctx.projectAchievedMap, name);
  if (projectDate) return projectDate;
  const target = d?.targetDate || d?.dueDate;
  if (!target) return null;
  const t = new Date(target);
  return Number.isNaN(t.getTime()) ? null : t;
}

export function buildUnitCollectionContext(unit, projectAchievedMap) {
  const raw = unitMilestoneDatesMap(unit);
  const unitMilestoneDates = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    const d = v instanceof Date ? v : new Date(v);
    unitMilestoneDates[k] = Number.isNaN(d.getTime()) ? v : d.toISOString();
  }
  return {
    unitMilestoneDates,
    projectAchievedMap: projectAchievedMap || null,
  };
}

export function resolveScheduleDateForUnit(unit, projectAchievedMap, milestoneName, rowAchieved) {
  if (isUnitSpecificClpMilestone(milestoneName)) {
    return lookupUnitMilestoneDate(unitMilestoneDatesMap(unit), milestoneName);
  }
  return achievedDateForMilestone(projectAchievedMap, milestoneName)
    || (rowAchieved ? new Date(rowAchieved) : null);
}

export function collectionPhaseLabel(name) {
  return isUnitSpecificClpMilestone(name) ? 'unit' : 'building';
}

export { slugMilestone };
