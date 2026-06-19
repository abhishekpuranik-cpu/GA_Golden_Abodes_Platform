import { Router } from 'express';
import { withDb } from '../lib/mongo.js';
import { DM_COLLECTIONS, ensureDmIndexes } from '../lib/dmGovernance/collections.js';
import { writeDmAudit } from '../lib/dmGovernance/audit.js';
import {
  buildProjectFilter,
  projectInScope,
  requireDmWrite,
  requireDmApprove,
  userCanDmTab,
  userDmTabs,
  userHasDmPermission,
  DM_PERMISSIONS,
  DM_TABS
} from '../lib/dmGovernance/access.js';
import { ensureDmPilotSeed } from '../lib/dmGovernance/seed.js';
import { ensureComplianceChecklist } from '../lib/dmGovernance/reconciliationService.js';
import { buildDashboardConsolidated } from '../lib/dmGovernance/dashboard.js';
import { buildControlTower } from '../lib/dmGovernance/controlTower.js';
import { buildPortfolioKpis } from '../lib/businessHealth/portfolioRollup.js';
import { upsertMonthlySnapshot, loadTrendSeries, extractTrendPoints } from '../lib/businessHealth/snapshots.js';
import { rollupProjectPillars, buildSyncFreshness } from '../lib/dmGovernance/pillars.js';
import { syncProjectsFromRegistry } from '../lib/dmGovernance/integrations/projectSync.js';
import { syncProjectFromCashflow, pushDmScheduleToCashflow } from '../lib/dmGovernance/integrations/cashflowV1.js';
import { BILLING_MODEL_TYPES, DEFAULT_BILLING_SLABS, ELIGIBLE_BASE_TYPES, REVENUE_STATUSES } from '../lib/dmGovernance/constants.js';
import { dmGovernanceBillingRouter } from './dmGovernanceBilling.js';
import { dmGovernancePhase3Router } from './dmGovernancePhase3.js';
import { dmGovernancePhase4Router } from './dmGovernancePhase4.js';

export const dmGovernanceRouter = Router();

let bootstrapped = false;

async function bootstrapDm(db) {
  if (bootstrapped) return;
  await ensureDmIndexes(db);
  const seed = await ensureDmPilotSeed(db);
  const needsCompliance =
    seed.seeded ||
    seed.reason === 'project_exists' ||
    seed.reason === 'spv_exists' ||
    seed.reason === 'already_seeded';
  if (needsCompliance) {
    await ensureComplianceChecklist(db, 'SPV_GOLDEN_HQ', 'P004');
  }
  bootstrapped = true;
}

function userFromReq(req) {
  return req.authUser || null;
}

function deny(res, msg = 'Forbidden') {
  return res.status(403).json({ error: msg });
}

function slugId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

dmGovernanceRouter.use(dmGovernanceBillingRouter);
dmGovernanceRouter.use(dmGovernancePhase3Router);
dmGovernanceRouter.use(dmGovernancePhase4Router);

dmGovernanceRouter.get(
  '/meta',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    res.json({
      appId: 'dm_spv_governance',
      tabs: userDmTabs(user),
      permissions: {
        canWrite: requireDmWrite(user),
        canApprove: requireDmApprove(user),
        isAdmin: userHasDmPermission(user, DM_PERMISSIONS.ADMIN)
      },
      constants: {
        billingModelTypes: BILLING_MODEL_TYPES,
        revenueStatuses: REVENUE_STATUSES,
        eligibleBaseTypes: ELIGIBLE_BASE_TYPES,
        defaultSlabs: DEFAULT_BILLING_SLABS
      }
    });
  })
);

dmGovernanceRouter.get(
  '/dashboard/consolidated',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    if (!userCanDmTab(user, DM_TABS.DASHBOARD) && !userCanDmTab(user, DM_TABS.BUSINESS_HEALTH) && !userCanDmTab(user, DM_TABS.CONSOLIDATED)) {
      return deny(res, 'Dashboard access denied');
    }
    const [data, controlTower] = await Promise.all([
      buildDashboardConsolidated(db, user),
      buildControlTower(db, user)
    ]);
    const trendPoints = extractTrendPoints(data, controlTower);
    await upsertMonthlySnapshot(db, {
      portfolio: trendPoints,
      pillars: controlTower?.health?.pillars || {},
      projects: {},
      trends: trendPoints
    });
    const [collectionsTrend, recoveryTrend, healthTrend] = await Promise.all([
      loadTrendSeries(db, 'collections_rate', 12),
      loadTrendSeries(db, 'dm_recovery_pct', 12),
      loadTrendSeries(db, 'portfolio_health_score', 12)
    ]);
    res.json({
      ...data,
      controlTower,
      businessHealth: {
        kpis: buildPortfolioKpis(data, controlTower),
        trends: {
          collections_rate: collectionsTrend,
          dm_recovery_pct: recoveryTrend,
          portfolio_health_score: healthTrend
        }
      }
    });
  })
);

dmGovernanceRouter.post(
  '/dashboard/proactive-scan',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);
    if (!userCanDmTab(user, DM_TABS.DASHBOARD)) return deny(res);
    const [data, controlTower] = await Promise.all([
      buildDashboardConsolidated(db, user),
      buildControlTower(db, user, { runRiskScan: true })
    ]);
    const trendPoints = extractTrendPoints(data, controlTower);
    await upsertMonthlySnapshot(db, {
      portfolio: trendPoints,
      pillars: controlTower?.health?.pillars || {},
      projects: {},
      trends: trendPoints
    });
    const [collectionsTrend, recoveryTrend, healthTrend] = await Promise.all([
      loadTrendSeries(db, 'collections_rate', 12),
      loadTrendSeries(db, 'dm_recovery_pct', 12),
      loadTrendSeries(db, 'portfolio_health_score', 12)
    ]);
    res.json({
      ...data,
      controlTower,
      businessHealth: {
        kpis: buildPortfolioKpis(data, controlTower),
        trends: {
          collections_rate: collectionsTrend,
          dm_recovery_pct: recoveryTrend,
          portfolio_health_score: healthTrend
        }
      }
    });
  })
);

// ——— SPVs ———
dmGovernanceRouter.get(
  '/spvs',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const list = await db.collection(DM_COLLECTIONS.spvs).find({}).sort({ spvName: 1 }).toArray();
    res.json({ spvs: list });
  })
);

dmGovernanceRouter.get(
  '/spvs/:id',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const doc = await db.collection(DM_COLLECTIONS.spvs).findOne({ _id: req.params.id });
    if (!doc) return res.status(404).json({ error: 'SPV not found' });
    const projects = await db
      .collection(DM_COLLECTIONS.projects)
      .find({ spvIds: req.params.id })
      .toArray();
    res.json({ spv: doc, projects });
  })
);

dmGovernanceRouter.post(
  '/spvs',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const body = req.body || {};
    const spvCode = String(body.spvCode || '').trim();
    const spvName = String(body.spvName || '').trim();
    if (!spvCode || !spvName) return res.status(400).json({ error: 'spvCode and spvName required' });

    const now = new Date();
    const doc = {
      _id: body._id || slugId('spv'),
      spvCode,
      spvName,
      legalEntityName: String(body.legalEntityName || spvName).trim(),
      pan: body.pan || '',
      gstin: body.gstin || '',
      registeredAddress: body.registeredAddress || '',
      projectIds: body.projectIds || [],
      ownershipDetails: body.ownershipDetails || '',
      directors: body.directors || [],
      bankAccounts: body.bankAccounts || [],
      reraRegistration: body.reraRegistration || '',
      statutoryStatus: body.statutoryStatus || 'active',
      gstStatus: body.gstStatus || '',
      relatedPartyFlag: body.relatedPartyFlag !== false,
      agreementStatus: body.agreementStatus || 'not_started',
      dmaSignedDate: body.dmaSignedDate || null,
      ssaSignedDate: body.ssaSignedDate || null,
      billingStartDate: body.billingStartDate || null,
      billingStatus: body.billingStatus || 'active',
      notes: body.notes || '',
      createdAt: now,
      updatedAt: now,
      createdBy: user?.email || 'unknown'
    };

    await db.collection(DM_COLLECTIONS.spvs).insertOne(doc);
    await writeDmAudit(db, {
      entityType: 'dm_spv',
      entityId: doc._id,
      action: 'create',
      userId: user?.id,
      userEmail: user?.email,
      after: doc
    });
    res.status(201).json({ spv: doc });
  })
);

dmGovernanceRouter.put(
  '/spvs/:id',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const before = await db.collection(DM_COLLECTIONS.spvs).findOne({ _id: req.params.id });
    if (!before) return res.status(404).json({ error: 'SPV not found' });

    const body = req.body || {};
    const patch = { ...body, updatedAt: new Date(), updatedBy: user?.email };
    delete patch._id;
    delete patch.createdAt;
    delete patch.createdBy;

    await db.collection(DM_COLLECTIONS.spvs).updateOne({ _id: req.params.id }, { $set: patch });
    const after = await db.collection(DM_COLLECTIONS.spvs).findOne({ _id: req.params.id });
    await writeDmAudit(db, {
      entityType: 'dm_spv',
      entityId: req.params.id,
      action: 'update',
      userId: user?.id,
      userEmail: user?.email,
      before,
      after
    });
    res.json({ spv: after });
  })
);

// ——— Projects ———
dmGovernanceRouter.get(
  '/projects',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    const filter = buildProjectFilter(user);
    const list = await db.collection(DM_COLLECTIONS.projects).find(filter).sort({ name: 1 }).toArray();
    res.json({ projects: list });
  })
);

dmGovernanceRouter.get(
  '/projects/:id',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: req.params.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const user = userFromReq(req);
    if (!projectInScope(user, project)) return deny(res);

    const spvs = project.spvIds?.length
      ? await db
          .collection(DM_COLLECTIONS.spvs)
          .find({ _id: { $in: project.spvIds } })
          .toArray()
      : [];

    let billingConfig = null;
    let slabs = [];
    if (project.activeBillingConfigId) {
      billingConfig = await db
        .collection(DM_COLLECTIONS.billingConfigs)
        .findOne({ _id: project.activeBillingConfigId });
      slabs = await db
        .collection(DM_COLLECTIONS.billingSlabs)
        .find({ configId: project.activeBillingConfigId })
        .sort({ sortOrder: 1 })
        .toArray();
    }

    const eligibleBase =
      project.eligibleBaseType === 'collections_ttd'
        ? project.collectionsTtd || 0
        : project.eligibleBaseType === 'agreement_value'
          ? project.agreementValue || project.toplineGdv || 0
          : project.toplineGdv || 0;
    const dmCap = eligibleBase * (Number(project.dmCapPct || 10) / 100);

    const tower = await buildControlTower(db, user);
    const businessHealth = {
      pillars: rollupProjectPillars(project._id, tower.issues || []),
      healthScore: tower.watchlist?.find((w) => w.projectId === project._id)?.healthScore ?? null,
      syncFreshness: buildSyncFreshness(project)
    };

    res.json({
      project,
      spvs,
      billingConfig,
      slabs,
      executive: {
        dmCap,
        dmFeeBilled: project.dmFeeBilledTtd || 0,
        dmFeePaid: project.dmFeePaidTtd || 0,
        balanceEligible: Math.max(0, dmCap - (project.dmFeeBilledTtd || 0)),
        capUtilPct: dmCap > 0 ? ((project.dmFeeBilledTtd || 0) / dmCap) * 100 : 0
      },
      businessHealth
    });
  })
);

dmGovernanceRouter.put(
  '/projects/:id',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const before = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: req.params.id });
    if (!before) return res.status(404).json({ error: 'Project not found' });
    if (!projectInScope(user, before)) return deny(res);

    const body = req.body || {};
    const patch = { ...body, updatedAt: new Date(), updatedBy: user?.email };
    delete patch._id;
    delete patch.createdAt;
    delete patch.createdBy;

    await db.collection(DM_COLLECTIONS.projects).updateOne({ _id: req.params.id }, { $set: patch });
    const after = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: req.params.id });
    await writeDmAudit(db, {
      entityType: 'dm_project',
      entityId: req.params.id,
      action: 'update',
      userId: user?.id,
      userEmail: user?.email,
      before,
      after
    });
    res.json({ project: after });
  })
);

dmGovernanceRouter.post(
  '/projects/sync-registry',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const result = await syncProjectsFromRegistry(db, {
      userEmail: user?.email,
      skipNew: !!req.body?.skipNew
    });

    await db.collection(DM_COLLECTIONS.integrationSyncLogs).insertOne({
      source: 'ga_rp_projects',
      at: new Date(),
      status: 'ok',
      result,
      userEmail: user?.email
    });

    res.json(result);
  })
);

// ——— Billing config ———
dmGovernanceRouter.get(
  '/projects/:id/billing-config',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: req.params.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const configs = await db
      .collection(DM_COLLECTIONS.billingConfigs)
      .find({ projectId: req.params.id })
      .sort({ version: -1 })
      .toArray();

    let active = null;
    let slabs = [];
    if (project.activeBillingConfigId) {
      active = configs.find((c) => c._id === project.activeBillingConfigId) || null;
      if (active) {
        slabs = await db
          .collection(DM_COLLECTIONS.billingSlabs)
          .find({ configId: active._id })
          .sort({ sortOrder: 1 })
          .toArray();
      }
    }

    res.json({ projectId: req.params.id, active, configs, slabs });
  })
);

dmGovernanceRouter.post(
  '/projects/:id/billing-config',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: req.params.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const body = req.body || {};
    const last = await db
      .collection(DM_COLLECTIONS.billingConfigs)
      .find({ projectId: req.params.id })
      .sort({ version: -1 })
      .limit(1)
      .toArray();
    const version = (last[0]?.version || 0) + 1;
    const now = new Date();
    const configId = body._id || `bc_${req.params.id}_v${version}`;

    const configDoc = {
      _id: configId,
      projectId: req.params.id,
      modelType: body.modelType || 'HYBRID_GA',
      status: 'active',
      version,
      effectiveFrom: body.effectiveFrom || now.toISOString().slice(0, 10),
      retainerMonthly: Number(body.retainerMonthly || 0),
      retainerAdjustsAgainstCap: body.retainerAdjustsAgainstCap !== false,
      minimumAnnualFee: Number(body.minimumAnnualFee || 0),
      markupPct: Number(body.markupPct ?? 10),
      markupCapPct: Number(body.markupCapPct ?? 12),
      gstRate: Number(body.gstRate ?? 18),
      dmCapPct: Number(body.dmCapPct ?? project.dmCapPct ?? 10),
      eligibleBaseType: body.eligibleBaseType || project.eligibleBaseType || 'topline_gdv',
      capAdjustmentMode: body.capAdjustmentMode || 'pool_all_components',
      passThroughOutsideCap: body.passThroughOutsideCap !== false,
      paymentDueDays: Number(body.paymentDueDays || 15),
      invoiceFrequency: body.invoiceFrequency || 'monthly',
      dmSyncToCashflow: body.dmSyncToCashflow !== false,
      phaseConfig: body.phaseConfig || null,
      approvedBy: user?.email || null,
      approvedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: user?.email
    };

    await db.collection(DM_COLLECTIONS.billingConfigs).insertOne(configDoc);

    const slabsInput = Array.isArray(body.slabs) && body.slabs.length ? body.slabs : DEFAULT_BILLING_SLABS;
    const slabDocs = slabsInput.map((s, i) => ({
      _id: `${configId}_slab_${i}`,
      configId,
      triggerType: s.triggerType || 'collection',
      fromPct: Number(s.fromPct ?? 0),
      toPct: Number(s.toPct ?? 100),
      cumulativeDmPct: Number(s.cumulativeDmPct ?? 0),
      label: s.label || '',
      sortOrder: i,
      createdAt: now
    }));
    if (slabDocs.length) {
      await db.collection(DM_COLLECTIONS.billingSlabs).deleteMany({ configId });
      await db.collection(DM_COLLECTIONS.billingSlabs).insertMany(slabDocs);
    }

    await db.collection(DM_COLLECTIONS.projects).updateOne(
      { _id: req.params.id },
      {
        $set: {
          activeBillingConfigId: configId,
          billingModelType: configDoc.modelType,
          dmCapPct: configDoc.dmCapPct,
          eligibleBaseType: configDoc.eligibleBaseType,
          updatedAt: now
        }
      }
    );

    await writeDmAudit(db, {
      entityType: 'dm_billing_config',
      entityId: configId,
      action: 'create',
      userId: user?.id,
      userEmail: user?.email,
      after: configDoc
    });

    res.status(201).json({ config: configDoc, slabs: slabDocs });
  })
);

// ——— Integrations ———
dmGovernanceRouter.post(
  '/integrations/sync/cashflow-v1/:projectId',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const result = await syncProjectFromCashflow(db, req.params.projectId);
    await db.collection(DM_COLLECTIONS.integrationSyncLogs).insertOne({
      source: 'cashflow-v1',
      projectId: req.params.projectId,
      at: new Date(),
      status: result.ok ? 'ok' : 'error',
      result,
      userEmail: user?.email
    });
    res.json(result);
  })
);

dmGovernanceRouter.post(
  '/integrations/push/cashflow-v1/:projectId',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const user = userFromReq(req);
    if (!requireDmWrite(user)) return deny(res);

    const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: req.params.projectId });
    if (!project?.dmSyncEnabled) {
      return res.status(400).json({ error: 'DM sync to Cashflow not enabled for this project' });
    }

    const schedule = req.body || {
      schedule: [],
      accrued: project.dmFeeAccrued || 0,
      paidTtd: project.dmFeePaidTtd || 0,
      billedTtd: project.dmFeeBilledTtd || 0,
      gaMonthlyReplacement: []
    };

    const result = await pushDmScheduleToCashflow(db, req.params.projectId, schedule);
    await db.collection(DM_COLLECTIONS.integrationSyncLogs).insertOne({
      source: 'cashflow-v1-push',
      projectId: req.params.projectId,
      at: new Date(),
      status: result.ok ? 'ok' : 'error',
      result,
      userEmail: user?.email
    });
    res.json(result);
  })
);

dmGovernanceRouter.get(
  '/integrations/status',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const logs = await db
      .collection(DM_COLLECTIONS.integrationSyncLogs)
      .find({})
      .sort({ at: -1 })
      .limit(20)
      .toArray();
    res.json({ logs });
  })
);

// ——— Audit ———
dmGovernanceRouter.get(
  '/audit',
  withDb(async (req, res, db) => {
    await bootstrapDm(db);
    const q = {};
    if (req.query.entityType) q.entityType = String(req.query.entityType);
    if (req.query.entityId) q.entityId = String(req.query.entityId);
    const logs = await db
      .collection(DM_COLLECTIONS.auditLogs)
      .find(q)
      .sort({ at: -1 })
      .limit(Number(req.query.limit) || 50)
      .toArray();
    res.json({ logs });
  })
);
