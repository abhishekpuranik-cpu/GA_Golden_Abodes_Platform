import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { withDb } from '../lib/mongo.js';
import {
  packV1CashflowRowData,
  mergeV1CashflowForPut,
  mergeV1CashflowEnvelopes,
  repairV1CashflowForRead,
  countSoldUnitsInEnvelope,
  V1_CASHFLOW_APP_ID
} from '../lib/v1CashflowMongoPack.js';
import {
  mergeV3OrgPlannerForPut,
  repairV3OrgPlannerForRead,
  V3_ORG_PLANNER_APP_ID
} from '../lib/v3OrgPlannerMerge.js';
import { mergePreconstructionState, repairPreconstructionForRead } from '../lib/preconstructionMerge.js';
import { resolveSession, userHasPermission } from './auth.js';

export const PRECONSTRUCTION_APP_ID = 'preconstruction';
const PERM_ADMIN = 'manage_security';

function canDeletePreconProjects(user) {
  if (!user) return false;
  if (userHasPermission(user, PERM_ADMIN)) return true;
  return (user.roleIds || []).includes('admin');
}

export const appStatesRouter = Router();

const APP_ID_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/i;
const LEGACY_KEYSETS = {
  v1_cashflow: ['ga_cf_v1', 'ga_v1_building_filter', 'ga_cf_tally_settings', 'ga_v1_show_prior_years', 'ga_cloud_url', 'ga_user_name'],
  v2_resource_planner: [
    'ga_rp_state_v1',
    'ga_v2_proj_costs',
    'ga_jd_data',
    'ga_pnl_mktg',
    'ga_team_snapshots',
    'ga_rp_projects',
    'ga_cloud_url',
    'ga_user_name'
  ],
  v3_org_planner: [
    'ga_planner_state_v1',
    'ga_rp_projects',
    'ga_v3_cf_sync',
    'ga_v3_money_crores',
    'ga_v3_last_manual_save',
    'ga_cloud_url',
    'ga_user_name'
  ]
};

function normalizeAppId(raw) {
  return String(raw || '').trim().toLowerCase();
}

function ensureAppId(req, res) {
  const appId = normalizeAppId(req.params.appId);
  if (!APP_ID_RE.test(appId)) {
    res.status(400).json({ error: 'Invalid appId (use letters, numbers, _, -)' });
    return null;
  }
  return appId;
}

function normalizeData(raw) {
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('body.data must be a JSON object');
  }
  return data;
}

async function migrateLegacyWorkspaceForApp(db, appId) {
  const keys = LEGACY_KEYSETS[appId];
  if (!keys) return null;
  const legacy = await db.collection('workspace_kv').findOne({ _id: 'main' });
  if (!legacy?.keys || typeof legacy.keys !== 'object') return null;
  const data = {};
  for (const k of keys) {
    if (typeof legacy.keys[k] === 'string') data[k] = legacy.keys[k];
  }
  if (!Object.keys(data).length) return null;
  const now = new Date();
  const doc = { _id: appId, appId, data, version: 1, updatedAt: now, updatedBy: 'legacy-migration' };
  await db.collection('app_states').updateOne({ _id: appId }, { $set: doc }, { upsert: true });
  return doc;
}

appStatesRouter.get(
  '/apps/:appId/meta',
  withDb(async (req, res, db) => {
    const appId = ensureAppId(req, res);
    if (!appId) return;
    try {
      const row = await db.collection('app_states').findOne({ _id: appId }, { projection: { version: 1, updatedAt: 1, updatedBy: 1 } });
      if (!row) return res.status(404).json({ error: `No saved state for app "${appId}"` });
      res.json({ appId, version: row.version || 1, updatedAt: row.updatedAt || null, updatedBy: row.updatedBy || null });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

appStatesRouter.get(
  '/apps/:appId/state',
  withDb(async (req, res, db) => {
    const appId = ensureAppId(req, res);
    if (!appId) return;
    try {
      const states = db.collection('app_states');
      let row = await states.findOne({ _id: appId });
      if (!row) row = await migrateLegacyWorkspaceForApp(db, appId);
      if (!row?.data) return res.status(404).json({ error: `No saved state for app "${appId}"` });
      let outData = row.data;
      if (appId === V3_ORG_PLANNER_APP_ID) {
        outData = repairV3OrgPlannerForRead(row.data);
      } else if (appId === V1_CASHFLOW_APP_ID) {
        outData = await repairV1CashflowForRead(db, row.data);
      } else if (appId === PRECONSTRUCTION_APP_ID) {
        outData = repairPreconstructionForRead(row.data);
      }
      res.json({
        appId,
        data: outData,
        version: row.version || 1,
        updatedAt: row.updatedAt || null,
        updatedBy: row.updatedBy || null
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

appStatesRouter.put(
  '/apps/:appId/state',
  withDb(async (req, res, db) => {
    const appId = ensureAppId(req, res);
    if (!appId) return;
    try {
      const { data: rawData, expectedVersion, updatedBy, forceRestore } = req.body || {};
      const data = normalizeData(rawData);
      const states = db.collection('app_states');
      const now = new Date();
      const existing = await states.findOne({ _id: appId });
      const currentVersion = existing?.version || 0;
      const hasVersionConflict = expectedVersion !== undefined && Number(expectedVersion) !== currentVersion;
      if (hasVersionConflict && appId !== V1_CASHFLOW_APP_ID && appId !== PRECONSTRUCTION_APP_ID) {
        return res.status(409).json({
          error: 'Version conflict',
          appId,
          expectedVersion: Number(expectedVersion),
          currentVersion,
          updatedAt: existing?.updatedAt || null,
          updatedBy: existing?.updatedBy || null
        });
      }
      if (hasVersionConflict && appId === V1_CASHFLOW_APP_ID) {
        // For v1 cashflow, resolve conflicts by merging with latest server envelope
        // so concurrent users don't lose saves on stale expectedVersion.
      }
      const nextVersion = currentVersion + 1;
      let toSave = data;
      if (appId === PRECONSTRUCTION_APP_ID) {
        let authUser = req.authUser;
        if (!authUser) {
          const sess = await resolveSession(db, req);
          authUser = sess?.user;
        }
        if (existing?.data) {
          toSave = mergePreconstructionState(existing.data, data, {
            allowProjectRemoval: canDeletePreconProjects(authUser)
          });
        } else {
          toSave = repairPreconstructionForRead(data);
        }
      } else if (appId === V1_CASHFLOW_APP_ID) {
        const existingEnv = existing?.data ? await repairV1CashflowForRead(db, existing.data) : null;
        const merged = await mergeV1CashflowForPut(db, existing?.data, data);
        const beforeUnits = countSoldUnitsInEnvelope(existingEnv);
        const afterUnits = countSoldUnitsInEnvelope(merged);
        if (beforeUnits > 0 && afterUnits === 0 && !req.body?.allowUnitLoss && !forceRestore) {
          return res.status(409).json({
            error:
              'Save rejected: would remove all sold units from the server workbook. Load from server or restore a snapshot before saving.',
            currentVersion,
            soldUnitsBefore: beforeUnits,
            soldUnitsAfter: afterUnits
          });
        }
        if (beforeUnits >= 3 && afterUnits < Math.floor(beforeUnits * 0.5) && !req.body?.allowUnitLoss && !forceRestore) {
          return res.status(409).json({
            error:
              'Save rejected: sold-unit count would drop sharply. Restore a snapshot or re-import CRM if data was lost.',
            currentVersion,
            soldUnitsBefore: beforeUnits,
            soldUnitsAfter: afterUnits
          });
        }
        toSave = await packV1CashflowRowData(db, merged, {
          version: nextVersion,
          updatedBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system'
        });
      } else if (appId === V3_ORG_PLANNER_APP_ID) {
        toSave = mergeV3OrgPlannerForPut(existing?.data, data);
      }
      await states.updateOne(
        { _id: appId },
        {
          $set: {
            appId,
            data: toSave,
            version: nextVersion,
            updatedAt: now,
            updatedBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system'
          }
        },
        { upsert: true }
      );
      res.json({ ok: true, appId, version: nextVersion, updatedAt: now });
    } catch (e) {
      if (e instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON in body.data string' });
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

appStatesRouter.post(
  '/apps/:appId/import',
  withDb(async (req, res, db) => {
    const appId = ensureAppId(req, res);
    if (!appId) return;
    try {
      const { data: rawData, mode = 'replace', updatedBy, note } = req.body || {};
      const incoming = normalizeData(rawData);
      const states = db.collection('app_states');
      const snaps = db.collection('app_state_snapshots');
      const now = new Date();
      const existing = await states.findOne({ _id: appId });

      if (existing?.data) {
        await snaps.insertOne({
          appId,
          sourceVersion: existing.version || 1,
          data: existing.data,
          createdAt: now,
          createdBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system',
          label: `Auto-snapshot before import (v${existing.version || 1})`,
          note: typeof note === 'string' ? note : ''
        });
      }

      let merged = incoming;
      if (mode === 'merge' && existing?.data) {
        if (appId === V1_CASHFLOW_APP_ID) {
          const base = await repairV1CashflowForRead(db, existing.data);
          merged = mergeV1CashflowEnvelopes(base, incoming);
        } else {
          merged = { ...existing.data, ...incoming };
        }
      }
      const nextVersion = (existing?.version || 0) + 1;
      let toSave = merged;
      if (appId === V1_CASHFLOW_APP_ID) {
        toSave = await packV1CashflowRowData(db, merged, {
          version: nextVersion,
          updatedBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system'
        });
      } else if (appId === V3_ORG_PLANNER_APP_ID) {
        toSave = mergeV3OrgPlannerForPut(existing?.data, merged);
      }
      await states.updateOne(
        { _id: appId },
        {
          $set: {
            appId,
            data: toSave,
            version: nextVersion,
            updatedAt: now,
            updatedBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system'
          }
        },
        { upsert: true }
      );
      res.json({ ok: true, appId, version: nextVersion, updatedAt: now, mode });
    } catch (e) {
      if (e instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON in body.data string' });
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

appStatesRouter.get(
  '/apps/:appId/snapshots',
  withDb(async (req, res, db) => {
    const appId = ensureAppId(req, res);
    if (!appId) return;
    try {
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
      const rows = await db
        .collection('app_state_snapshots')
        .find({ appId })
        .project({ appId: 1, sourceVersion: 1, createdAt: 1, createdBy: 1, label: 1, note: 1, data: appId === V1_CASHFLOW_APP_ID ? 1 : 0 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();
      const snapshots = [];
      for (const r of rows) {
        const item = {
          id: r._id.toString(),
          appId: r.appId,
          sourceVersion: r.sourceVersion,
          createdAt: r.createdAt,
          createdBy: r.createdBy,
          label: r.label,
          note: r.note
        };
        if (appId === V1_CASHFLOW_APP_ID && r.data) {
          try {
            const env = await repairV1CashflowForRead(db, r.data);
            item.soldUnitCount = countSoldUnitsInEnvelope(env);
          } catch {
            item.soldUnitCount = null;
          }
        }
        snapshots.push(item);
      }
      res.json({ snapshots });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

appStatesRouter.post(
  '/apps/:appId/snapshots',
  withDb(async (req, res, db) => {
    const appId = ensureAppId(req, res);
    if (!appId) return;
    try {
      const { updatedBy, label, note } = req.body || {};
      const states = db.collection('app_states');
      const snaps = db.collection('app_state_snapshots');
      const now = new Date();
      const existing = await states.findOne({ _id: appId });
      if (!existing?.data) return res.status(404).json({ error: `No saved state for app "${appId}"` });
      const ins = await snaps.insertOne({
        appId,
        sourceVersion: existing.version || 1,
        data: existing.data,
        createdAt: now,
        createdBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system',
        label: typeof label === 'string' && label.trim() ? label.trim() : `Manual snapshot (v${existing.version || 1})`,
        note: typeof note === 'string' ? note : ''
      });
      res.json({ ok: true, appId, snapshotId: ins.insertedId.toString(), sourceVersion: existing.version || 1, createdAt: now });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

appStatesRouter.get(
  '/apps/:appId/snapshots/:snapshotId',
  withDb(async (req, res, db) => {
    const appId = ensureAppId(req, res);
    if (!appId) return;
    try {
      let snapshotOid;
      try {
        snapshotOid = new ObjectId(req.params.snapshotId);
      } catch {
        return res.status(400).json({ error: 'Invalid snapshot id' });
      }
      const row = await db.collection('app_state_snapshots').findOne({ _id: snapshotOid, appId });
      if (!row?.data) return res.status(404).json({ error: 'Snapshot not found' });
      let outData = row.data;
      if (appId === V3_ORG_PLANNER_APP_ID) outData = repairV3OrgPlannerForRead(row.data);
      else if (appId === V1_CASHFLOW_APP_ID) outData = await repairV1CashflowForRead(db, row.data);
      res.json({
        id: row._id.toString(),
        appId,
        sourceVersion: row.sourceVersion || 1,
        createdAt: row.createdAt || null,
        createdBy: row.createdBy || null,
        label: row.label || '',
        note: row.note || '',
        data: outData
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

appStatesRouter.post(
  '/apps/:appId/restore/:snapshotId',
  withDb(restoreAppStateFromSnapshotHandler)
);

appStatesRouter.post(
  '/apps/:appId/snapshots/:snapshotId/restore',
  withDb(restoreAppStateFromSnapshotHandler)
);

appStatesRouter.post(
  '/apps/:appId/restore-best-morning',
  withDb(async (req, res, db) => {
    const appId = ensureAppId(req, res);
    if (!appId) return;
    if (appId !== V1_CASHFLOW_APP_ID) {
      return res.status(400).json({ error: 'restore-best-morning is only for v1_cashflow' });
    }
    try {
      const { pickBestV1SnapshotBefore, restoreV1CashflowFromSnapshot } = await import(
        '../lib/v1CashflowAutoRestore.js'
      );
      const before = req.body?.before || process.env.V1_AUTO_RESTORE_BEFORE;
      const picked = await pickBestV1SnapshotBefore(db, { before, minPriority: 1 });
      if (!picked) return res.status(404).json({ error: 'No suitable snapshot found before cutoff' });
      const updatedBy =
        typeof req.body?.updatedBy === 'string' && req.body.updatedBy.trim()
          ? req.body.updatedBy.trim()
          : 'restore-best-morning';
      const result = await restoreV1CashflowFromSnapshot(db, picked.snapshot, updatedBy);
      res.json({ ok: true, picked: { soldUnitCount: picked.soldUnitCount, priorityUnitCount: picked.priorityUnitCount, snapshotAt: picked.snapshot.createdAt }, ...result });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  })
);

async function restoreAppStateFromSnapshotHandler(req, res, db) {
    const appId = ensureAppId(req, res);
    if (!appId) return;
    try {
      let snapshotOid;
      try {
        snapshotOid = new ObjectId(req.params.snapshotId);
      } catch {
        return res.status(400).json({ error: 'Invalid snapshot id' });
      }
      const { updatedBy, note } = req.body || {};
      const states = db.collection('app_states');
      const snaps = db.collection('app_state_snapshots');
      const now = new Date();
      const target = await snaps.findOne({ _id: snapshotOid, appId });
      if (!target?.data) return res.status(404).json({ error: 'Snapshot not found' });

      const existing = await states.findOne({ _id: appId });
      if (existing?.data) {
        await snaps.insertOne({
          appId,
          sourceVersion: existing.version || 1,
          data: existing.data,
          createdAt: now,
          createdBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system',
          label: `Auto-snapshot before restore (v${existing.version || 1})`,
          note: typeof note === 'string' ? note : ''
        });
      }

      const nextVersion = (existing?.version || 0) + 1;
      await states.updateOne(
        { _id: appId },
        {
          $set: {
            appId,
            data: target.data,
            version: nextVersion,
            updatedAt: now,
            updatedBy: typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system'
          }
        },
        { upsert: true }
      );
      res.json({ ok: true, appId, version: nextVersion, updatedAt: now });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
}
