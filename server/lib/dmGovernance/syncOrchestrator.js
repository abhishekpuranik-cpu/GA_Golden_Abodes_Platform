import { DM_COLLECTIONS } from './collections.js';
import { syncProjectFromCashflow } from './integrations/cashflowV1.js';
import { syncCostAllocationFromV2 } from './integrations/resourceV2.js';
import { importExpensesFromCashflow, pullSalesCollectionSnapshot } from './integrations/expenseImport.js';
import { detectBillingTriggers, scanProjectRisks } from './riskEngine.js';
import { ensureComplianceChecklist } from './reconciliationService.js';
import { syncConstructionMilestones } from './integrations/constructionMilestones.js';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Run all integration syncs for a project.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 * @param {object} user
 */
export async function runFullProjectSync(db, projectId, user) {
  const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: projectId });
  if (!project) return { ok: false, error: 'Project not found' };

  const before = {
    collectionsTtd: project.collectionsTtd,
    collectionsPct:
      project.toplineGdv > 0 ? ((project.collectionsTtd || 0) / project.toplineGdv) * 100 : 0,
    revenueStatus: project.revenueStatus
  };

  const results = {};
  const month = currentMonth();

  results.cashflow = await syncProjectFromCashflow(db, projectId);
  results.sales = await pullSalesCollectionSnapshot(db, projectId);
  results.expenses = await importExpensesFromCashflow(db, projectId, { overwrite: false });
  results.costAllocation = await syncCostAllocationFromV2(db, projectId, month, user?.email);
  results.milestones = await syncConstructionMilestones(db, projectId);

  if (project.spvIds?.[0]) {
    await ensureComplianceChecklist(db, project.spvIds[0], projectId);
    results.compliance = { ok: true, spvId: project.spvIds[0] };
  }

  const updated = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: projectId });
  const after = {
    collectionsTtd: updated.collectionsTtd,
    collectionsPct:
      updated.toplineGdv > 0 ? ((updated.collectionsTtd || 0) / updated.toplineGdv) * 100 : 0,
    revenueStatus: updated.revenueStatus
  };

  results.triggers = await detectBillingTriggers(db, projectId, before, after);
  if (results.milestones?.ok) {
    const msTriggers = await detectBillingTriggers(db, projectId, results.milestones.before, results.milestones.after);
    results.triggers = [...(results.triggers || []), ...(msTriggers || [])];
  }
  results.risks = await scanProjectRisks(db, projectId);

  await db.collection(DM_COLLECTIONS.integrationSyncLogs).insertOne({
    source: 'full_sync',
    projectId,
    at: new Date(),
    status: 'ok',
    result: {
      cashflow: results.cashflow?.ok,
      sales: results.sales?.ok,
      expenses: results.expenses?.imported,
      triggers: results.triggers?.length,
      risks: results.risks?.count
    },
    userEmail: user?.email
  });

  return { ok: true, results, project: updated };
}
