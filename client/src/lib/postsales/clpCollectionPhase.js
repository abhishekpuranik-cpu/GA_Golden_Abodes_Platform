/** Client mirror — CLP building-wide vs unit-specific collection rules. */
import { clpMilestoneSortIndex } from './clpMilestoneOrder.js';
import { formatMilestoneLabel } from './milestoneLabels.js';

export const UNIT_SPECIFIC_SORT_FROM = 13;

function slugMilestone(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function milestoneKey(label) {
  return slugMilestone(formatMilestoneLabel(label));
}

export function isUnitSpecificClpMilestone(name) {
  return clpMilestoneSortIndex(name) >= UNIT_SPECIFIC_SORT_FROM;
}

export function isBuildingWideClpMilestone(name) {
  const s = String(name || '').trim();
  if (!s || /^gst$/i.test(s)) return false;
  return !isUnitSpecificClpMilestone(s);
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
  const s = slugMilestone(milestoneName);
  if (projectAchievedMap instanceof Map) {
    if (projectAchievedMap.has(s)) return projectAchievedMap.get(s);
    for (const [key, date] of projectAchievedMap) {
      if (key.includes(s) || s.includes(key)) return date;
    }
    return null;
  }
  if (typeof projectAchievedMap === 'object') {
    for (const [key, val] of Object.entries(projectAchievedMap)) {
      const sk = slugMilestone(key);
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
