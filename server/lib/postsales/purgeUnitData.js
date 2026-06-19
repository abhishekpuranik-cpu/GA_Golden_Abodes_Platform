import Customer from '../../models/postsales/Customer.js';
import Unit from '../../models/postsales/Unit.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Demand from '../../models/postsales/Demand.js';
import Document from '../../models/postsales/Document.js';
import LoanTracker from '../../models/postsales/LoanTracker.js';
import Ticket from '../../models/postsales/Ticket.js';
import PossessionClearance from '../../models/postsales/PossessionClearance.js';
import { ensureMongo } from '../mongo.js';

const SYNC_PREFS_ID = 'sync_preferences';
/** One-shot deploy purge — set in Mongo after run so restarts are no-ops. */
const DEPLOY_PURGE_FLAG_ID = 'postsales_purge_deploy_20260619';

/** Remove all sold-unit records and linked post-sales data (not inventory catalog or construction milestones). */
export async function purgeAllPostSalesUnitData(db) {
  const [
    customers,
    units,
    steps,
    demands,
    documents,
    loans,
    tickets,
    possession,
  ] = await Promise.all([
    Customer.deleteMany({}),
    Unit.deleteMany({}),
    PipelineStep.deleteMany({}),
    Demand.deleteMany({}),
    Document.deleteMany({}),
    LoanTracker.deleteMany({}),
    Ticket.deleteMany({}),
    PossessionClearance.deleteMany({}),
  ]);

  return {
    ok: true,
    deleted: {
      customers: customers.deletedCount,
      units: units.deletedCount,
      pipelineSteps: steps.deletedCount,
      demands: demands.deletedCount,
      documents: documents.deletedCount,
      loans: loans.deletedCount,
      tickets: tickets.deletedCount,
      possessionClearances: possession.deletedCount,
    },
  };
}

export async function getSyncPreferences(db) {
  const doc = await db.collection('post_sales_settings').findOne({ _id: SYNC_PREFS_ID });
  return {
    autoSyncUnitsOnLoad: doc?.autoSyncUnitsOnLoad !== false,
    autoSyncDemandsOnLoad: doc?.autoSyncDemandsOnLoad !== false,
    updatedAt: doc?.updatedAt || null,
  };
}

export async function setSyncPreferences(db, prefs) {
  const payload = {
    autoSyncUnitsOnLoad: prefs.autoSyncUnitsOnLoad !== false,
    autoSyncDemandsOnLoad: prefs.autoSyncDemandsOnLoad !== false,
    updatedAt: new Date(),
  };
  await db.collection('post_sales_settings').updateOne(
    { _id: SYNC_PREFS_ID },
    { $set: payload },
    { upsert: true },
  );
  return payload;
}

export async function purgeAndDisableAutoSync(db) {
  const result = await purgeAllPostSalesUnitData(db);
  const syncPrefs = await setSyncPreferences(db, {
    autoSyncUnitsOnLoad: false,
    autoSyncDemandsOnLoad: false,
  });
  return { ...result, syncPrefs };
}

/** One-shot production purge on deploy (Mongo flag) or when POSTSALES_PURGE_ON_START=true. */
export async function maybePurgePostSalesOnStart() {
  let db;
  try {
    db = await ensureMongo();
    if (!db) return null;
    const flag = await db.collection('platform_ops_flags').findOne({ _id: DEPLOY_PURGE_FLAG_ID });
    if (flag?.done && process.env.POSTSALES_PURGE_ON_START !== 'true') return null;
  } catch (err) {
    if (process.env.POSTSALES_PURGE_ON_START !== 'true') return null;
    console.error('[Post Sales] Startup purge pre-check failed:', err.message);
    return { ok: false, error: err.message };
  }

  try {
    const result = await purgeAndDisableAutoSync(db);
    await db.collection('platform_ops_flags').updateOne(
      { _id: DEPLOY_PURGE_FLAG_ID },
      { $set: { done: true, at: new Date(), deleted: result.deleted } },
      { upsert: true },
    );
    console.log('[Post Sales] Startup purge complete:', JSON.stringify(result.deleted));
    return result;
  } catch (err) {
    console.error('[Post Sales] Startup purge failed:', err.message);
    return { ok: false, error: err.message };
  }
}
