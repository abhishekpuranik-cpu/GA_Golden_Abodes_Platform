import { DM_COLLECTIONS } from './collections.js';
import {
  calculateMonthlyDmFee,
  getEligibleBase,
  getCollectionsPct,
  lookupSlabCumulativePct,
  sumProjectBillingTotals
} from './calculationEngine.js';

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Run a what-if billing scenario without persisting.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 * @param {object} assumptions
 */
export async function runBillingScenario(db, projectId, assumptions = {}) {
  const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: projectId });
  if (!project) throw new Error('Project not found');
  if (!project.activeBillingConfigId) throw new Error('No active billing model');

  const config = await db.collection(DM_COLLECTIONS.billingConfigs).findOne({ _id: project.activeBillingConfigId });
  if (!config) throw new Error('Billing config not found');

  const slabs = await db
    .collection(DM_COLLECTIONS.billingSlabs)
    .find({ configId: config._id })
    .sort({ sortOrder: 1 })
    .toArray();

  const periodMonth = assumptions.periodMonth || currentMonth();
  const baseline = await calculateMonthlyDmFee(db, projectId, periodMonth, {
    reimbursements: num(assumptions.reimbursements)
  });

  const virtualProject = { ...project };
  const virtualConfig = { ...config };

  if (assumptions.collectionsTtd != null) virtualProject.collectionsTtd = num(assumptions.collectionsTtd);
  if (assumptions.toplineGdv != null) virtualProject.toplineGdv = num(assumptions.toplineGdv);
  if (assumptions.revenueStatus) virtualProject.revenueStatus = assumptions.revenueStatus;
  if (assumptions.retainerMonthly != null) virtualConfig.retainerMonthly = num(assumptions.retainerMonthly);
  if (assumptions.markupPct != null) virtualConfig.markupPct = num(assumptions.markupPct);
  if (assumptions.dmCapPct != null) virtualConfig.dmCapPct = num(assumptions.dmCapPct);

  const eligibleBase = getEligibleBase(virtualProject, virtualConfig);
  const collectionsPct = getCollectionsPct(virtualProject, eligibleBase);
  const slabCumulativePct = lookupSlabCumulativePct(slabs, collectionsPct);
  const capPct = num(virtualConfig.dmCapPct, num(virtualProject.dmCapPct, 10)) / 100;
  const dmCap = eligibleBase * capPct;

  const billingTotals = await sumProjectBillingTotals(db, projectId);
  const billedToDate = billingTotals.dmFeeBilledTtd;
  const retainer = num(virtualConfig.retainerMonthly);
  const allocatedCost = num(assumptions.allocatedCost ?? baseline.outputs.allocatedCost);
  const markupPct = Math.min(num(virtualConfig.markupPct, 10), num(virtualConfig.markupCapPct, 12));
  const markupAmount = Math.round(allocatedCost * (markupPct / 100));
  const reimbursements = num(assumptions.reimbursements);
  const cumulativeEntitled = eligibleBase * (slabCumulativePct / 100);

  const isPreRevenue =
    ['pre_revenue', 'launched'].includes(virtualProject.revenueStatus) && collectionsPct < 10;

  let componentDm = isPreRevenue ? retainer : Math.max(retainer, cumulativeEntitled - billedToDate);
  const grossSuggested = componentDm + allocatedCost + markupAmount + reimbursements;
  const roomInCap = Math.max(0, dmCap - billedToDate);
  const insideCapAmount = Math.min(grossSuggested, roomInCap);
  const outsideCapAmount = Math.max(0, grossSuggested - insideCapAmount);
  const gstRate = num(virtualConfig.gstRate, 18);
  const taxableValue = insideCapAmount + outsideCapAmount;
  const gstAmount = Math.round(taxableValue * (gstRate / 100));

  const scenario = {
    periodMonth,
    assumptions,
    outputs: {
      eligibleBase,
      collectionsPct: Math.round(collectionsPct * 100) / 100,
      slabCumulativePct,
      dmCap,
      cumulativeEntitled,
      componentDm,
      insideCapAmount,
      outsideCapAmount,
      totalInvoiceAmount: taxableValue + gstAmount,
      capUtilAfter: dmCap > 0 ? ((billedToDate + insideCapAmount) / dmCap) * 100 : 0,
      phase: isPreRevenue ? 'PRE_REVENUE' : 'COLLECTION_ACTIVE',
      capBreach: outsideCapAmount > 0
    }
  };

  const delta = {
    invoiceAmount: scenario.outputs.totalInvoiceAmount - baseline.outputs.totalInvoiceAmount,
    insideCap: scenario.outputs.insideCapAmount - baseline.outputs.insideCapAmount,
    capUtilPct: scenario.outputs.capUtilAfter - (baseline.outputs.dmCap > 0
      ? ((baseline.outputs.billedToDate + baseline.outputs.insideCapAmount) / baseline.outputs.dmCap) * 100
      : 0)
  };

  const scenarioId = `scn_${projectId}_${Date.now().toString(36)}`;
  const doc = {
    _id: scenarioId,
    projectId,
    label: assumptions.label || `Scenario ${periodMonth}`,
    assumptions,
    baseline: baseline.outputs,
    scenario: scenario.outputs,
    delta,
    createdAt: new Date()
  };

  await db.collection(DM_COLLECTIONS.scenarios).insertOne(doc);

  return { scenarioId, baseline: baseline.outputs, scenario: scenario.outputs, delta, saved: true };
}
