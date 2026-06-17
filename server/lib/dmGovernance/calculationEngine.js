import { DM_COLLECTIONS } from './collections.js';

export const INVOICE_STATUSES = [
  'DRAFT',
  'FINANCE_REVIEW',
  'PROJECT_REVIEW',
  'LEADERSHIP_APPROVED',
  'SENT',
  'PART_PAID',
  'PAID',
  'ACCRUED',
  'REJECTED'
];

export const APPROVAL_TRANSITIONS = {
  submit: { from: ['DRAFT'], to: 'FINANCE_REVIEW', permission: 'dm_finance' },
  approve_finance: { from: ['FINANCE_REVIEW'], to: 'LEADERSHIP_APPROVED', permission: 'dm_finance' },
  approve_leadership: { from: ['FINANCE_REVIEW', 'PROJECT_REVIEW'], to: 'LEADERSHIP_APPROVED', permission: 'dm_approve' },
  reject: { from: ['FINANCE_REVIEW', 'PROJECT_REVIEW', 'LEADERSHIP_APPROVED'], to: 'REJECTED', permission: 'dm_approve' },
  send: { from: ['LEADERSHIP_APPROVED'], to: 'SENT', permission: 'dm_finance' },
  accrue: { from: ['SENT'], to: 'ACCRUED', permission: 'dm_finance' },
  pay: { from: ['SENT', 'ACCRUED', 'PART_PAID'], to: 'PAID', permission: 'dm_finance' }
};

export const LINE_HEADS = {
  RETAINER: 'Development Management Retainer',
  SHARED_COST: 'Allocated Shared Service Cost',
  MARKUP: 'Cost-plus Markup',
  REIMBURSEMENT: 'Project-Specific Expense Reimbursement',
  COLLECTION_FEE: 'Collection-Linked DM Fee',
  ADJUSTMENT: 'Adjustment against DM fee cap',
  GST: 'GST'
};

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function getEligibleBase(project, config) {
  const type = config?.eligibleBaseType || project?.eligibleBaseType || 'topline_gdv';
  if (type === 'collections_ttd') return num(project?.collectionsTtd);
  if (type === 'agreement_value') return num(project?.agreementValue, num(project?.toplineGdv));
  return num(project?.toplineGdv);
}

export function getCollectionsPct(project, eligibleBase) {
  if (!eligibleBase) return 0;
  return (num(project?.collectionsTtd) / eligibleBase) * 100;
}

export function lookupSlabCumulativePct(slabs, collectionsPct) {
  const sorted = [...(slabs || [])].sort((a, b) => a.fromPct - b.fromPct);
  let pct = 0;
  for (const s of sorted) {
    if (collectionsPct >= num(s.fromPct) && collectionsPct < num(s.toPct, 100.01)) {
      pct = num(s.cumulativeDmPct);
      break;
    }
    if (collectionsPct >= num(s.toPct)) pct = num(s.cumulativeDmPct);
  }
  if (collectionsPct >= 100) {
    const last = sorted[sorted.length - 1];
    if (last) pct = num(last.cumulativeDmPct);
  }
  return pct;
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */
export async function sumProjectBillingTotals(db, projectId) {
  const invoices = db.collection(DM_COLLECTIONS.invoices);
  const approvedStatuses = ['LEADERSHIP_APPROVED', 'SENT', 'PART_PAID', 'PAID', 'ACCRUED'];
  const rows = await invoices.find({ projectId, status: { $in: approvedStatuses } }).toArray();

  let billedInsideCap = 0;
  let billedOutsideCap = 0;
  let paid = 0;
  let gstBilled = 0;

  rows.forEach((inv) => {
    billedInsideCap += num(inv.insideCapAmount);
    billedOutsideCap += num(inv.outsideCapAmount);
    paid += num(inv.paidAmount);
    gstBilled += num(inv.gstAmount);
  });

  const payments = db.collection(DM_COLLECTIONS.payments);
  const payRows = await payments.find({ projectId }).toArray();
  const paidFromPayments = payRows.reduce((s, p) => s + num(p.amount), 0);
  paid = Math.max(paid, paidFromPayments);

  return {
    dmFeeBilledTtd: billedInsideCap,
    dmFeeBilledOutsideCap: billedOutsideCap,
    dmFeePaidTtd: paid,
    dmFeeAccrued: Math.max(0, billedInsideCap + billedOutsideCap + gstBilled - paid),
    gstBilledTtd: gstBilled,
    invoiceCount: rows.length
  };
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */
export async function refreshProjectBillingTotals(db, projectId) {
  const totals = await sumProjectBillingTotals(db, projectId);
  await db.collection(DM_COLLECTIONS.projects).updateOne(
    { _id: projectId },
    {
      $set: {
        dmFeeBilledTtd: totals.dmFeeBilledTtd,
        dmFeePaidTtd: totals.dmFeePaidTtd,
        dmFeeAccrued: totals.dmFeeAccrued,
        updatedAt: new Date()
      }
    }
  );
  return totals;
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 * @param {string} periodMonth YYYY-MM
 * @param {object} [opts]
 */
export async function calculateMonthlyDmFee(db, projectId, periodMonth, opts = {}) {
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

  const costAlloc = await db.collection(DM_COLLECTIONS.costAllocations).findOne({
    projectId,
    periodMonth
  });

  const eligibleBase = getEligibleBase(project, config);
  const capPct = num(config.dmCapPct, num(project.dmCapPct, 10)) / 100;
  const dmCap = eligibleBase * capPct;
  const collectionsPct = getCollectionsPct(project, eligibleBase);
  const slabCumulativePct = lookupSlabCumulativePct(slabs, collectionsPct) / 100;

  const billingTotals = await sumProjectBillingTotals(db, projectId);
  const billedToDate = billingTotals.dmFeeBilledTtd;

  const retainer = num(config.retainerMonthly);
  const allocatedCost = num(costAlloc?.totalAllocatedCost);
  const markupPct = Math.min(num(config.markupPct, 10), num(config.markupCapPct, 12));
  const markupAmount = Math.round(allocatedCost * (markupPct / 100));
  const costPlusBillable = allocatedCost + markupAmount;
  const reimbursements = num(opts.reimbursements);

  const cumulativeEntitled = eligibleBase * slabCumulativePct;
  const isPreRevenue = ['pre_revenue', 'launched'].includes(project.revenueStatus) && collectionsPct < 10;

  const formulaTrace = [];
  formulaTrace.push({ step: 'eligibleBase', formula: `${config.eligibleBaseType}`, value: eligibleBase });
  formulaTrace.push({ step: 'dmCap', formula: 'eligibleBase × capPct', value: dmCap });
  formulaTrace.push({ step: 'collectionsPct', formula: 'collectionsTtd / eligibleBase × 100', value: collectionsPct });
  formulaTrace.push({ step: 'billedToDate', formula: 'Σ approved invoices inside cap', value: billedToDate });

  let componentDm = 0;

  if (isPreRevenue) {
    componentDm = retainer;
    formulaTrace.push({ step: 'phase', formula: 'PRE_REVENUE → retainer + cost-plus', value: componentDm + costPlusBillable });
  } else {
    const entitledToDate = cumulativeEntitled;
    componentDm = Math.max(retainer, entitledToDate - billedToDate);
    formulaTrace.push({
      step: 'collectionLinked',
      formula: 'max(retainer, cumulativeEntitled − billedToDate)',
      value: componentDm
    });
  }

  const grossSuggested = componentDm + costPlusBillable + reimbursements;

  const roomInCap = Math.max(0, dmCap - billedToDate);
  const insideCapAmount = Math.min(grossSuggested, roomInCap);
  const outsideCapAmount = Math.max(0, grossSuggested - insideCapAmount);
  const capBreach = outsideCapAmount > 0 || billedToDate + insideCapAmount > dmCap + 0.01;

  const taxableValue = insideCapAmount + outsideCapAmount;
  const gstRate = num(config.gstRate, 18);
  const gstAmount = Math.round(taxableValue * (gstRate / 100));
  const totalInvoiceAmount = taxableValue + gstAmount;

  const lineItems = [];
  if (componentDm > 0) {
    lineItems.push({
      head: isPreRevenue ? LINE_HEADS.RETAINER : LINE_HEADS.COLLECTION_FEE,
      description: isPreRevenue
        ? `DM retainer — ${periodMonth}`
        : `DM fee — ${collectionsPct.toFixed(1)}% collections / ${(slabCumulativePct * 100).toFixed(1)}% cumulative cap`,
      amount: componentDm,
      insideCap: true
    });
  }
  if (allocatedCost > 0) {
    lineItems.push({
      head: LINE_HEADS.SHARED_COST,
      description: `Allocated shared resources — ${periodMonth}`,
      amount: allocatedCost,
      insideCap: true
    });
  }
  if (markupAmount > 0) {
    lineItems.push({
      head: LINE_HEADS.MARKUP,
      description: `Markup ${markupPct}% on allocated cost`,
      amount: markupAmount,
      insideCap: true
    });
  }
  if (reimbursements > 0) {
    lineItems.push({
      head: LINE_HEADS.REIMBURSEMENT,
      description: 'Pass-through project expenses',
      amount: reimbursements,
      insideCap: true
    });
  }

  const balanceEligible = Math.max(0, dmCap - billedToDate - insideCapAmount);

  const outputs = {
    periodMonth,
    projectId,
    eligibleBase,
    dmCap,
    dmCapPct: capPct * 100,
    collectionsPct: Math.round(collectionsPct * 100) / 100,
    slabCumulativePct: slabCumulativePct * 100,
    cumulativeEntitled,
    billedToDate,
    paidToDate: billingTotals.dmFeePaidTtd,
    retainer,
    allocatedCost,
    markupPct,
    markupAmount,
    costPlusBillable,
    reimbursements,
    grossSuggested,
    insideCapAmount,
    outsideCapAmount,
    taxableValue,
    gstRate,
    gstAmount,
    totalInvoiceAmount,
    balanceEligible,
    capBreach,
    requiresLeadershipApproval: capBreach || outsideCapAmount > 0,
    suggestedInvoiceAmount: totalInvoiceAmount,
    phase: isPreRevenue ? 'PRE_REVENUE' : 'COLLECTION_ACTIVE'
  };

  return {
    inputs: {
      project: { id: projectId, name: project.name, revenueStatus: project.revenueStatus },
      config: { id: config._id, modelType: config.modelType },
      costAllocationId: costAlloc?._id || null,
      overrides: opts
    },
    outputs,
    lineItems,
    formulaTrace
  };
}
