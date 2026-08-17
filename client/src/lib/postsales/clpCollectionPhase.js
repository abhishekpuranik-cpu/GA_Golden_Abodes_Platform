/** Client mirror — CLP building-wide vs unit-specific collection rules. */
import { formatMilestoneLabel } from './milestoneLabels.js';

function slug(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function milestoneKey(label) {
  return slug(formatMilestoneLabel(label));
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
  if (!s || /^gst$/i.test(s)) return false;
  return isRccSlabFloorMilestone(s);
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

function achievedFromProjectMap(projectAchievedMap, milestoneName) {
  if (!projectAchievedMap) return null;
  const s = slug(milestoneName);
  if (projectAchievedMap instanceof Map) {
    if (projectAchievedMap.has(s)) return projectAchievedMap.get(s);
    for (const [key, date] of projectAchievedMap) {
      if (key.includes(s) || s.includes(key)) return date;
    }
    return null;
  }
  if (typeof projectAchievedMap === 'object') {
    for (const [key, val] of Object.entries(projectAchievedMap)) {
      const sk = slug(key);
      if (sk === s || sk.includes(s) || s.includes(sk)) {
        const d = new Date(val);
        return Number.isNaN(d.getTime()) ? null : d;
      }
    }
  }
  return null;
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
  const projectDate = achievedFromProjectMap(ctx.projectAchievedMap, name);
  if (projectDate) return projectDate;
  const target = d?.targetDate || d?.dueDate;
  if (!target) return null;
  const t = new Date(target);
  return Number.isNaN(t.getTime()) ? null : t;
}

export function collectionPhaseLabel(name) {
  return isUnitSpecificClpMilestone(name) ? 'unit' : 'building';
}
