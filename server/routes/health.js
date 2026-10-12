import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureMongo } from '../lib/mongo.js';
import {
  VERSION,
  DB_NAME,
  PORT,
  API_TOOL_PATH,
  LEGACY_EXISTS,
  EXECUTION_DASHBOARD_URL,
  PRECONSTRUCTION_APP_URL,
  V2V3_ACCESS_CODE,
  V1_AUTO_RESTORE_BEFORE
} from '../lib/config.js';
import { getSyncPreferences } from '../lib/postsales/purgeUnitData.js';
import { ensurePostSalesMongoose } from '../lib/postsales/mongoose.js';
import Unit from '../models/postsales/Unit.js';
import {
  V1_CASHFLOW_APP_ID,
  repairV1CashflowForRead,
  countSoldUnitsInEnvelope,
  soldUnitsByProject,
  soldUnitsForParadiseLike
} from '../lib/v1CashflowMongoPack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.join(__dirname, '..', '..');
const preconBundledPath = path.join(platformRoot, 'client', 'public', 'preconstruction', 'index.html');

export const healthRouter = Router();

function requestOrigin(req) {
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = req.get('x-forwarded-host') || req.get('host');
  if (!host) return '';
  return `${proto}://${host}`.replace(/\/$/, '');
}

healthRouter.get('/health', async (req, res) => {
  const db = await ensureMongo();
  const bundledPre =
    fs.existsSync(preconBundledPath) && requestOrigin(req)
      ? `${requestOrigin(req)}/preconstruction/`
      : null;
  let postSales = null;
  if (db) {
    try {
      await ensurePostSalesMongoose();
      const [units, syncPrefs] = await Promise.all([
        Unit.countDocuments(),
        getSyncPreferences(db),
      ]);
      postSales = { units, syncPrefs };
    } catch {
      postSales = { error: 'read_failed' };
    }
  }

  let v1Cashflow = null;
  if (db) {
    try {
      v1Cashflow = await cachedV1Summary(db);
    } catch {
      v1Cashflow = { error: 'read_failed' };
    }
  }

  res.json({
    ok: true,
    version: VERSION,
    mongo: !!db,
    db: DB_NAME,
    port: PORT,
    legacyRoot: API_TOOL_PATH,
    legacyExists: LEGACY_EXISTS,
    preconstructionBundled: !!bundledPre,
    postSalesBundled: true,
    postSales,
    plannerAccessEnabled: !!V2V3_ACCESS_CODE,
    v1Cashflow,
    vault: {
      executionDashboardUrl: EXECUTION_DASHBOARD_URL || null,
      preconstructionUrl: PRECONSTRUCTION_APP_URL || bundledPre || null
    }
  });
});

const V1_SUMMARY_TTL_MS = 5 * 60_000;
const v1Summary = { value: null, version: null, at: 0, pending: null };

async function cachedV1Summary(db) {
  const head = await db.collection('app_states').findOne({ _id: V1_CASHFLOW_APP_ID }, { projection: { version: 1 } });
  const version = head?.version || 0;
  if (v1Summary.value && v1Summary.version === version && Date.now() - v1Summary.at < V1_SUMMARY_TTL_MS) {
    return v1Summary.value;
  }
  if (!v1Summary.pending) {
    v1Summary.pending = computeV1Summary(db)
      .then((value) => {
        Object.assign(v1Summary, { value, version: value.version, at: Date.now() });
        return value;
      })
      .finally(() => { v1Summary.pending = null; });
  }
  return v1Summary.pending;
}

async function computeV1Summary(db) {
  const row = await db.collection('app_states').findOne({ _id: V1_CASHFLOW_APP_ID }, { projection: { version: 1, data: 1 } });
  const repaired = row?.data ? await repairV1CashflowForRead(db, row.data) : null;
  const restoreRows = await db
    .collection('platform_ops_flags')
    .find({ _id: { $regex: /^v1_auto_restore:/ } })
    .sort({ at: -1 })
    .limit(8)
    .toArray();
  const restoreFlag =
    restoreRows.find((r) => r.soldUnitCount > 0) ||
    restoreRows.find((r) => r.done && !r.skipped) ||
    restoreRows[0] ||
    null;
  return {
    version: row?.version || 0,
    soldUnits: repaired ? countSoldUnitsInEnvelope(repaired) : 0,
    paradiseUnits: soldUnitsForParadiseLike(repaired || { data: {} }),
    unitsByProject: repaired ? soldUnitsByProject(repaired) : {},
    autoRestoreBefore: V1_AUTO_RESTORE_BEFORE || null,
    autoRestore: restoreFlag
      ? {
          done: !!restoreFlag.done,
          skipped: !!restoreFlag.skipped,
          soldUnitCount: restoreFlag.soldUnitCount ?? null,
          paradiseUnits: restoreFlag.byProject?.P009 ?? restoreFlag.priorParadiseUnits ?? null,
          snapshotAt: restoreFlag.snapshotAt ?? null
        }
      : null
  };
}
