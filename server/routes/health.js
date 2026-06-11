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
import { V1_CASHFLOW_APP_ID, repairV1CashflowForRead, countSoldUnitsInEnvelope } from '../lib/v1CashflowMongoPack.js';

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
  let v1Cashflow = null;
  if (db) {
    try {
      const row = await db.collection('app_states').findOne({ _id: V1_CASHFLOW_APP_ID }, { projection: { version: 1, data: 1 } });
      let soldUnits = 0;
      if (row?.data) {
        soldUnits = countSoldUnitsInEnvelope(await repairV1CashflowForRead(db, row.data));
      }
      const flagId = `v1_auto_restore:${V1_AUTO_RESTORE_BEFORE}`;
      const restoreFlag = V1_AUTO_RESTORE_BEFORE
        ? await db.collection('platform_ops_flags').findOne({ _id: flagId })
        : null;
      v1Cashflow = {
        version: row?.version || 0,
        soldUnits,
        autoRestoreBefore: V1_AUTO_RESTORE_BEFORE || null,
        autoRestore: restoreFlag
          ? {
              done: !!restoreFlag.done,
              skipped: !!restoreFlag.skipped,
              soldUnitCount: restoreFlag.soldUnitCount ?? null,
              snapshotAt: restoreFlag.snapshotAt ?? null
            }
          : null
      };
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
    plannerAccessEnabled: !!V2V3_ACCESS_CODE,
    v1Cashflow,
    vault: {
      executionDashboardUrl: EXECUTION_DASHBOARD_URL || null,
      preconstructionUrl: PRECONSTRUCTION_APP_URL || bundledPre || null
    }
  });
});
