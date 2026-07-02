/** First N project schedule rows use unit booking date when no project achieved date is set. */
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
  const project = parseAchievedDate(row?.achievedDate);
  if (project) return project;
  if (unit?.bookingDate && isBookingAnchoredRow(row, sortedRows)) {
    return parseAchievedDate(unit.bookingDate);
  }
  return null;
}
