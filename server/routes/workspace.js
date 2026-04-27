import { Router } from 'express';
import { withDb } from '../lib/mongo.js';
import { validateWorkspaceKeys } from '../lib/validateWorkspaceKeys.js';

export const workspaceRouter = Router();

workspaceRouter.get(
  '/workspace-keys',
  withDb(async (_req, res, db) => {
    try {
      const doc = await db.collection('workspace_kv').findOne({ _id: 'main' });
      res.json({ keys: doc?.keys || {}, updatedAt: doc?.updatedAt || null });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

workspaceRouter.put(
  '/workspace-keys',
  withDb(async (req, res, db) => {
    try {
      const { keys: rawKeys, merge } = req.body || {};
      const validated = validateWorkspaceKeys(rawKeys);
      if (!validated.ok) {
        return res.status(400).json({ error: validated.error });
      }
      const { keys } = validated;
      const now = new Date();
      const col = db.collection('workspace_kv');
      if (merge) {
        const prev = (await col.findOne({ _id: 'main' }))?.keys || {};
        const next = { ...prev, ...keys };
        const sizeCheck = validateWorkspaceKeys(next);
        if (!sizeCheck.ok) {
          return res.status(400).json({ error: sizeCheck.error });
        }
        await col.updateOne({ _id: 'main' }, { $set: { keys: sizeCheck.keys, updatedAt: now } }, { upsert: true });
        return res.json({ ok: true, updatedAt: now, count: Object.keys(sizeCheck.keys).length });
      }
      await col.updateOne({ _id: 'main' }, { $set: { keys, updatedAt: now } }, { upsert: true });
      res.json({ ok: true, updatedAt: now, count: Object.keys(keys).length });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);
