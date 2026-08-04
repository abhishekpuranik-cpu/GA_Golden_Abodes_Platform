/** Cumulative due / received / pending — agreement vs GST (CRM collection report aligned). */

import {
  isBuildingWideClpMilestone,
  isUnitSpecificClpMilestone,
  resolveMilestoneAchievedDate,
} from './clpCollectionPhase.js';

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

export function milestoneDueAsOfToday(d, asOf = new Date(), ctx = null) {
  const today = startOfDay(asOf);
  const name = d?.milestoneNameRaw || d?.milestoneName || '';

  if (ctx && isUnitSpecificClpMilestone(name)) {
    const achieved = resolveMilestoneAchievedDate(d, ctx);
    if (!achieved) return false;
    return startOfDay(achieved).getTime() <= today.getTime();
  }

  const raw = d?.targetDate || d?.dueDate;
  if (!raw) {
    const slugName = slug(name);
    if (/token|booking/.test(slugName)) return true;
    if (ctx && isBuildingWideClpMilestone(name)) {
      const achieved = resolveMilestoneAchievedDate(d, ctx);
      if (achieved) return startOfDay(achieved).getTime() <= today.getTime();
    }
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

export function gstDueOnRow(d) {
  if (isGstDemand(d)) return 0;
  if (num(d?.gstAmount) > 0) return num(d.gstAmount);
  return Math.round(agreementDueOnRow(d) * 0.05);
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

export function milestoneRowAmounts(d, asOf = new Date(), ctx = null) {
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
  const dueToday = milestoneDueAsOfToday(d, asOf, ctx);
  const agreementDue = dueToday ? agreementDueOnRow(d) : 0;
  const gstDue = dueToday ? gstDueOnRow(d) : 0;
  const agreementReceived = dueToday ? num(d?.receivedAmount ?? d?.paidAmount) : 0;
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

function rowCrmPending(d, due, received) {
  if (d?.pendingAmount != null && Number.isFinite(Number(d.pendingAmount))) {
    return Math.max(0, num(d.pendingAmount));
  }
  return Math.max(0, due - received);
}

/** Full CRM collection-report totals — all milestone Amount Due columns (no date filter). */
export function computeCrmReportTotals(milestones = []) {
  const gstRow = findGstDemand(milestones);

  let agreementDue = 0;
  let agreementReceived = 0;
  let agreementPending = 0;
  let gstDue = 0;
  let gstReceived = 0;
  let gstPending = 0;
  let postStageDue = 0;
  let postStageReceived = 0;
  let postStagePending = 0;

  for (const d of milestones) {
    if (isGstDemand(d)) continue;

    const due = agreementDueOnRow(d);
    const received = num(d?.receivedAmount ?? d?.paidAmount);
    const pending = rowCrmPending(d, due, received);

    if (isPostStageDemand(d)) {
      postStageDue += due;
      postStageReceived += received;
      postStagePending += pending;
      continue;
    }

    agreementDue += due;
    agreementReceived += received;
    agreementPending += pending;
  }

  if (gstRow) {
    gstDue = readGstDue(gstRow);
    gstReceived = readGstReceived(gstRow);
    gstPending = rowCrmPending(gstRow, gstDue, gstReceived);
  }

  return {
    agreementDue,
    agreementReceived,
    agreementPending,
    gstDue,
    gstReceived,
    gstPending,
    postStageDue,
    postStageReceived,
    postStagePending,
    totalDue: agreementDue + gstDue + postStageDue,
    totalReceived: agreementReceived + gstReceived + postStageReceived,
    totalPending: agreementPending + gstPending + postStagePending,
  };
}

/** Unit totals: agreement side filtered by CLP/instalment due date ≤ today; GST from CRM GST row. */
export function computeUnitCumulative(milestones = [], asOf = new Date(), ctx = null) {
  const gstRow = findGstDemand(milestones);
  const clpRows = milestones.filter((d) => !isPostStageDemand(d));

  let agreementDue = 0;
  let agreementReceived = 0;
  for (const d of clpRows) {
    if (!milestoneDueAsOfToday(d, asOf, ctx)) continue;
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
    totalDue: agreementDue + gstDue,
    totalReceived: agreementReceived + gstReceived,
    totalPending: Math.max(0, agreementDue + gstDue - agreementReceived - gstReceived),
  };
}

export function milestoneRowDisplay(d, asOf = new Date(), ctx = null) {
  if (isGstDemand(d)) return milestoneRowAmounts(d, asOf, ctx);
  return milestoneRowAmounts(d, asOf, ctx);
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

export function sumCrmReportSummary(unitGroups) {
  return unitGroups.reduce(
    (acc, g) => ({
      agreementDue: acc.agreementDue + (g.crmAgreementDue ?? 0),
      agreementReceived: acc.agreementReceived + (g.crmAgreementReceived ?? 0),
      agreementPending: acc.agreementPending + (g.crmAgreementPending ?? 0),
      gstDue: acc.gstDue + (g.crmGstDue ?? 0),
      gstReceived: acc.gstReceived + (g.crmGstReceived ?? 0),
      gstPending: acc.gstPending + (g.crmGstPending ?? 0),
      postStageDue: acc.postStageDue + (g.crmPostStageDue ?? 0),
      postStageReceived: acc.postStageReceived + (g.crmPostStageReceived ?? 0),
      postStagePending: acc.postStagePending + (g.crmPostStagePending ?? 0),
      totalDue: acc.totalDue + (g.crmTotalDue ?? 0),
      totalReceived: acc.totalReceived + (g.crmTotalReceived ?? 0),
      totalPending: acc.totalPending + (g.crmTotalPending ?? 0),
    }),
    {
      agreementDue: 0,
      agreementReceived: 0,
      agreementPending: 0,
      gstDue: 0,
      gstReceived: 0,
      gstPending: 0,
      postStageDue: 0,
      postStageReceived: 0,
      postStagePending: 0,
      totalDue: 0,
      totalReceived: 0,
      totalPending: 0,
    },
  );
}
