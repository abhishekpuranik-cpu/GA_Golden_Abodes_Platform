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
  const s = slug(d?.milestoneNameRaw || d?.milestoneName);
  if (!s) return false;
  if (s === 'gst' || s.startsWith('gst ')) return true;
  if (/\bgst\b/.test(s) && !/registration|agreement|infracharge/.test(s)) return true;
  return false;
}

export function isPostStageDemand(d) {
  const s = slug(d?.milestoneNameRaw || d?.milestoneName);
  const post = ['gst', 'interest', 'stampduty', 'maintenancecharge', 'infracharges', 'stamp duty', 'maintenance charge', 'infra charges'];
  return post.some((p) => s === p || s.startsWith(`${p} `)) || isGstDemand(d);
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

/** Agreement due on a CLP milestone row (CRM Amount Due = agreement value). */
export function agreementDueOnRow(d) {
  if (isGstDemand(d)) return 0;
  if (num(d?.demandAmount) > 0) return num(d.demandAmount);
  return Math.max(0, num(d?.totalAmount) - num(d?.gstAmount));
}

/** Per-stage GST component (informational when CRM has separate GST row). */
export function gstDueOnRow(d) {
  if (isGstDemand(d)) return 0;
  if (num(d?.gstAmount) > 0) return num(d.gstAmount);
  return Math.round(agreementDueOnRow(d) * 0.05);
}

/** CRM GST column — due / received are GST amounts (may be stored in gstAmount or legacy demandAmount). */
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
  return num(gstRow.paidAmount ?? gstRow.receivedAmount);
}

export function milestoneRowAmounts(d) {
  if (isGstDemand(d)) {
    const gstDue = readGstDue(d);
    const gstReceived = readGstReceived(d);
    return {
      agreementDue: 0,
      gstDue,
      agreementReceived: 0,
      gstReceived,
      agreementPending: 0,
      gstPending: Math.max(0, gstDue - gstReceived),
      totalDue: gstDue,
      totalReceived: gstReceived,
      totalPending: Math.max(0, gstDue - gstReceived),
    };
  }
  const agreementDue = agreementDueOnRow(d);
  const gstDue = gstDueOnRow(d);
  const agreementReceived = num(d?.receivedAmount ?? d?.paidAmount);
  return {
    agreementDue,
    gstDue,
    agreementReceived,
    gstReceived: 0,
    agreementPending: Math.max(0, agreementDue - agreementReceived),
    gstPending: Math.max(0, gstDue - Math.min(gstDue, Math.round(agreementReceived * 0.05))),
    totalDue: agreementDue + gstDue,
    totalReceived: agreementReceived,
    totalPending: Math.max(0, agreementDue + gstDue - agreementReceived),
  };
}

export function computeUnitCumulative(milestones = [], asOf = new Date()) {
  const gstRow = findGstDemand(milestones);
  const clpRows = milestones.filter((d) => !isPostStageDemand(d));

  let agreementDue = 0;
  for (const d of clpRows) {
    if (!milestoneDueAsOfToday(d, asOf)) continue;
    agreementDue += agreementDueOnRow(d);
  }

  let agreementReceived = 0;
  for (const d of clpRows) {
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
    totalDue: agreementDue + gstDue,
    totalReceived: agreementReceived + gstReceived,
    totalPending: Math.max(0, agreementDue + gstDue - agreementReceived - gstReceived),
  };
}

export function milestoneRowDisplay(d, asOf = new Date()) {
  if (isGstDemand(d)) return milestoneRowAmounts(d);
  const row = milestoneRowAmounts(d);
  if (!milestoneDueAsOfToday(d, asOf)) {
    return {
      ...row,
      agreementDue: 0,
      gstDue: 0,
      agreementPending: 0,
      gstPending: 0,
      totalDue: 0,
    };
  }
  return row;
}
