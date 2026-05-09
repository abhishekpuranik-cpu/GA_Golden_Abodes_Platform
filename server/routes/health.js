import { Router } from 'express';
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

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const db = await ensureMongo();
  res.json({
    ok: true,
    version: VERSION,
    mongo: !!db,
    db: DB_NAME,
    port: PORT,
    legacyRoot: API_TOOL_PATH,
    legacyExists: LEGACY_EXISTS,
    plannerAccessEnabled: !!V2V3_ACCESS_CODE,
    vault: {
      executionDashboardUrl: EXECUTION_DASHBOARD_URL || null,
      preconstructionUrl: PRECONSTRUCTION_APP_URL || null
    }
  });
});
