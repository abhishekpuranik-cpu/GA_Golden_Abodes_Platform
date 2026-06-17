import { DM_COLLECTIONS } from './collections.js';
import { DEFAULT_BILLING_SLABS } from './constants.js';
import { writeDmAudit } from './audit.js';

const GOLDEN_HQ_PROJECT_ID = 'P004';
const GOLDEN_HQ_SPV_ID = 'SPV_GOLDEN_HQ';

/**
 * Seed pilot Golden HQ data on first run.
 * @param {import('mongodb').Db} db
 */
export async function ensureDmPilotSeed(db) {
  const settings = db.collection(DM_COLLECTIONS.systemSettings);
  const flag = await settings.findOne({ _id: 'dm_seed_v1' });
  if (flag?.completed) return { seeded: false, reason: 'already_seeded' };

  const projects = db.collection(DM_COLLECTIONS.projects);
  const spvs = db.collection(DM_COLLECTIONS.spvs);
  const existingProject = await projects.findOne({ _id: GOLDEN_HQ_PROJECT_ID });
  const existingSpv = await spvs.findOne({ _id: GOLDEN_HQ_SPV_ID });
  if (existingProject || existingSpv) {
    await settings.updateOne(
      { _id: 'dm_seed_v1' },
      {
        $set: {
          completed: true,
          completedAt: new Date(),
          note: existingProject ? 'project_exists' : 'spv_exists'
        }
      },
      { upsert: true }
    );
    return { seeded: false, reason: existingProject ? 'project_exists' : 'spv_exists' };
  }

  const now = new Date();
  const spvDoc = {
    _id: GOLDEN_HQ_SPV_ID,
    spvCode: 'SPV-GHQ-001',
    spvName: 'Golden HQ Project SPV',
    legalEntityName: 'Golden HQ Project Private Limited',
    pan: '',
    gstin: '',
    registeredAddress: 'Pune, Maharashtra',
    projectIds: [GOLDEN_HQ_PROJECT_ID],
    ownershipDetails: 'Golden Abodes — Development Management',
    directors: [],
    bankAccounts: [],
    reraRegistration: '',
    statutoryStatus: 'active',
    gstStatus: 'registered',
    relatedPartyFlag: true,
    agreementStatus: 'draft',
    dmaSignedDate: null,
    ssaSignedDate: null,
    billingStartDate: '2024-01-01',
    billingStatus: 'active',
    notes: 'Pilot SPV for Golden HQ (P004) — GA Development Management billing control tower.',
    createdAt: now,
    updatedAt: now,
    createdBy: 'system_seed'
  };

  const projectDoc = {
    _id: GOLDEN_HQ_PROJECT_ID,
    projectCode: GOLDEN_HQ_PROJECT_ID,
    name: 'Golden HQ',
    spvIds: [GOLDEN_HQ_SPV_ID],
    location: 'Pune',
    assetClass: 'commercial',
    toplineGdv: 1_800_000_000,
    agreementValue: null,
    eligibleBaseType: 'topline_gdv',
    dmCapPct: 10,
    saleableAreaSqf: 180_000,
    unitCount: 280,
    launchDate: null,
    reraDate: null,
    constructionStartDate: '2024-01',
    expectedCompletionDate: '2027-06',
    projectPhase: 'planning',
    constructionProgressPct: 0,
    currentSalesValue: 0,
    collectionsTtd: 0,
    collectionsMtd: 0,
    projectCostBudget: null,
    projectCostIncurred: 0,
    revenueStatus: 'pre_revenue',
    billingModelType: 'HYBRID_GA',
    activeBillingConfigId: null,
    dmSyncEnabled: true,
    integrationSnapshot: {
      source: 'seed',
      syncedAt: now.toISOString()
    },
    riskStatus: 'amber',
    notes: 'Pilot project — Golden HQ commercial development, Pune.',
    createdAt: now,
    updatedAt: now,
    createdBy: 'system_seed'
  };

  const configId = `bc_${GOLDEN_HQ_PROJECT_ID}_v1`;
  const configDoc = {
    _id: configId,
    projectId: GOLDEN_HQ_PROJECT_ID,
    modelType: 'HYBRID_GA',
    status: 'active',
    version: 1,
    effectiveFrom: '2024-01-01',
    retainerMonthly: 800_000,
    retainerAdjustsAgainstCap: true,
    minimumAnnualFee: 9_600_000,
    markupPct: 10,
    markupCapPct: 12,
    gstRate: 18,
    dmCapPct: 10,
    eligibleBaseType: 'topline_gdv',
    capAdjustmentMode: 'pool_all_components',
    passThroughOutsideCap: true,
    paymentDueDays: 15,
    invoiceFrequency: 'monthly',
    dmSyncToCashflow: true,
    phaseConfig: {
      phase1: { label: 'Pre-Revenue', components: ['retainer', 'cost_plus', 'pass_through'] },
      phase2: { label: 'Early Collections', components: ['retainer_min', 'collection_linked'] },
      phase3: { label: 'Growth', components: ['collection_slabs'] },
      phase4: { label: 'Completion', components: ['final_reconciliation'] }
    },
    approvedBy: null,
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: 'system_seed'
  };

  const slabDocs = DEFAULT_BILLING_SLABS.map((s, i) => ({
    _id: `${configId}_slab_${i}`,
    configId,
    triggerType: 'collection',
    fromPct: s.fromPct,
    toPct: s.toPct,
    cumulativeDmPct: s.cumulativeDmPct,
    label: s.label,
    sortOrder: i,
    createdAt: now
  }));

  await db.collection(DM_COLLECTIONS.spvs).insertOne(spvDoc);
  await db.collection(DM_COLLECTIONS.projects).insertOne(projectDoc);
  await db.collection(DM_COLLECTIONS.billingConfigs).insertOne(configDoc);
  if (slabDocs.length) {
    await db.collection(DM_COLLECTIONS.billingSlabs).insertMany(slabDocs);
  }

  await projects.updateOne(
    { _id: GOLDEN_HQ_PROJECT_ID },
    { $set: { activeBillingConfigId: configId, updatedAt: now } }
  );

  await writeDmAudit(db, {
    entityType: 'dm_seed',
    entityId: GOLDEN_HQ_PROJECT_ID,
    action: 'pilot_seed',
    userEmail: 'system',
    after: { spvId: GOLDEN_HQ_SPV_ID, projectId: GOLDEN_HQ_PROJECT_ID, configId }
  });

  await settings.updateOne(
    { _id: 'dm_seed_v1' },
    { $set: { completed: true, completedAt: now, pilotProjectId: GOLDEN_HQ_PROJECT_ID } },
    { upsert: true }
  );

  return { seeded: true, spvId: GOLDEN_HQ_SPV_ID, projectId: GOLDEN_HQ_PROJECT_ID, configId };
}
