export const BOOKING_ANCHORED_COUNT = 4;

export function effectiveAchievedDate(task, bookingDate) {
  if (task?.achievedDate) return task.achievedDate;
  const order = task?.scheduleOrder ?? 999;
  if (order < BOOKING_ANCHORED_COUNT && bookingDate) return bookingDate;
  return null;
}

export function isTaskEnabled(task, bookingDate) {
  return !!effectiveAchievedDate(task, bookingDate);
}

export function fmtClpPercent(p) {
  if (p == null || p === '') return '';
  const n = Number(p);
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}%`;
}
