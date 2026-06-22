/** Cumulative due / received / pending — agreement vs GST (CRM collection report aligned). */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function slug(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function isGstDemand(d) {
  const raw = String(d?.milestoneNameRaw || d?.milestoneName || '').trim();
  if (/^gst$/i.test(raw)) return true;
  const s = slug(raw);
  if (!s) return false;
  if (s === 'gst' || s.startsWith('gst ')) return true;
  if (/\bgst\b/.test(s) && !/registration|agreement|infracharge/.test(s)) return true;
  return false;
}

export function isPostStageDemand(d) {
  if (isGstDemand(d)) return true;
  const s = slug(d?.milestoneNameRaw || d?.milestoneName);
  const post = ['interest', 'stampduty', 'maintenancecharge', 'infracharges', 'stamp duty', 'maintenance charge', 'infra charges'];
  return post.some((p) => s === p || s.startsWith(`${p} `));
}

export function findGstDemand(milestones = []) {
  return milestones.find(isGstDemand) || null;
}

export function milestoneDueAsOfToday(d, asOf = new Date()) {
  const today = startOfDay(asOf);
  const raw = d?.targetDate || d?.dueDate;
  if (!raw) {
    const name = slug(d?.milestoneNameRaw || d?.milestoneName);
    if (/token|booking/.test(name)) return true;
    return false;
  }
  const dt = startOfDay(new Date(raw));
  return !Number.isNaN(dt.getTime()) && dt.getTime() <= today.getTime();
}

export function agreementDueOnRow(d) {
  if (isGstDemand(d)) return 0;
  if (num(d?.demandAmount) > 0) return num(d.demandAmount);
  return Math.max(0, num(d?.totalAmount) - num(d?.gstAmount));
}

export function readGstDue(gstRow) {
  if (!gstRow) return 0;
  if (num(gstRow.demandAmount) === 0 && num(gstRow.gstAmount) > 0) return num(gstRow.gstAmount);
  if (isGstDemand(gstRow)) {
    return Math.max(num(gstRow.demandAmount), num(gstRow.totalAmount), num(gstRow.gstAmount));
  }
  return num(gstRow.gstAmount);
}

export function readGstReceived(gstRow) {
  if (!gstRow) return 0;
  const direct = num(gstRow.paidAmount ?? gstRow.receivedAmount);
  if (direct > 0) return direct;
  const due = readGstDue(gstRow);
  const pending = num(gstRow.pendingAmount);
  if (due > 0 && Number.isFinite(pending)) return Math.max(0, due - pending);
  return 0;
}

export function computeUnitCumulative(milestones = [], asOf = new Date()) {
  const gstRow = findGstDemand(milestones);
  const clpRows = milestones.filter((d) => !isPostStageDemand(d));

  let agreementDue = 0;
  let agreementReceived = 0;
  for (const d of clpRows) {
    if (!milestoneDueAsOfToday(d, asOf)) continue;
    agreementDue += agreementDueOnRow(d);
    agreementReceived += num(d?.receivedAmount ?? d?.paidAmount);
  }

  let gstDue;
  let gstReceived;
  if (gstRow) {
    gstDue = readGstDue(gstRow);
    gstReceived = readGstReceived(gstRow);
  } else {
    gstDue = Math.round(agreementDue * 0.05);
    gstReceived = 0;
  }

  return {
    agreementDue,
    agreementReceived,
    agreementPending: Math.max(0, agreementDue - agreementReceived),
    gstDue,
    gstReceived,
    gstPending: Math.max(0, gstDue - gstReceived),
  };
}
