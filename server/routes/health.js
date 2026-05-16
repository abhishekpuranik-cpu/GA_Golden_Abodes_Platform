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
  V2V3_ACCESS_CODE
} from '../lib/config.js';

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
    vault: {
      executionDashboardUrl: EXECUTION_DASHBOARD_URL || null,
      preconstructionUrl: PRECONSTRUCTION_APP_URL || bundledPre || null
    }
  });
});
