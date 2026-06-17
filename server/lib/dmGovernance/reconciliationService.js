import { DM_COLLECTIONS } from './collections.js';
import { getEligibleBase, sumProjectBillingTotals } from './calculationEngine.js';
import { COMPLIANCE_DOC_TYPES } from './governanceConstants.js';

function num(v) {
  return Number(v) || 0;
}

/**
 * Build or refresh annual reconciliation for a project + FY.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 * @param {string} financialYear e.g. 2025-26
 */
export async function buildAnnualReconciliation(db, projectId, financialYear) {
  const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: projectId });
  if (!project) throw new Error('Project not found');

  const config = project.activeBillingConfigId
    ? await db.collection(DM_COLLECTIONS.billingConfigs).findOne({ _id: project.activeBillingConfigId })
    : null;

  const eligibleBase = getEligibleBase(project, config || {});
  const capPct = num(config?.dmCapPct ?? project.dmCapPct ?? 10) / 100;
  const maxDmFeeEntitlement = eligibleBase * capPct;

  const [fyStart, fyEnd] = parseFyRange(financialYear);

  const invoices = await db
    .collection(DM_COLLECTIONS.invoices)
    .find({
      projectId,
      status: { $nin: ['REJECTED', 'DRAFT'] },
      periodMonth: { $gte: fyStart, $lte: fyEnd }
    })
    .toArray();

  let monthlyRetainers = 0;
  let costPlusBilled = 0;
  let reimbursements = 0;
  let collectionLinked = 0;
  let totalGst = 0;

  invoices.forEach((inv) => {
    totalGst += num(inv.gstAmount);
    (inv.lineItems || []).forEach((line) => {
      const h = String(line.head || '').toLowerCase();
      const amt = num(line.amount);
      if (h.includes('retainer')) monthlyRetainers += amt;
      else if (h.includes('markup') || h.includes('shared')) costPlusBilled += amt;
      else if (h.includes('reimbursement')) reimbursements += amt;
      else if (h.includes('collection')) collectionLinked += amt;
      else monthlyRetainers += amt;
    });
    if (!(inv.lineItems || []).length) {
      monthlyRetainers += num(inv.insideCapAmount);
    }
  });

  const totals = await sumProjectBillingTotals(db, projectId);
  const totalGaBilling = totals.dmFeeBilledTtd + totals.dmFeeBilledOutsideCap;
  const amountInsideCap = totals.dmFeeBilledTtd;
  const amountOutsideCap = totals.dmFeeBilledOutsideCap;
  const amountPaid = totals.dmFeePaidTtd;
  const amountAccrued = Math.max(0, totalGaBilling + totalGst - amountPaid);

  const excessBilled = Math.max(0, amountInsideCap - maxDmFeeEntitlement);
  const balanceEligible = Math.max(0, maxDmFeeEntitlement - amountInsideCap);
  const creditAdjustmentRequired = excessBilled > 0 ? excessBilled : 0;

  const openingUnpaid = await openingUnpaidInvoices(db, projectId, fyStart);

  const doc = {
    _id: `recon_${projectId}_${financialYear}`,
    projectId,
    spvId: project.spvIds?.[0] || null,
    financialYear,
    fyStart,
    fyEnd,
    projectTopline: num(project.toplineGdv),
    collectionsTtd: num(project.collectionsTtd),
    eligibleBase,
    maxDmFeeEntitlement,
    dmCapPct: capPct * 100,
    openingUnpaidGaInvoices: openingUnpaid,
    monthlyRetainersBilled: monthlyRetainers,
    costPlusBilled,
    reimbursementsBilled: reimbursements,
    collectionLinkedDmFee: collectionLinked,
    totalGaBilling,
    amountAdjustedAgainstCap: amountInsideCap,
    amountOutsideCap,
    amountPaidBySpv: amountPaid,
    amountAccruedPayable: amountAccrued,
    balanceDmFeeEligible: balanceEligible,
    excessBilled,
    creditAdjustmentRequired,
    gstBilled: totalGst,
    status: 'draft',
    locked: false,
    remarks: '',
    generatedAt: new Date(),
    updatedAt: new Date()
  };

  await db.collection(DM_COLLECTIONS.annualReconciliations).updateOne(
    { _id: doc._id },
    { $set: doc },
    { upsert: true }
  );

  return doc;
}

function parseFyRange(fy) {
  const m = String(fy).match(/^(\d{4})-(\d{2,4})$/);
  if (!m) {
    const y = new Date().getFullYear();
    return [`${y}-04`, `${y + 1}-03`];
  }
  const y1 = Number(m[1]);
  const y2 = Number(m[2].length === 2 ? `20${m[2]}` : m[2]);
  return [`${y1}-04`, `${y2}-03`];
}

async function openingUnpaidInvoices(db, projectId, fyStart) {
  const rows = await db
    .collection(DM_COLLECTIONS.invoices)
    .find({
      projectId,
      periodMonth: { $lt: fyStart },
      status: { $in: ['SENT', 'ACCRUED', 'PART_PAID'] }
    })
    .toArray();
  return rows.reduce((s, inv) => s + Math.max(0, num(inv.totalAmount) - num(inv.paidAmount)), 0);
}

export async function lockAnnualReconciliation(db, reconId, user) {
  const recon = await db.collection(DM_COLLECTIONS.annualReconciliations).findOne({ _id: reconId });
  if (!recon) throw new Error('Reconciliation not found');
  if (recon.locked) throw new Error('Already locked');

  await db.collection(DM_COLLECTIONS.annualReconciliations).updateOne(
    { _id: reconId },
    {
      $set: {
        locked: true,
        status: 'locked',
        lockedAt: new Date(),
        lockedBy: user?.email,
        updatedAt: new Date()
      }
    }
  );

  return { ok: true, reconId };
}

/**
 * Ensure compliance checklist exists for SPV.
 * @param {import('mongodb').Db} db
 * @param {string} spvId
 */
export async function ensureComplianceChecklist(db, spvId, projectId = null) {
  const now = new Date();
  const docs = db.collection(DM_COLLECTIONS.complianceDocuments);

  for (const t of COMPLIANCE_DOC_TYPES) {
    const id = `doc_${spvId}_${t.id}`;
    await docs.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          _id: id,
          spvId,
          projectId,
          documentType: t.id,
          documentName: t.name,
          required: t.required,
          status: 'not_started',
          owner: null,
          dueDate: null,
          fileUrl: null,
          version: 1,
          remarks: '',
          createdAt: now,
          updatedAt: now
        }
      },
      { upsert: true }
    );
  }
}

export async function computeSpvReadinessScore(db, spvId) {
  const docs = await db
    .collection(DM_COLLECTIONS.complianceDocuments)
    .find({ spvId })
    .toArray();

  if (!docs.length) return { score: 0, total: 0, signed: 0, missing: COMPLIANCE_DOC_TYPES.length };

  const required = docs.filter((d) => d.required);
  const signed = required.filter((d) => d.status === 'signed').length;
  const score = required.length ? Math.round((signed / required.length) * 100) : 0;

  return {
    score,
    total: docs.length,
    required: required.length,
    signed,
    missing: required.filter((d) => d.status !== 'signed').length,
    expired: docs.filter((d) => d.status === 'expired').length
  };
}
