import { DM_COLLECTIONS } from './collections.js';
import { calculateMonthlyDmFee, refreshProjectBillingTotals } from './calculationEngine.js';
import { pushDmScheduleToCashflow } from './integrations/cashflowV1.js';
import { writeDmAudit } from './audit.js';

function num(v) {
  return Number(v) || 0;
}

function nextInvoiceNo(projectCode, periodMonth) {
  const ym = periodMonth.replace('-', '');
  return `GA-DM-${projectCode}-${ym}`;
}

/**
 * @param {import('mongodb').Db} db
 * @param {object} params
 */
export async function createInvoiceFromCalculation(db, params) {
  const { projectId, periodMonth, user, calculation, overrides } = params;
  const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: projectId });
  if (!project) throw new Error('Project not found');

  const spvId = project.spvIds?.[0];
  if (!spvId) throw new Error('Project has no linked SPV');

  const existing = await db.collection(DM_COLLECTIONS.invoices).findOne({
    projectId,
    periodMonth,
    status: { $nin: ['REJECTED'] }
  });
  if (existing && !overrides?.replaceExisting) {
    throw new Error(`Invoice already exists for ${periodMonth}: ${existing.invoiceNo}`);
  }

  const calc = calculation || (await calculateMonthlyDmFee(db, projectId, periodMonth, overrides));
  const out = calc.outputs;
  const now = new Date();
  const invoiceNo = overrides?.invoiceNo || nextInvoiceNo(project.projectCode || projectId, periodMonth);

  const dueDate = new Date(`${periodMonth}-01`);
  dueDate.setMonth(dueDate.getMonth() + 1);
  dueDate.setDate(num(project.paymentDueDays || 15));

  const invoice = {
    _id: `inv_${projectId}_${periodMonth}`,
    invoiceNo,
    invoiceDate: now.toISOString().slice(0, 10),
    gaEntity: 'Golden Abodes',
    spvId,
    projectId,
    periodMonth,
    periodStart: `${periodMonth}-01`,
    periodEnd: `${periodMonth}-28`,
    invoiceType: out.phase === 'PRE_REVENUE' ? 'MONTHLY_RETAINER' : 'HYBRID_DM',
    lineItems: calc.lineItems,
    taxableValue: out.taxableValue,
    insideCapAmount: out.insideCapAmount,
    outsideCapAmount: out.outsideCapAmount,
    gstRate: out.gstRate,
    gstAmount: out.gstAmount,
    totalAmount: out.totalInvoiceAmount,
    paidAmount: 0,
    dueDate: dueDate.toISOString().slice(0, 10),
    status: 'DRAFT',
    capBreach: out.capBreach,
    requiresLeadershipApproval: out.requiresLeadershipApproval,
    calculationId: null,
    approvalTrail: [],
    remarks: overrides?.remarks || '',
    businessRationale:
      overrides?.businessRationale ||
      (out.phase === 'PRE_REVENUE'
        ? 'Active development management before revenue — planning, approvals, coordination, controls.'
        : 'Collection-linked development management fee per agreed slabs.'),
    createdAt: now,
    updatedAt: now,
    createdBy: user?.email || 'system'
  };

  const calcDoc = {
    _id: `calc_${projectId}_${periodMonth}_${Date.now()}`,
    projectId,
    periodMonth,
    inputs: calc.inputs,
    outputs: calc.outputs,
    lineItems: calc.lineItems,
    formulaTrace: calc.formulaTrace,
    invoiceId: invoice._id,
    status: 'linked',
    createdAt: now,
    createdBy: user?.email
  };
  invoice.calculationId = calcDoc._id;

  if (existing && overrides?.replaceExisting) {
    await db.collection(DM_COLLECTIONS.invoices).deleteOne({ _id: existing._id });
  }

  await db.collection(DM_COLLECTIONS.feeCalculations).insertOne(calcDoc);
  await db.collection(DM_COLLECTIONS.invoices).insertOne(invoice);

  await writeDmAudit(db, {
    entityType: 'dm_invoice',
    entityId: invoice._id,
    action: 'create_draft',
    userId: user?.id,
    userEmail: user?.email,
    after: { invoiceNo, totalAmount: invoice.totalAmount }
  });

  return { invoice, calculation: calcDoc };
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} invoiceId
 * @param {string} action
 * @param {object} user
 * @param {string} [comment]
 */
export async function transitionInvoice(db, invoiceId, action, user, comment = '') {
  const invoice = await db.collection(DM_COLLECTIONS.invoices).findOne({ _id: invoiceId });
  if (!invoice) throw new Error('Invoice not found');

  const now = new Date();
  const trail = [...(invoice.approvalTrail || [])];
  const entry = { action, at: now, by: user?.email, comment };

  let newStatus = invoice.status;

  switch (action) {
    case 'submit':
      if (invoice.status !== 'DRAFT') throw new Error('Only DRAFT can be submitted');
      newStatus = 'FINANCE_REVIEW';
      break;
    case 'approve_finance':
      if (invoice.status !== 'FINANCE_REVIEW') throw new Error('Not in finance review');
      newStatus = invoice.requiresLeadershipApproval ? 'PROJECT_REVIEW' : 'LEADERSHIP_APPROVED';
      break;
    case 'approve_leadership':
      if (!['FINANCE_REVIEW', 'PROJECT_REVIEW'].includes(invoice.status)) throw new Error('Cannot approve');
      newStatus = 'LEADERSHIP_APPROVED';
      break;
    case 'reject':
      newStatus = 'REJECTED';
      break;
    case 'send':
      if (invoice.status !== 'LEADERSHIP_APPROVED') throw new Error('Must be leadership approved');
      newStatus = 'SENT';
      break;
    case 'accrue':
      if (invoice.status !== 'SENT') throw new Error('Must be sent first');
      newStatus = 'ACCRUED';
      break;
    default:
      throw new Error(`Unknown action: ${action}`);
  }

  trail.push(entry);
  await db.collection(DM_COLLECTIONS.invoices).updateOne(
    { _id: invoiceId },
    { $set: { status: newStatus, approvalTrail: trail, updatedAt: now } }
  );

  if (['LEADERSHIP_APPROVED', 'SENT', 'ACCRUED'].includes(newStatus)) {
    await refreshProjectBillingTotals(db, invoice.projectId);
  }

  if (newStatus === 'SENT' || newStatus === 'ACCRUED') {
    const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: invoice.projectId });
    if (project?.dmSyncEnabled) {
      const totals = await refreshProjectBillingTotals(db, invoice.projectId);
      await pushDmScheduleToCashflow(db, invoice.projectId, {
        schedule: [{ month: invoice.periodMonth, amount: invoice.totalAmount, gst: invoice.gstAmount, invoiceNo: invoice.invoiceNo }],
        accrued: totals.dmFeeAccrued,
        paidTtd: totals.dmFeePaidTtd,
        billedTtd: totals.dmFeeBilledTtd,
        gaMonthlyReplacement: [{ month: invoice.periodMonth, amount: invoice.insideCapAmount }]
      });
    }
  }

  await writeDmAudit(db, {
    entityType: 'dm_invoice',
    entityId: invoiceId,
    action,
    userId: user?.id,
    userEmail: user?.email,
    meta: { newStatus, comment }
  });

  return { invoice: { ...invoice, status: newStatus, approvalTrail: trail } };
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} invoiceId
 * @param {number} amount
 * @param {object} user
 */
export async function recordPayment(db, invoiceId, amount, user, remarks = '') {
  const invoice = await db.collection(DM_COLLECTIONS.invoices).findOne({ _id: invoiceId });
  if (!invoice) throw new Error('Invoice not found');
  if (!['SENT', 'ACCRUED', 'PART_PAID'].includes(invoice.status)) {
    throw new Error('Invoice not payable');
  }

  const payAmount = num(amount);
  const newPaid = num(invoice.paidAmount) + payAmount;
  const newStatus = newPaid >= num(invoice.totalAmount) ? 'PAID' : 'PART_PAID';
  const now = new Date();

  await db.collection(DM_COLLECTIONS.payments).insertOne({
    _id: `pay_${invoiceId}_${Date.now()}`,
    invoiceId,
    projectId: invoice.projectId,
    spvId: invoice.spvId,
    amount: payAmount,
    paidAt: now,
    remarks,
    createdBy: user?.email
  });

  await db.collection(DM_COLLECTIONS.invoices).updateOne(
    { _id: invoiceId },
    { $set: { paidAmount: newPaid, status: newStatus, updatedAt: now } }
  );

  await refreshProjectBillingTotals(db, invoice.projectId);

  return { paidAmount: newPaid, status: newStatus };
}
