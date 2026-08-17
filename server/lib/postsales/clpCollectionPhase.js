/**
 * CLP collection phases:
 * - Building-wide: RCC structure slabs / floors through terrace — one construction date → all units due together.
 * - Unit-specific: booking, registration, finishing, possession, stamp duty, maintenance — per unit from CRM.
 */
import { formatMilestoneLabel } from './milestoneLabels.js';
import { milestoneKey, slugMilestone } from './milestoneKey.js';

function slug(name) {
  return slugMilestone(name);
}

/** RCC slab / floor milestones — shared construction progress for the whole building. */
export function isRccSlabFloorMilestone(name) {
  const s = slug(name);
  if (!s) return false;
  if (/raft|plinth|foundation/.test(s)) return true;
  if (/basement|lg slab/.test(s)) return true;
  if (/masonry|blockwork|brick/.test(s)) return true;
  if (/terrace/.test(s)) return true;
  if (/(?:^|\s)(\d{1,2})(?:st|nd|rd|th)?(?:\s|$).*(?:slab|floor)/.test(s)) return true;
  if (/slab\s*\d{1,2}/.test(s)) return true;
  return false;
}

const UNIT_SPECIFIC_RE = /token|booking|registration|agreement|\btds\b|stamp\s*duty|stampduty|internal.*plumb|plumb.*internal|staircase|lift well|floor lobby|wall|gypsum|plaster(?!.*external)|external.*plumb|external.*plaster|waterproof|lift|water pump|electrical|electromechanical|entrance lobby|facade|façade|possession|handover|maintenance\s*charge|maintenancecharge|infra\s*charge|infracharge|interest/i;

export function isUnitSpecificClpMilestone(name) {
  const s = slug(name);
  if (!s) return false;
  if (isRccSlabFloorMilestone(name)) return false;
  return UNIT_SPECIFIC_RE.test(s);
}

export function isBuildingWideClpMilestone(name) {
  const s = String(name || '').trim();
  if (!s) return false;
  if (/^gst$/i.test(s)) return false;
  return isRccSlabFloorMilestone(s);
}

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
