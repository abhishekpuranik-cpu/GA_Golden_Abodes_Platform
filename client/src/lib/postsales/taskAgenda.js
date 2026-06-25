export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Week starts Monday (en-IN business convention). */
export function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

export function endOfWeek(d = new Date()) {
  return endOfDay(addDays(startOfWeek(d), 6));
}

export function startOfMonth(d = new Date()) {
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(d = new Date()) {
  return endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function startOfYear(d = new Date()) {
  return startOfDay(new Date(d.getFullYear(), 0, 1));
}

export function endOfYear(d = new Date()) {
  return endOfDay(new Date(d.getFullYear(), 11, 31));
}

export function dateKey(d) {
  const x = startOfDay(d);
  return x.toISOString().slice(0, 10);
}

export function taskAnchorDate(task) {
  const raw = task.nextActionDate || task.dueDate || task.triggerDate;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isOverdueTask(task, asOf = new Date()) {
  if (task.status === 'completed') return false;
  if (task.status === 'overdue' || task.slaBreach) return true;
  const due = task.dueDate ? new Date(task.dueDate) : null;
  if (!due || Number.isNaN(due.getTime())) return false;
  return endOfDay(due) < startOfDay(asOf);
}

export function formatDayLabel(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatWeekRange(start, end) {
  const a = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const b = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

export function formatMonthLabel(d) {
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function horizonRange(horizon, anchorDate) {
  const anchor = startOfDay(anchorDate);
  if (horizon === 'daily') {
    return { start: anchor, end: endOfDay(anchor), label: formatDayLabel(anchor) };
  }
  if (horizon === 'weekly') {
    const start = startOfWeek(anchor);
    const end = endOfWeek(anchor);
    return { start, end, label: formatWeekRange(start, end) };
  }
  const start = startOfYear(anchor);
  const end = endOfYear(anchor);
  return { start, end, label: String(anchor.getFullYear()) };
}

export function taskInHorizon(task, horizon, anchorDate) {
  const anchor = taskAnchorDate(task);
  const { start, end } = horizonRange(horizon, anchorDate);
  if (!anchor) return horizon === 'yearly';
  const t = startOfDay(anchor);
  return t >= start && t <= end;
}

export function splitTasksForView(tasks, horizon, anchorDate) {
  const { start, end } = horizonRange(horizon, anchorDate);
  const today = startOfDay(new Date());
  const overdue = [];
  const scheduled = [];
  const unscheduled = [];

  for (const task of tasks) {
    const anchor = taskAnchorDate(task);
    if (!anchor) {
      unscheduled.push(task);
      continue;
    }
    const day = startOfDay(anchor);
    if (isOverdueTask(task, anchorDate) && day < today) {
      overdue.push(task);
      continue;
    }
    if (day >= start && day <= end) scheduled.push(task);
  }

  return { overdue, scheduled, unscheduled };
}

export function groupTasksByDay(tasks) {
  const map = new Map();
  for (const task of tasks) {
    const anchor = taskAnchorDate(task);
    const key = anchor ? dateKey(anchor) : 'unscheduled';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a === 'unscheduled' ? 1 : b === 'unscheduled' ? -1 : a.localeCompare(b)))
    .map(([key, list]) => ({
      key,
      date: key === 'unscheduled' ? null : new Date(`${key}T12:00:00`),
      tasks: list,
    }));
}

export function weekDays(anchorDate) {
  const start = startOfWeek(anchorDate);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { date, key: dateKey(date), label: formatDayLabel(date), isToday: dateKey(date) === dateKey(new Date()) };
  });
}

export function yearMonths(anchorDate) {
  const y = anchorDate.getFullYear();
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(y, i, 1);
    return { month: i, date, key: `${y}-${String(i + 1).padStart(2, '0')}`, label: date.toLocaleDateString('en-IN', { month: 'short' }) };
  });
}

export function countTasksInMonth(tasks, year, month) {
  const start = startOfMonth(new Date(year, month, 1));
  const end = endOfMonth(start);
  return tasks.filter((t) => {
    const a = taskAnchorDate(t);
    if (!a) return false;
    const d = startOfDay(a);
    return d >= start && d <= end;
  }).length;
}

export function shiftAnchor(horizon, anchorDate, direction) {
  const d = new Date(anchorDate);
  if (horizon === 'daily') return addDays(d, direction);
  if (horizon === 'weekly') return addDays(d, direction * 7);
  return new Date(d.getFullYear() + direction, d.getMonth(), d.getDate());
}
