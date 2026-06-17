/**
 * Cashflow V1 integration — pull collections/topline; push GA DM fee schedule.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */

function parseCfEnvelope(doc) {
  if (!doc?.data) return null;
  let raw = doc.data.ga_cf_v1;
  if (!raw) return null;
  try {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (payload?.data && typeof payload.data === 'object') return payload;
  } catch {
    return null;
  }
  return null;
}

function sumCollectionsFromUnits(projectCfg) {
  const units = projectCfg?.units || [];
  let total = 0;
  units.forEach((u) => {
    total += Number(u.receivedToDate || 0);
  });
  return total;
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */
export async function pullCashflowMetrics(db, projectId) {
  const stateDoc = await db.collection('app_states').findOne({ _id: 'v1_cashflow' });
  const envelope = parseCfEnvelope(stateDoc);
  if (!envelope) {
    return { ok: false, error: 'v1_cashflow state not found' };
  }

  const workbook = envelope.data || {};
  const projectCfg = workbook[projectId];
  if (!projectCfg) {
    return { ok: false, error: `Project ${projectId} not in cashflow workbook` };
  }

  const manualProjs = envelope.manualProjs || [];
  const rpMatch = manualProjs.find((p) => p.id === projectId);

  const collectionsTtd = sumCollectionsFromUnits(projectCfg);
  const toplineFromUnits = (projectCfg.units || []).reduce((s, u) => s + Number(u.totalValue || 0), 0)
    + (projectCfg.unsoldUnits || []).reduce((s, u) => s + Number(u.totalValue || 0), 0);

  return {
    ok: true,
    projectId,
    toplineGdv: toplineFromUnits || Number(rpMatch?._gdv || 0),
    collectionsTtd,
    collectionsMtd: 0,
    projectCostIncurred: Number(projectCfg._costIncurred || 0),
    revenueStartDate: projectCfg.startDate || null,
    syncedAt: new Date().toISOString()
  };
}

/**
 * Push DM fee payable schedule into v1_cashflow — replaces ga monthly schedule when dmSyncEnabled.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 * @param {object} dmSchedule
 */
export async function pushDmScheduleToCashflow(db, projectId, dmSchedule) {
  const states = db.collection('app_states');
  const stateDoc = await states.findOne({ _id: 'v1_cashflow' });
  const envelope = parseCfEnvelope(stateDoc);
  if (!envelope) {
    return { ok: false, error: 'v1_cashflow workbook not found in ga_cf_v1' };
  }

  const syncBlock = {
    dmFeePayableSchedule: dmSchedule.schedule || [],
    dmFeeAccrued: Number(dmSchedule.accrued || 0),
    dmFeePaidTtd: Number(dmSchedule.paidTtd || 0),
    dmFeeBilledTtd: Number(dmSchedule.billedTtd || 0),
    lastDmSyncAt: new Date().toISOString(),
    dmSyncEnabled: true
  };

  if (!envelope.ga_dm_billing_sync) envelope.ga_dm_billing_sync = {};
  envelope.ga_dm_billing_sync[projectId] = syncBlock;

  const projectCfg = envelope.data?.[projectId];
  if (projectCfg && Array.isArray(dmSchedule.gaMonthlyReplacement)) {
    projectCfg.gaMonthly = dmSchedule.gaMonthlyReplacement;
    projectCfg._dmBillingSync = syncBlock;
  }

  const rowData = { ...(stateDoc.data || {}) };
  rowData.ga_cf_v1 = JSON.stringify(envelope);

  await states.updateOne(
    { _id: 'v1_cashflow' },
    {
      $set: {
        data: rowData,
        updatedAt: new Date(),
        updatedBy: 'dm_governance_sync'
      },
      $inc: { version: 1 }
    }
  );

  return { ok: true, projectId, syncBlock };
}

/**
 * Apply cashflow metrics to dm_projects document.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */
export async function syncProjectFromCashflow(db, projectId) {
  const metrics = await pullCashflowMetrics(db, projectId);
  if (!metrics.ok) return metrics;

  const revenueStatus =
    metrics.collectionsTtd > 0 ? 'collection_active' : metrics.toplineGdv > 0 ? 'launched' : 'pre_revenue';

  await db.collection('dm_projects').updateOne(
    { _id: projectId },
    {
      $set: {
        toplineGdv: metrics.toplineGdv,
        collectionsTtd: metrics.collectionsTtd,
        projectCostIncurred: metrics.projectCostIncurred,
        revenueStatus,
        'integrationSnapshot.cashflow': metrics,
        updatedAt: new Date()
      }
    }
  );

  return { ok: true, metrics, revenueStatus };
}
