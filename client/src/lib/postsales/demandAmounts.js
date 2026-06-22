/** Cumulative due / received / pending — agreement vs GST (Cashflow-aligned). */

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

const POST_STAGE_SLUGS = new Set(['gst', 'interest', 'stampduty', 'maintenancecharge', 'infracharges', 'stamp duty', 'maintenance charge', 'infra charges']);

export function isGstDemand(d) {
  const s = slug(d?.milestoneNameRaw || d?.milestoneName);
  return s === 'gst' || s.startsWith('gst ');
}

export function isPostStageDemand(d) {
  const s = slug(d?.milestoneNameRaw || d?.milestoneName);
  return POST_STAGE_SLUGS.has(s) || isGstDemand(d);
}

export function isInstallmentDemand(d) {
  return /installment/i.test(String(d?.milestoneNameRaw || d?.milestoneName || ''));
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

export function splitAgreementGstDue(d) {
  const agreementDue = num(d?.demandAmount) || Math.max(0, num(d?.totalAmount) - num(d?.gstAmount));
  const gstDue = num(d?.gstAmount) || Math.round(agreementDue * 0.05);
  return { agreementDue, gstDue, totalDue: agreementDue + gstDue };
}

/** Per-milestone row: CRM received is agreement value received (not incl. GST unless GST row). */
export function milestoneRowAmounts(d) {
  const { agreementDue, gstDue, totalDue } = splitAgreementGstDue(d);
  const agreementReceived = Math.min(agreementDue, num(d?.receivedAmount ?? d?.paidAmount));
  const gstReceived = isGstDemand(d)
    ? Math.min(gstDue, num(d?.receivedAmount ?? d?.paidAmount))
    : 0;
  return {
    agreementDue,
    gstDue,
    agreementReceived,
    gstReceived,
    agreementPending: Math.max(0, agreementDue - agreementReceived),
    gstPending: Math.max(0, gstDue - gstReceived),
    totalDue,
    totalReceived: agreementReceived + gstReceived,
    totalPending: Math.max(0, totalDue - agreementReceived - gstReceived),
  };
}

/**
 * Unit-level cumulative totals as of today.
 * Due = sum of milestone dues with target/due date on or before today (CLP stage / instalment date).
 * Received = sum of agreement received on CLP rows + GST row received (incremental CRM columns).
 */
export function computeUnitCumulative(milestones = [], asOf = new Date()) {
  const gstRow = milestones.find(isGstDemand);
  const clpRows = milestones.filter((d) => !isPostStageDemand(d));

  let agreementDue = 0;
  let gstDueFromStages = 0;
  for (const d of clpRows) {
    if (!milestoneDueAsOfToday(d, asOf)) continue;
    const { agreementDue: ad, gstDue: gd } = splitAgreementGstDue(d);
    agreementDue += ad;
    gstDueFromStages += gd;
  }

  let agreementReceived = 0;
  for (const d of clpRows) {
    agreementReceived += num(d?.receivedAmount ?? d?.paidAmount);
  }

  let gstDue = gstDueFromStages;
  let gstReceived = 0;
  if (gstRow) {
    const g = splitAgreementGstDue(gstRow);
    if (milestoneDueAsOfToday(gstRow, asOf) || num(gstRow.receivedAmount ?? gstRow.paidAmount) > 0) {
      gstDue = g.agreementDue || g.totalDue || gstDueFromStages;
    }
    gstReceived = num(gstRow.receivedAmount ?? gstRow.paidAmount);
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

/** Detail row: show amounts for milestone; pending respects due-as-of-today for due side only. */
export function milestoneRowDisplay(d, asOf = new Date()) {
  const row = milestoneRowAmounts(d);
  const dueNow = milestoneDueAsOfToday(d, asOf);
  if (!dueNow && !isGstDemand(d)) {
    return {
      ...row,
      agreementDue: 0,
      gstDue: 0,
      agreementPending: 0,
      gstPending: 0,
      totalDue: 0,
      totalPending: Math.max(0, row.totalReceived - row.agreementReceived - row.gstReceived),
    };
  }
  return row;
}

export function sumCumulativeSummary(unitGroups) {
  return unitGroups.reduce(
    (acc, g) => ({
      agreementDue: acc.agreementDue + g.agreementDue,
      agreementReceived: acc.agreementReceived + g.agreementReceived,
      agreementPending: acc.agreementPending + g.agreementPending,
      gstDue: acc.gstDue + g.gstDue,
      gstReceived: acc.gstReceived + g.gstReceived,
      gstPending: acc.gstPending + g.gstPending,
    }),
    { agreementDue: 0, agreementReceived: 0, agreementPending: 0, gstDue: 0, gstReceived: 0, gstPending: 0 },
  );
}
