import { Router } from 'express';
import { withDb } from '../lib/mongo.js';
import { DM_COLLECTIONS } from '../lib/dmGovernance/collections.js';
import { writeDmAudit } from '../lib/dmGovernance/audit.js';
import {
  projectInScope,
  requireDmWrite,
  requireDmApprove,
  userHasDmPermission,
  DM_PERMISSIONS
} from '../lib/dmGovernance/access.js';
import { calculateMonthlyDmFee } from '../lib/dmGovernance/calculationEngine.js';
import {
  createInvoiceFromCalculation,
  transitionInvoice,
  recordPayment
} from '../lib/dmGovernance/invoiceService.js';
import { syncCostAllocationFromV2 } from '../lib/dmGovernance/integrations/resourceV2.js';

export const dmGovernanceBillingRouter = Router();

function userFromReq(req) {
  return req.authUser || null;
}

function deny(res, msg = 'Forbidden') {
  return res.status(403).json({ error: msg });
}

function periodMonthOrNow(q) {
  const m = String(q || '').trim();
  if (/^\d{4}-\d{2}$/.test(m)) return m;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ——— Calculation ———
dmGovernanceBillingRouter.post(
  '/projects/:id/calculate',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: req.params.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!projectInScope(user, project)) return deny(res);

    const periodMonth = periodMonthOrNow(req.query.month || req.body?.periodMonth);
    const preRev = await db.collection(DM_COLLECTIONS.preRevenueBilling).findOne({
      projectId: req.params.id,
      periodMonth
    });

    const calc = await calculateMonthlyDmFee(db, req.params.id, periodMonth, {
      reimbursements: preRev?.directExpenses || req.body?.reimbursements || 0
    });

    const calcId = `calc_${req.params.id}_${periodMonth}_preview`;
    await db.collection(DM_COLLECTIONS.feeCalculations).updateOne(
      { _id: calcId },
      {
        $set: {
          ...calc,
          _id: calcId,
          projectId: req.params.id,
          periodMonth,
          status: 'draft',
          updatedAt: new Date(),
          updatedBy: user?.email
        }
      },
      { upsert: true }
    );

    res.json({ calculation: { ...calc, _id: calcId } });
  })
);

dmGovernanceBillingRouter.get(
  '/projects/:id/calculations',
  withDb(async (req, res, db) => {
    const rows = await db
      .collection(DM_COLLECTIONS.feeCalculations)
      .find({ projectId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(24)
      .toArray();
    res.json({ calculations: rows });
  })
);

// ——— Pre-revenue billing workspace ———
dmGovernanceBillingRouter.get(
  '/projects/:id/pre-revenue/:month',
  withDb(async (req, res, db) => {
    const doc = await db.collection(DM_COLLECTIONS.preRevenueBilling).findOne({
      projectId: req.params.id,
      periodMonth: req.params.month
    });
    const calc = await db.collection(DM_COLLECTIONS.feeCalculations).findOne({
      projectId: req.params.id,
      periodMonth: req.params.month
    });
    res.json({ preRevenue: doc, latestCalculation: calc });
  })
);

dmGovernanceBillingRouter.put(
  '/projects/:id/pre-revenue/:month',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const body = req.body || {};
    const docId = `pr_${req.params.id}_${req.params.month}`;
    const doc = {
      _id: docId,
      projectId: req.params.id,
      periodMonth: req.params.month,
      revenueStatus: body.revenueStatus || 'pre_revenue',
      directExpenses: Number(body.directExpenses || 0),
      businessRationale: body.businessRationale || '',
      approvalStatus: body.approvalStatus || 'draft',
      remarks: body.remarks || '',
      updatedAt: new Date(),
      updatedBy: user?.email
    };
    await db.collection(DM_COLLECTIONS.preRevenueBilling).updateOne({ _id: docId }, { $set: doc }, { upsert: true });
    res.json({ preRevenue: doc });
  })
);

// ——— Cost allocation ———
dmGovernanceBillingRouter.get(
  '/projects/:id/cost-allocation/:month',
  withDb(async (req, res, db) => {
    const doc = await db.collection(DM_COLLECTIONS.costAllocations).findOne({
      projectId: req.params.id,
      periodMonth: req.params.month
    });
    res.json({ allocation: doc });
  })
);

dmGovernanceBillingRouter.post(
  '/projects/:id/cost-allocation/:month/sync-v2',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const result = await syncCostAllocationFromV2(db, req.params.id, req.params.month, user?.email);
    if (result.ok) {
      await db.collection(DM_COLLECTIONS.integrationSyncLogs).insertOne({
        source: 'resource-v2',
        projectId: req.params.id,
        at: new Date(),
        status: 'ok',
        result: { totalAllocatedCost: result.allocation?.totalAllocatedCost },
        userEmail: user?.email
      });
    }
    res.json(result);
  })
);

// ——— Invoices ———
dmGovernanceBillingRouter.get(
  '/invoices',
  withDb(async (req, res, db) => {
    const q = {};
    if (req.query.projectId) q.projectId = String(req.query.projectId);
    if (req.query.status) q.status = String(req.query.status);
    const list = await db
      .collection(DM_COLLECTIONS.invoices)
      .find(q)
      .sort({ periodMonth: -1 })
      .limit(100)
      .toArray();
    res.json({ invoices: list });
  })
);

dmGovernanceBillingRouter.get(
  '/invoices/:id',
  withDb(async (req, res, db) => {
    const invoice = await db.collection(DM_COLLECTIONS.invoices).findOne({ _id: req.params.id });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    const calculation = invoice.calculationId
      ? await db.collection(DM_COLLECTIONS.feeCalculations).findOne({ _id: invoice.calculationId })
      : null;
    const payments = await db.collection(DM_COLLECTIONS.payments).find({ invoiceId: req.params.id }).toArray();
    res.json({ invoice, calculation, payments });
  })
);

dmGovernanceBillingRouter.post(
  '/projects/:id/invoices/generate',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const periodMonth = periodMonthOrNow(req.body?.periodMonth);
    const preRev = await db.collection(DM_COLLECTIONS.preRevenueBilling).findOne({
      projectId: req.params.id,
      periodMonth
    });

    const calc = await calculateMonthlyDmFee(db, req.params.id, periodMonth, {
      reimbursements: preRev?.directExpenses || 0
    });

    const result = await createInvoiceFromCalculation(db, {
      projectId: req.params.id,
      periodMonth,
      user,
      calculation: calc,
      overrides: {
        businessRationale: preRev?.businessRationale,
        remarks: req.body?.remarks,
        replaceExisting: !!req.body?.replaceExisting
      }
    });

    res.status(201).json(result);
  })
);

dmGovernanceBillingRouter.post(
  '/invoices/:id/transition',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    const action = String(req.body?.action || '');
    const comment = String(req.body?.comment || '');

    if (action === 'approve_leadership' && !requireDmApprove(user)) {
      return deny(res, 'Leadership approval permission required (dm_approve)');
    }
    if (!requireDmWrite(user) && action !== 'approve_leadership') {
      return deny(res, 'Finance permission required (dm_finance)');
    }
    if (action === 'approve_leadership' && !requireDmWrite(user) && !requireDmApprove(user)) {
      return deny(res, 'Forbidden');
    }

    try {
      const result = await transitionInvoice(db, req.params.id, action, user, comment);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  })
);

dmGovernanceBillingRouter.post(
  '/invoices/:id/payments',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    try {
      const result = await recordPayment(db, req.params.id, req.body?.amount, user, req.body?.remarks);
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  })
);

// ——— Approval inbox ———
dmGovernanceBillingRouter.get(
  '/approvals/inbox',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    const canFinance = requireDmWrite(user);
    const canLead = requireDmApprove(user);

    const or = [];
    if (canFinance) or.push({ status: 'FINANCE_REVIEW' }, { status: 'LEADERSHIP_APPROVED' });
    if (canLead) or.push({ status: 'PROJECT_REVIEW' });

    if (!or.length) return res.json({ items: [] });

    const items = await db
      .collection(DM_COLLECTIONS.invoices)
      .find({ $or: or })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray();

    res.json({ items });
  })
);
