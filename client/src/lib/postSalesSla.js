/** Human-readable SLA target from SOP step definition (Word doc timings). */
export function formatSlaTarget(stepDef) {
  if (!stepDef) return '—';
  if (stepDef.slaDays) return `${stepDef.slaDays} ${stepDef.slaUnit || 'days'}`;
  if (stepDef.slaAck) return `Ack ${stepDef.slaAck} calendar day · Resolve ${stepDef.slaResolution} calendar days`;
  return 'Per SOP (no fixed SLA)';
}

export function formatDueDate(dueDate) {
  if (!dueDate) return '—';
  return new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Countdown / overdue label for an active step record. */
export function slaCountdown(stepRecord) {
  if (!stepRecord?.dueDate || stepRecord.status === 'completed') return null;
  const due = new Date(stepRecord.dueDate);
  due.setHours(23, 59, 59, 999);
  const now = new Date();
  const daysLeft = Math.ceil((due - now) / 86400000);
  if (daysLeft < 0) return { label: `${Math.abs(daysLeft)}d overdue`, tone: 'danger' };
  if (daysLeft === 0) return { label: 'Due today', tone: 'warning' };
  if (daysLeft <= 2) return { label: `${daysLeft}d left`, tone: 'warning' };
  return { label: `${daysLeft}d left`, tone: 'ok' };
}
