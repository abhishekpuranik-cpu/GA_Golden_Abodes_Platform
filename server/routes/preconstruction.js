import { Router } from 'express';
import { withDb } from '../lib/mongo.js';

export const preconstructionRouter = Router();
const APP_ID = 'preconstruction';

preconstructionRouter.get(
  '/preconstruction-state',
  withDb(async (_req, res, db) => {
    try {
      const doc = await db.collection('app_states').findOne({ _id: APP_ID });
      if (!doc?.data) return res.status(404).json({ error: 'No saved PreConstruction workspace' });
      res.json({ data: doc.data, updatedAt: doc.updatedAt, version: doc.version || 1, appId: APP_ID });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

preconstructionRouter.put(
  '/preconstruction-state',
  withDb(async (req, res, db) => {
    try {
      const { data, expectedVersion, updatedBy } = req.body || {};
      if (data === undefined || data === null || (typeof data !== 'object' && typeof data !== 'string')) {
        return res.status(400).json({ error: 'body.data (object or JSON string) required' });
      }
      const payload = typeof data === 'string' ? JSON.parse(data) : data;
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return res.status(400).json({ error: 'body.data must serialize to a JSON object' });
      }
      const states = db.collection('app_states');
      const existing = await states.findOne({ _id: APP_ID });
      const currentVersion = existing?.version || 0;
      if (expectedVersion !== undefined && Number(expectedVersion) !== currentVersion) {
        return res.status(409).json({
          error: 'Version conflict',
          appId: APP_ID,
          expectedVersion: Number(expectedVersion),
          currentVersion,
          updatedAt: existing?.updatedAt || null,
          updatedBy: existing?.updatedBy || null
        });
      }
      const now = new Date();
      const nextVersion = currentVersion + 1;
      await states.updateOne(
        { _id: APP_ID },
        {
          $set: {
            appId: APP_ID,
            data: payload,
            updatedAt: now,
            updatedBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system',
            version: nextVersion
          }
        },
        { upsert: true }
      );
      res.json({ ok: true, updatedAt: now, version: nextVersion, appId: APP_ID });
    } catch (e) {
      if (e instanceof SyntaxError) {
        return res.status(400).json({ error: 'Invalid JSON in body.data string' });
      }
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);
