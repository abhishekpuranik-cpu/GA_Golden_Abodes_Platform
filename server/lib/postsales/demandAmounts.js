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
    const received = num(d?.paidAmount ?? d?.receivedAmount);
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
  };
}
