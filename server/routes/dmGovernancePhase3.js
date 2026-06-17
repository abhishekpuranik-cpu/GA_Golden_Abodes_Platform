import { Router } from 'express';
import { withDb } from '../lib/mongo.js';
import { DM_COLLECTIONS } from '../lib/dmGovernance/collections.js';
import { writeDmAudit } from '../lib/dmGovernance/audit.js';
import {
  projectInScope,
  requireDmWrite,
  requireDmApprove
} from '../lib/dmGovernance/access.js';
import {
  buildAnnualReconciliation,
  lockAnnualReconciliation,
  ensureComplianceChecklist,
  computeSpvReadinessScore
} from '../lib/dmGovernance/reconciliationService.js';
import { importExpensesFromCashflow } from '../lib/dmGovernance/integrations/expenseImport.js';
import { scanProjectRisks } from '../lib/dmGovernance/riskEngine.js';
import { runFullProjectSync } from '../lib/dmGovernance/syncOrchestrator.js';
import { COMPLIANCE_DOC_TYPES, EXPENSE_CATEGORIES } from '../lib/dmGovernance/governanceConstants.js';
import { sumProjectBillingTotals } from '../lib/dmGovernance/calculationEngine.js';

export const dmGovernancePhase3Router = Router();

function userFromReq(req) {
  return req.authUser || null;
}

function deny(res, msg = 'Forbidden') {
  return res.status(403).json({ error: msg });
}

function currentFy() {
  const d = new Date();
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

// ——— Full sync ———
dmGovernancePhase3Router.post(
  '/projects/:id/sync-all',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const result = await runFullProjectSync(db, req.params.id, user);
    res.json(result);
  })
);

// ——— Expenses ———
dmGovernancePhase3Router.get(
  '/expenses',
  withDb(async (req, res, db) => {
    const q = {};
    if (req.query.projectId) q.projectId = String(req.query.projectId);
    if (req.query.billable === 'true') q.billableToSpv = true;
    const list = await db
      .collection(DM_COLLECTIONS.expenses)
      .find(q)
      .sort({ date: -1 })
      .limit(200)
      .toArray();
    res.json({ expenses: list, categories: EXPENSE_CATEGORIES });
  })
);

dmGovernancePhase3Router.post(
  '/expenses',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const body = req.body || {};
    const id = body._id || `exp_${Date.now().toString(36)}`;
    const now = new Date();
    const doc = {
      _id: id,
      projectId: body.projectId,
      spvId: body.spvId || null,
      source: 'manual',
      date: body.date || now.toISOString().slice(0, 10),
      vendor: body.vendor || '',
      expenseCategory: body.expenseCategory || 'direct_project',
      amount: Number(body.amount || 0),
      gst: Number(body.gst || 0),
      billableToSpv: body.billableToSpv !== false,
      insideDmCap: body.insideDmCap !== false,
      markupApplicable: !!body.markupApplicable,
      markupPct: Number(body.markupPct || 0),
      paidBy: body.paidBy || 'GA',
      approvalStatus: 'draft',
      paymentStatus: body.paymentStatus || 'unpaid',
      remarks: body.remarks || '',
      createdAt: now,
      updatedAt: now,
      createdBy: user?.email
    };
    await db.collection(DM_COLLECTIONS.expenses).insertOne(doc);
    res.status(201).json({ expense: doc });
  })
);

dmGovernancePhase3Router.put(
  '/expenses/:id',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const patch = { ...req.body, updatedAt: new Date(), updatedBy: user?.email };
    delete patch._id;
    await db.collection(DM_COLLECTIONS.expenses).updateOne({ _id: req.params.id }, { $set: patch });
    const doc = await db.collection(DM_COLLECTIONS.expenses).findOne({ _id: req.params.id });
    res.json({ expense: doc });
  })
);

dmGovernancePhase3Router.post(
  '/projects/:id/expenses/import-cashflow',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const result = await importExpensesFromCashflow(db, req.params.id, req.body || {});
    res.json(result);
  })
);

// ——— Annual reconciliation ———
dmGovernancePhase3Router.get(
  '/projects/:id/reconciliation/:fy',
  withDb(async (req, res, db) => {
    const doc = await db.collection(DM_COLLECTIONS.annualReconciliations).findOne({
      _id: `recon_${req.params.id}_${req.params.fy}`
    });
    if (!doc) {
      return res.json({ reconciliation: null, financialYear: req.params.fy });
    }
    res.json({ reconciliation: doc });
  })
);

dmGovernancePhase3Router.post(
  '/projects/:id/reconciliation/:fy/build',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const doc = await buildAnnualReconciliation(db, req.params.id, req.params.fy);
    await writeDmAudit(db, {
      entityType: 'dm_reconciliation',
      entityId: doc._id,
      action: 'build',
      userEmail: user?.email,
      after: { maxDmFeeEntitlement: doc.maxDmFeeEntitlement, totalGaBilling: doc.totalGaBilling }
    });
    res.json({ reconciliation: doc });
  })
);

dmGovernancePhase3Router.post(
  '/projects/:id/reconciliation/:fy/lock',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmApprove(user)) return deny(res, 'Leadership approval required to lock');
    const reconId = `recon_${req.params.id}_${req.params.fy}`;
    const result = await lockAnnualReconciliation(db, reconId, user);
    res.json(result);
  })
);

dmGovernancePhase3Router.get(
  '/reconciliations',
  withDb(async (req, res, db) => {
    const list = await db
      .collection(DM_COLLECTIONS.annualReconciliations)
      .find({})
      .sort({ financialYear: -1 })
      .limit(50)
      .toArray();
    res.json({ reconciliations: list, defaultFy: currentFy() });
  })
);

// ——— Compliance ———
dmGovernancePhase3Router.get(
  '/compliance/spv/:spvId',
  withDb(async (req, res, db) => {
    await ensureComplianceChecklist(db, req.params.spvId);
    const docs = await db
      .collection(DM_COLLECTIONS.complianceDocuments)
      .find({ spvId: req.params.spvId })
      .sort({ documentName: 1 })
      .toArray();
    const readiness = await computeSpvReadinessScore(db, req.params.spvId);
    res.json({ documents: docs, readiness, templates: COMPLIANCE_DOC_TYPES });
  })
);

dmGovernancePhase3Router.put(
  '/compliance/:docId',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const patch = { ...req.body, updatedAt: new Date(), updatedBy: user?.email };
    delete patch._id;
    await db.collection(DM_COLLECTIONS.complianceDocuments).updateOne({ _id: req.params.docId }, { $set: patch });
    const doc = await db.collection(DM_COLLECTIONS.complianceDocuments).findOne({ _id: req.params.docId });
    if (doc?.spvId) {
      const readiness = await computeSpvReadinessScore(db, doc.spvId);
      return res.json({ document: doc, readiness });
    }
    res.json({ document: doc });
  })
);

// ——— Risks ———
dmGovernancePhase3Router.get(
  '/risks',
  withDb(async (req, res, db) => {
    const q = { status: 'open' };
    if (req.query.projectId) q.projectId = String(req.query.projectId);
    const list = await db
      .collection(DM_COLLECTIONS.riskExceptions)
      .find(q)
      .sort({ severity: -1, updatedAt: -1 })
      .limit(100)
      .toArray();
    res.json({ risks: list });
  })
);

dmGovernancePhase3Router.post(
  '/risks/scan',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    const projectId = req.body?.projectId;
    if (projectId) {
      const result = await scanProjectRisks(db, projectId);
      return res.json(result);
    }
    const projects = await db.collection(DM_COLLECTIONS.projects).find({}).toArray();
    let total = 0;
    for (const p of projects) {
      const r = await scanProjectRisks(db, p._id);
      total += r.count || 0;
    }
    res.json({ scanned: projects.length, totalRisks: total });
  })
);

dmGovernancePhase3Router.put(
  '/risks/:id',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    await db.collection(DM_COLLECTIONS.riskExceptions).updateOne(
      { _id: req.params.id },
      { $set: { ...req.body, updatedAt: new Date(), resolvedBy: user?.email } }
    );
    const doc = await db.collection(DM_COLLECTIONS.riskExceptions).findOne({ _id: req.params.id });
    res.json({ risk: doc });
  })
);

// ——— Billing triggers ———
dmGovernancePhase3Router.get(
  '/billing-triggers',
  withDb(async (req, res, db) => {
    const q = { status: 'pending' };
    if (req.query.projectId) q.projectId = String(req.query.projectId);
    const list = await db
      .collection(DM_COLLECTIONS.billingTriggers)
      .find(q)
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json({ triggers: list });
  })
);

dmGovernancePhase3Router.put(
  '/billing-triggers/:id',
  withDb(async (req, res, db) => {
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    await db.collection(DM_COLLECTIONS.billingTriggers).updateOne(
      { _id: req.params.id },
      { $set: { status: req.body?.status || 'acknowledged', updatedAt: new Date(), updatedBy: user?.email } }
    );
    res.json({ ok: true });
  })
);

// ——— Reports ———
dmGovernancePhase3Router.get(
  '/reports/:reportId',
  withDb(async (req, res, db) => {
    const reportId = req.params.reportId;
    const projects = await db.collection(DM_COLLECTIONS.projects).find({}).toArray();

    if (reportId === 'dm-fee-summary') {
      const rows = await Promise.all(
        projects.map(async (p) => {
          const t = await sumProjectBillingTotals(db, p._id);
          return {
            projectId: p._id,
            name: p.name,
            topline: p.toplineGdv,
            collections: p.collectionsTtd,
            billed: t.dmFeeBilledTtd,
            paid: t.dmFeePaidTtd,
            accrued: t.dmFeeAccrued
          };
        })
      );
      return res.json({ reportId, rows, generatedAt: new Date().toISOString() });
    }

    if (reportId === 'auditor-pack') {
      const invoices = await db.collection(DM_COLLECTIONS.invoices).find({}).sort({ periodMonth: -1 }).limit(200).toArray();
      const recons = await db.collection(DM_COLLECTIONS.annualReconciliations).find({}).toArray();
      const compliance = await db.collection(DM_COLLECTIONS.complianceDocuments).find({}).toArray();
      return res.json({
        reportId,
        invoices,
        reconciliations: recons,
        compliance,
        generatedAt: new Date().toISOString()
      });
    }

    if (reportId === 'gst-billing') {
      const invoices = await db.collection(DM_COLLECTIONS.invoices).find({ status: { $nin: ['REJECTED', 'DRAFT'] } }).toArray();
      const rows = invoices.map((inv) => ({
        invoiceNo: inv.invoiceNo,
        periodMonth: inv.periodMonth,
        taxable: inv.taxableValue,
        gst: inv.gstAmount,
        total: inv.totalAmount
      }));
      return res.json({ reportId, rows });
    }

    return res.status(404).json({ error: 'Unknown report' });
  })
);
