/**
 * Import billable expenses from Cashflow V1 actuals for a project.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */

import { pullCashflowMetrics } from './cashflowV1.js';
import { DM_COLLECTIONS } from '../collections.js';

function parseCfEnvelope(doc) {
  if (!doc?.data?.ga_cf_v1) return null;
  try {
    const payload = JSON.parse(doc.data.ga_cf_v1);
    return payload?.data ? payload : null;
  } catch {
    return null;
  }
}

const GA_BILLABLE_CATS = new Set([
  'GA',
  'GA Costs',
  'General & Admin',
  'Consultant',
  'Consultants',
  'Legal',
  'Marketing',
  'NOC',
  'Regulatory'
]);

function mapCategory(cat1) {
  const c = String(cat1 || '').trim();
  if (/consult/i.test(c)) return 'consultant_coordination';
  if (/legal|regulatory|noc/i.test(c)) return 'legal_compliance';
  if (/market/i.test(c)) return 'marketing_readiness';
  if (/travel/i.test(c)) return 'project_travel';
  if (/ga|admin/i.test(c)) return 'misc_governance';
  return 'direct_project';
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 * @param {object} opts
 */
export async function importExpensesFromCashflow(db, projectId, opts = {}) {
  const stateDoc = await db.collection('app_states').findOne({ _id: 'v1_cashflow' });
  const envelope = parseCfEnvelope(stateDoc);
  if (!envelope) return { ok: false, error: 'Cashflow workbook not found' };

  const projectCfg = envelope.data?.[projectId];
  if (!projectCfg) return { ok: false, error: `Project ${projectId} not in cashflow` };

  const project = await db.collection('dm_projects').findOne({ _id: projectId });
  const spvId = project?.spvIds?.[0] || null;
  const actuals = projectCfg.actuals || [];

  const expenses = db.collection(DM_COLLECTIONS.expenses);
  let imported = 0;
  let skipped = 0;
  const now = new Date();

  for (const a of actuals) {
    const cat1 = a.cat1 || a.category || '';
    if (!opts.importAll && !GA_BILLABLE_CATS.has(cat1) && !opts.includeAll) {
      const mapped = mapCategory(cat1);
      if (mapped === 'direct_project' && !opts.includeAll) {
        skipped += 1;
        continue;
      }
    }

    const extId = `cf_${projectId}_${a.id || `${a.date}_${a.amount}`}`;
    const existing = await expenses.findOne({ _id: extId });
    if (existing && !opts.overwrite) {
      skipped += 1;
      continue;
    }

    const amount = Math.abs(Number(a.amount || 0));
    const doc = {
      _id: extId,
      projectId,
      spvId,
      source: 'cashflow_v1',
      sourceRef: a.id || null,
      date: a.date || null,
      vendor: a.party || a.vendor || '',
      expenseCategory: mapCategory(cat1),
      amount,
      gst: 0,
      billableToSpv: true,
      insideDmCap: true,
      markupApplicable: false,
      markupPct: 0,
      paidBy: 'SPV',
      approvalStatus: 'approved',
      paymentStatus: 'paid',
      remarks: a.note || cat1,
      importedAt: now,
      updatedAt: now
    };

    await expenses.updateOne({ _id: extId }, { $set: doc }, { upsert: true });
    imported += 1;
  }

  return { ok: true, imported, skipped, totalActuals: actuals.length };
}

/**
 * Pull sales/collection snapshot from cashflow units.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */
export async function pullSalesCollectionSnapshot(db, projectId) {
  const metrics = await pullCashflowMetrics(db, projectId);
  if (!metrics.ok) return metrics;

  const stateDoc = await db.collection('app_states').findOne({ _id: 'v1_cashflow' });
  const envelope = parseCfEnvelope(stateDoc);
  const projectCfg = envelope?.data?.[projectId] || {};
  const units = projectCfg.units || [];

  let bookingValue = 0;
  let agreementValue = 0;
  let soldCount = 0;

  units.forEach((u) => {
    const val = Number(u.totalValue || 0);
    if (u.bookingDate || u.payType) {
      soldCount += 1;
      bookingValue += val;
      agreementValue += val;
    }
  });

  const snapshot = {
    projectId,
    collectionsTtd: metrics.collectionsTtd,
    toplineGdv: metrics.toplineGdv,
    bookingValue,
    agreementValue,
    soldUnits: soldCount,
    totalUnits: units.length + (projectCfg.unsoldUnits || []).length,
    collectionsPct: metrics.toplineGdv > 0 ? (metrics.collectionsTtd / metrics.toplineGdv) * 100 : 0,
    syncedAt: new Date().toISOString(),
    source: 'cashflow_v1'
  };

  await db.collection(DM_COLLECTIONS.collectionSnapshots).updateOne(
    { _id: `snap_${projectId}` },
    { $set: { ...snapshot, _id: `snap_${projectId}`, updatedAt: new Date() } },
    { upsert: true }
  );

  return { ok: true, snapshot };
}
