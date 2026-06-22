import { formatMilestoneLabel } from './milestoneLabels.js';

function slug(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const META_KEYS = new Set([
  'project', 'building', 'unit', 'configuration', 'client', 'booking date',
  'registration date', 'area (sqft)', 'agreement amount', 'base price',
  'rate per sqft', 'infra charge', '% due pending', 'type',
  'total agreement', 'total amount',
]);

const POST_STAGE_KEYS = new Set(['gst', 'interest', 'stampduty', 'maintenancecharge', 'infracharges']);

function parseDate(v) {
  if (!v || v === '-') return undefined;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export { formatMilestoneLabel };

export function isCollectionReport(rawRows) {
  if (!rawRows?.length) return false;
  const typeValues = new Set(rawRows.map((r) => slug(r.Type || r.type)).filter(Boolean));
  return typeValues.has('amount due')
    && (typeValues.has('amount received') || typeValues.has('amount pending'));
}

/** Four-row blocks: Amount Due → Received → Pending → Due Date (optional). */
export function iterCollectionBlocks(rawRows) {
  const blocks = [];
  for (let i = 0; i < rawRows.length; ) {
    const due = rawRows[i];
    if (slug(due?.Type) !== 'amount due') {
      i += 1;
      continue;
    }
    const recv = rawRows[i + 1] || {};
    const pend = rawRows[i + 2] || {};
    if (slug(recv?.Type) !== 'amount received' || slug(pend?.Type) !== 'amount pending') {
      i += 1;
      continue;
    }
    let dates = null;
    let step = 3;
    if (slug(rawRows[i + 3]?.Type) === 'due date') {
      dates = rawRows[i + 3];
      step = 4;
    }
    blocks.push({ due, recv, pend, dates });
    i += step;
  }
  return blocks;
}

export function extractCollectionMilestones(block) {
  const { due, recv, pend, dates } = block;
  const milestones = [];
  let order = 0;
  for (const key of Object.keys(due)) {
    const sk = slug(key);
    if (META_KEYS.has(sk) || POST_STAGE_KEYS.has(sk)) continue;
    if (sk.startsWith('total')) continue;
    const dueAmount = Number(due[key]) || 0;
    const receivedAmount = Number(recv[key]) || 0;
    const pendingAmount = Number(pend[key]) || 0;
    if (dueAmount === 0 && receivedAmount === 0 && pendingAmount === 0) continue;
    const targetDate = dates ? parseDate(dates[key]) : undefined;
    milestones.push({
      milestoneName: formatMilestoneLabel(key),
      milestoneOrder: order,
      dueAmount,
      receivedAmount,
      pendingAmount,
      targetDate,
      dueDate: targetDate,
    });
    order += 1;
  }
  return milestones;
}

export function inferPipelineStep(milestones, { registrationDate, bookingAmount } = {}) {
  const recv = (re) => milestones
    .filter((m) => re.test(m.milestoneName))
    .reduce((s, m) => s + (m.receivedAmount || 0), 0);

  if (recv(/possession/i) > 0) return 14;
  if (recv(/registration|agreement|stamp/i) > 0 || registrationDate) return 9;
  if (recv(/token/i) > 0 || Number(bookingAmount) > 0) return 4;
  return 1;
}
