/** Mongo collection names and index bootstrap for DM–SPV Governance. */
export const DM_COLLECTIONS = {
  spvs: 'dm_spvs',
  projects: 'dm_projects',
  billingConfigs: 'dm_billing_configs',
  billingSlabs: 'dm_billing_slabs',
  feeCalculations: 'dm_fee_calculations',
  invoices: 'dm_invoices',
  payments: 'dm_payments',
  costAllocations: 'dm_cost_allocations',
  preRevenueBilling: 'dm_pre_revenue_billing',
  expenses: 'dm_expenses',
  annualReconciliations: 'dm_annual_reconciliations',
  complianceDocuments: 'dm_compliance_documents',
  billingTriggers: 'dm_billing_triggers',
  riskExceptions: 'dm_risk_exceptions',
  collectionSnapshots: 'dm_collection_snapshots',
  auditLogs: 'dm_audit_logs',
  systemSettings: 'dm_system_settings',
  integrationSyncLogs: 'dm_integration_sync_logs',
  scenarios: 'dm_scenarios',
  notifications: 'dm_notifications'
};

export async function ensureDmIndexes(db) {
  const spvs = db.collection(DM_COLLECTIONS.spvs);
  await spvs.createIndex({ spvCode: 1 }, { unique: true });
  await spvs.createIndex({ billingStatus: 1 });

  const projects = db.collection(DM_COLLECTIONS.projects);
  await projects.createIndex({ projectCode: 1 }, { unique: true });
  await projects.createIndex({ spvIds: 1 });
  await projects.createIndex({ name: 1 });
  await projects.createIndex({ revenueStatus: 1 });

  const billingConfigs = db.collection(DM_COLLECTIONS.billingConfigs);
  await billingConfigs.createIndex({ projectId: 1, version: -1 });
  await billingConfigs.createIndex({ projectId: 1, status: 1 });

  const billingSlabs = db.collection(DM_COLLECTIONS.billingSlabs);
  await billingSlabs.createIndex({ configId: 1, sortOrder: 1 });

  const auditLogs = db.collection(DM_COLLECTIONS.auditLogs);
  await auditLogs.createIndex({ entityType: 1, entityId: 1, at: -1 });
  await auditLogs.createIndex({ at: -1 });

  const syncLogs = db.collection(DM_COLLECTIONS.integrationSyncLogs);
  await syncLogs.createIndex({ source: 1, at: -1 });

  const calcs = db.collection(DM_COLLECTIONS.feeCalculations);
  await calcs.createIndex({ projectId: 1, periodMonth: -1 });

  const invoices = db.collection(DM_COLLECTIONS.invoices);
  await invoices.createIndex({ projectId: 1, periodMonth: -1 });
  await invoices.createIndex({ spvId: 1, status: 1 });
  await invoices.createIndex({ invoiceNo: 1 }, { unique: true });
  await invoices.createIndex({ status: 1 });

  const payments = db.collection(DM_COLLECTIONS.payments);
  await payments.createIndex({ invoiceId: 1 });
  await payments.createIndex({ projectId: 1 });

  const costAlloc = db.collection(DM_COLLECTIONS.costAllocations);
  await costAlloc.createIndex({ projectId: 1, periodMonth: 1 }, { unique: true });

  const preRev = db.collection(DM_COLLECTIONS.preRevenueBilling);
  await preRev.createIndex({ projectId: 1, periodMonth: 1 }, { unique: true });

  const expenses = db.collection(DM_COLLECTIONS.expenses);
  await expenses.createIndex({ projectId: 1, date: -1 });
  await expenses.createIndex({ spvId: 1, approvalStatus: 1 });

  const recons = db.collection(DM_COLLECTIONS.annualReconciliations);
  await recons.createIndex({ projectId: 1, financialYear: 1 }, { unique: true });

  const compliance = db.collection(DM_COLLECTIONS.complianceDocuments);
  await compliance.createIndex({ spvId: 1, documentType: 1 });
  await compliance.createIndex({ status: 1 });

  const triggers = db.collection(DM_COLLECTIONS.billingTriggers);
  await triggers.createIndex({ projectId: 1, status: 1 });

  const risks = db.collection(DM_COLLECTIONS.riskExceptions);
  await risks.createIndex({ projectId: 1, status: 1 });
  await risks.createIndex({ severity: 1 });

  const snaps = db.collection(DM_COLLECTIONS.collectionSnapshots);
  await snaps.createIndex({ projectId: 1 });

  const scenarios = db.collection(DM_COLLECTIONS.scenarios);
  await scenarios.createIndex({ projectId: 1, createdAt: -1 });

  const notifications = db.collection(DM_COLLECTIONS.notifications);
  await notifications.createIndex({ projectId: 1, acknowledged: 1 });
  await notifications.createIndex({ createdAt: -1 });
}
