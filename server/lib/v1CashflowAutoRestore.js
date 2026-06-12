import {
  V1_CASHFLOW_APP_ID,
  repairV1CashflowForRead,
  packV1CashflowRowData,
  countSoldUnitsInEnvelope,
  soldUnitsByProject,
  soldUnitsForParadiseLike,
  soldUnitsForProjects,
  consolidateParadiseInEnvelope
} from './v1CashflowMongoPack.js';
import {
  V1_AUTO_RESTORE_BEFORE,
  V1_AUTO_RESTORE_IF_CURRENT_UNITS_BELOW,
  V1_AUTO_RESTORE_FORCE_RUN,
  V1_AUTO_RESTORE_FORCE_RUN_DEFAULT,
  V1_AUTO_RESTORE_PREFER_AFTER,
  V1_AUTO_RESTORE_PRIORITIZE_PROJECTS
} from './config.js';

async function snapshotUnitStats(db, stored) {
  if (!stored) return { total: 0, byProject: {}, priority: 0 };
  const env = await repairV1CashflowForRead(db, stored);
  const byProject = soldUnitsByProject(env);
  const priority = Math.max(soldUnitsForParadiseLike(env), soldUnitsForProjects(env, V1_AUTO_RESTORE_PRIORITIZE_PROJECTS));
  return {
    total: countSoldUnitsInEnvelope(env),
    byProject,
    priority
  };
}

function snapshotScore(stats) {
  return stats.priority * 100_000 + stats.total;
}

/**
 * Pick the best snapshot before `before`:
 * - Prefer snapshots on/after `preferAfter` when any match
 * - Score = priority project units (e.g. Paradise P009) × 100k + total sold units
 * - Tie → latest createdAt
 */
export async function pickBestV1SnapshotBefore(db, opts = {}) {
  const before = opts.before ?? V1_AUTO_RESTORE_BEFORE;
  const beforeDate = before instanceof Date ? before : new Date(before);
  if (Number.isNaN(beforeDate.getTime())) {
    throw new Error(`Invalid before date: ${before}`);
  }

  const preferAfterRaw = opts.preferAfter ?? V1_AUTO_RESTORE_PREFER_AFTER;
  const preferAfterDate = preferAfterRaw ? new Date(preferAfterRaw) : null;
  const scanLimit = Math.max(50, Math.min(800, Number(opts.scanLimit) || 600));
  const minUnits = Math.max(0, Number(opts.minUnits) || 1);
  const minPriority = Math.max(0, Number(opts.minPriority) || 0);

  const rows = await db
    .collection('app_state_snapshots')
    .find({ appId: V1_CASHFLOW_APP_ID, createdAt: { $lt: beforeDate } })
    .sort({ createdAt: -1 })
    .limit(scanLimit)
    .toArray();

  const scored = [];
  for (const r of rows) {
    const stats = await snapshotUnitStats(db, r.data);
    if (stats.total < minUnits) continue;
    scored.push({ snapshot: r, stats, score: snapshotScore(stats) });
  }
  if (!scored.length) return null;

  const preferPool =
    preferAfterDate && !Number.isNaN(preferAfterDate.getTime())
      ? scored.filter((s) => s.snapshot.createdAt >= preferAfterDate)
      : [];
  const priorityPool = scored.filter((s) => s.stats.priority >= Math.max(1, minPriority));

  const pool =
    priorityPool.length > 0
      ? priorityPool
      : preferPool.length > 0
        ? preferPool
        : scored;

  pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.snapshot.createdAt || 0) - (a.snapshot.createdAt || 0);
  });

  const best = pool[0];
  return {
    snapshot: best.snapshot,
    soldUnitCount: best.stats.total,
    priorityUnitCount: best.stats.priority,
    byProject: best.stats.byProject,
    score: best.score
  };
}

/** Restore v1_cashflow app_states row from a snapshot document (auto-snapshots current first). */
export async function restoreV1CashflowFromSnapshot(db, target, updatedBy = 'restore') {
  if (!target?.data) throw new Error('Snapshot missing data');

  const states = db.collection('app_states');
  const snaps = db.collection('app_state_snapshots');
  const now = new Date();
  const existing = await states.findOne({ _id: V1_CASHFLOW_APP_ID });

  if (existing?.data) {
    await snaps.insertOne({
      appId: V1_CASHFLOW_APP_ID,
      sourceVersion: existing.version || 1,
      data: existing.data,
      createdAt: now,
      createdBy: updatedBy,
      label: `Auto-snapshot before restore (v${existing.version || 1})`,
      note: ''
    });
  }

  const stats = await snapshotUnitStats(db, target.data);
  const nextVersion = (existing?.version || 0) + 1;
  let env = await repairV1CashflowForRead(db, target.data);
  env = consolidateParadiseInEnvelope(env);
  const packed = await packV1CashflowRowData(db, env, { version: nextVersion, updatedBy });

  await states.updateOne(
    { _id: V1_CASHFLOW_APP_ID },
    {
      $set: {
        appId: V1_CASHFLOW_APP_ID,
        data: packed,
        version: nextVersion,
        updatedAt: now,
        updatedBy
      }
    },
    { upsert: true }
  );

  return {
    ok: true,
    version: nextVersion,
    soldUnitCount: stats.total,
    priorityUnitCount: stats.priority,
    byProject: stats.byProject,
    snapshotId: target._id?.toString?.() || null,
    snapshotAt: target.createdAt || null,
    snapshotLabel: target.label || ''
  };
}

/**
 * On Render boot: restore best pre-cutoff snapshot (Paradise / P009 weighted).
 */
export async function runV1AutoRestoreOnBoot(db) {
  const beforeRaw = String(V1_AUTO_RESTORE_BEFORE || '').trim();
  if (!beforeRaw) return null;

  const forceRun = String(V1_AUTO_RESTORE_FORCE_RUN || V1_AUTO_RESTORE_FORCE_RUN_DEFAULT || '').trim();
  const flagId = forceRun ? `v1_auto_restore:force:${forceRun}` : `v1_auto_restore:${beforeRaw}`;
  const flags = db.collection('platform_ops_flags');
  const prior = await flags.findOne({ _id: flagId });
  if (prior?.done) {
    console.log(`[v1-auto-restore] Already completed (${flagId})`);
    return prior;
  }

  const threshold = V1_AUTO_RESTORE_IF_CURRENT_UNITS_BELOW;
  const states = db.collection('app_states');
  const existing = await states.findOne({ _id: V1_CASHFLOW_APP_ID });
  let currentStats = { total: 0, priority: 0, byProject: {} };
  if (existing?.data) {
    currentStats = await snapshotUnitStats(db, existing.data);
  }

  const needsParadise = (currentStats.byProject?.P009 || 0) < 1;
  const needsData = currentStats.total < threshold || needsParadise;

  if (!forceRun && !needsData) {
    const skipped = {
      _id: flagId,
      done: true,
      skipped: true,
      reason: 'current_workbook_ok',
      currentUnits: currentStats.total,
      paradiseUnits: currentStats.byProject?.P009 || 0,
      threshold,
      at: new Date()
    };
    await flags.replaceOne({ _id: flagId }, skipped, { upsert: true });
    console.log(`[v1-auto-restore] Skipped — ${currentStats.total} sold units, P009=${currentStats.byProject?.P009 || 0}`);
    return skipped;
  }

  const picked = await pickBestV1SnapshotBefore(db, { before: beforeRaw, minPriority: forceRun || needsParadise ? 1 : 0 });
  if (!picked) {
    const failed = {
      _id: flagId,
      done: true,
      error: 'no_snapshot_before_cutoff',
      before: beforeRaw,
      currentUnits: currentStats.total,
      at: new Date()
    };
    await flags.replaceOne({ _id: flagId }, failed, { upsert: true });
    console.error(`[v1-auto-restore] No snapshot before ${beforeRaw}`);
    return failed;
  }

  console.log(
    `[v1-auto-restore] Restoring ${picked.soldUnitCount} units (P009=${picked.priorityUnitCount}) from ${picked.snapshot._id} (${picked.snapshot.createdAt})`
  );
  const result = await restoreV1CashflowFromSnapshot(db, picked.snapshot, 'v1-auto-restore-on-boot');
  const record = {
    _id: flagId,
    done: true,
    before: beforeRaw,
    forceRun: forceRun || null,
    priorUnits: currentStats.total,
    priorParadiseUnits: currentStats.byProject?.P009 || 0,
    ...result,
    at: new Date()
  };
  await flags.replaceOne({ _id: flagId }, record, { upsert: true });
  console.log(
    `[v1-auto-restore] Done — v${result.version}, ${result.soldUnitCount} units, P009=${result.byProject?.P009 || 0}`
  );
  return record;
}

/** Write consolidated Paradise (P009) rows into Mongo once so all clients load the correct project id. */
export async function persistParadiseWorkbookMerge(db) {
  const flagId = 'v1_persist_paradise_merge:2026-06-12';
  const flags = db.collection('platform_ops_flags');
  const prior = await flags.findOne({ _id: flagId });
  if (prior?.done) return prior;

  const states = db.collection('app_states');
  const row = await states.findOne({ _id: V1_CASHFLOW_APP_ID });
  if (!row?.data) {
    const skipped = { _id: flagId, done: true, skipped: true, reason: 'no_state', at: new Date() };
    await flags.replaceOne({ _id: flagId }, skipped, { upsert: true });
    return skipped;
  }

  const env = consolidateParadiseInEnvelope(await repairV1CashflowForRead(db, row.data));
  const p009Units = env.data?.P009?.units?.length || 0;
  if (p009Units < 1) {
    const skipped = { _id: flagId, done: true, skipped: true, reason: 'no_paradise_units', at: new Date() };
    await flags.replaceOne({ _id: flagId }, skipped, { upsert: true });
    return skipped;
  }

  const nextVersion = (row.version || 0) + 1;
  const packed = await packV1CashflowRowData(db, env, {
    version: nextVersion,
    updatedBy: 'paradise-merge-persist'
  });
  const now = new Date();
  await states.updateOne(
    { _id: V1_CASHFLOW_APP_ID },
    {
      $set: {
        appId: V1_CASHFLOW_APP_ID,
        data: packed,
        version: nextVersion,
        updatedAt: now,
        updatedBy: 'paradise-merge-persist'
      }
    }
  );
  const record = { _id: flagId, done: true, p009Units, version: nextVersion, at: now };
  await flags.replaceOne({ _id: flagId }, record, { upsert: true });
  console.log(`[paradise-merge-persist] Saved P009 with ${p009Units} sold units (v${nextVersion})`);
  return record;
}
