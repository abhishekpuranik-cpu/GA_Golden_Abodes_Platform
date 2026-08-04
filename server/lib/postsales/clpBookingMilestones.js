/** First N project schedule rows use unit booking date when no project achieved date is set. */
import { isUnitSpecificClpMilestone } from './clpCollectionPhase.js';
import { formatMilestoneLabel } from './milestoneLabels.js';
import { milestoneKey } from './milestoneKey.js';

export const BOOKING_ANCHORED_COUNT = 4;

export function parseAchievedDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function sortScheduleRows(rows = []) {
  return [...rows]
    .filter((r) => r.milestone && !/^gst$/i.test(String(r.milestone).trim()))
    .sort(
      (a, b) => (a.scheduleOrder ?? 999) - (b.scheduleOrder ?? 999)
        || String(a.milestone || '').localeCompare(String(b.milestone || '')),
    );
}

export function scheduleOrderOf(row, sortedRows) {
  if (row?.scheduleOrder != null) return row.scheduleOrder;
  return sortedRows.indexOf(row);
}

export function isBookingAnchoredRow(row, sortedRows) {
  return scheduleOrderOf(row, sortedRows) < BOOKING_ANCHORED_COUNT;
}

export function resolveAchievedDateForUnitRow(row, unit, sortedRows) {
  const label = String(row?.milestone || '').trim();
  if (label && unit?.clpMilestoneDates) {
    const dates = unit.clpMilestoneDates instanceof Map
      ? Object.fromEntries(unit.clpMilestoneDates)
      : unit.clpMilestoneDates;
    const key = milestoneKey(formatMilestoneLabel(label));
    const unitDate = dates[key] || dates[label];
    const parsed = parseAchievedDate(unitDate);
    if (parsed) return parsed;
  }

  const achieved = parseAchievedDate(row?.achievedDate);
  if (achieved && !isUnitSpecificClpMilestone(label)) return achieved;

  const target = parseAchievedDate(row?.targetDate);
  if (target && unit?.clpScheduleOverride?.rows?.length) return target;

  if (isUnitSpecificClpMilestone(label)) return null;

  if (unit?.bookingDate && isBookingAnchoredRow(row, sortedRows)) {
    return parseAchievedDate(unit.bookingDate);
  }
  return null;
}
