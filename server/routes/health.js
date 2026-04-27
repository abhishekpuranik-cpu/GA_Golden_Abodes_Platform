import { Router } from 'express';
import { ensureMongo } from '../lib/mongo.js';
import { VERSION, DB_NAME, PORT, API_TOOL_PATH, LEGACY_EXISTS } from '../lib/config.js';

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
    legacyExists: LEGACY_EXISTS
  });
});
