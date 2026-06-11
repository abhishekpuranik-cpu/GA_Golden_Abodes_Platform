import {
  V1_CASHFLOW_APP_ID,
  repairV1CashflowForRead,
  packV1CashflowRowData,
  countSoldUnitsInEnvelope
} from './v1CashflowMongoPack.js';
import {
  V1_AUTO_RESTORE_BEFORE,
  V1_AUTO_RESTORE_IF_CURRENT_UNITS_BELOW,
  V1_AUTO_RESTORE_FORCE_RUN,
  V1_AUTO_RESTORE_FORCE_RUN_DEFAULT
} from './config.js';

async function unitsInStoredData(db, stored) {
  if (!stored) return 0;
  const env = await repairV1CashflowForRead(db, stored);
  return countSoldUnitsInEnvelope(env);
}

/**
 * Pick the snapshot before `before` with the highest sold-unit count (tie → latest createdAt).
 */
export async function pickBestV1SnapshotBefore(db, { before, minUnits = 1, scanLimit = 100 }) {
  const beforeDate = before instanceof Date ? before : new Date(before);
  if (Number.isNaN(beforeDate.getTime())) {
    throw new Error(`Invalid before date: ${before}`);
  }

  const rows = await db
    .collection('app_state_snapshots')
    .find({ appId: V1_CASHFLOW_APP_ID, createdAt: { $lt: beforeDate } })
    .sort({ createdAt: -1 })
    .limit(scanLimit)
    .toArray();

  let best = null;
  let bestUnits = 0;
  for (const r of rows) {
    const u = await unitsInStoredData(db, r.data);
    if (u < minUnits) continue;
    if (u > bestUnits || (u === bestUnits && best && r.createdAt > best.createdAt)) {
      best = r;
      bestUnits = u;
    }
  }
  return best ? { snapshot: best, soldUnitCount: bestUnits } : null;
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

  const unitCount = await unitsInStoredData(db, target.data);
  const nextVersion = (existing?.version || 0) + 1;
  const env = await repairV1CashflowForRead(db, target.data);
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
    soldUnitCount: unitCount,
    snapshotId: target._id?.toString?.() || null,
    snapshotAt: target.createdAt || null,
    snapshotLabel: target.label || ''
  };
}

/**
 * On Render boot: if V1_AUTO_RESTORE_BEFORE is set and workbook is nearly empty,
 * restore the richest snapshot from before that cutoff (e.g. this morning before layout deploy).
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
  let currentUnits = 0;
  if (existing?.data) {
    currentUnits = countSoldUnitsInEnvelope(await repairV1CashflowForRead(db, existing.data));
  }

  if (!forceRun && currentUnits >= threshold) {
    const skipped = {
      _id: flagId,
      done: true,
      skipped: true,
      reason: 'current_units_above_threshold',
      currentUnits,
      threshold,
      at: new Date()
    };
    await flags.replaceOne({ _id: flagId }, skipped, { upsert: true });
    console.log(`[v1-auto-restore] Skipped — ${currentUnits} sold units (threshold ${threshold})`);
    return skipped;
  }

  const picked = await pickBestV1SnapshotBefore(db, { before: beforeRaw, minUnits: 1 });
  if (!picked) {
    const failed = {
      _id: flagId,
      done: true,
      error: 'no_snapshot_before_cutoff',
      before: beforeRaw,
      currentUnits,
      at: new Date()
    };
    await flags.replaceOne({ _id: flagId }, failed, { upsert: true });
    console.error(`[v1-auto-restore] No snapshot before ${beforeRaw}`);
    return failed;
  }

  console.log(
    `[v1-auto-restore] Restoring ${picked.soldUnitCount} units from snapshot ${picked.snapshot._id} (${picked.snapshot.createdAt})`
  );
  const result = await restoreV1CashflowFromSnapshot(db, picked.snapshot, 'v1-auto-restore-on-boot');
  const record = {
    _id: flagId,
    done: true,
    before: beforeRaw,
    forceRun: forceRun || null,
    priorUnits: currentUnits,
    ...result,
    at: new Date()
  };
  await flags.replaceOne({ _id: flagId }, record, { upsert: true });
  console.log(`[v1-auto-restore] Done — version ${result.version}, ${result.soldUnitCount} sold units`);
  return record;
}
