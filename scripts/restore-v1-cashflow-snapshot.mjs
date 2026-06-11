#!/usr/bin/env node
/**
 * Emergency restore v1_cashflow from app_state_snapshots (MongoDB).
 *
 *   MONGODB_URI="..." node scripts/restore-v1-cashflow-snapshot.mjs
 *   MONGODB_URI="..." node scripts/restore-v1-cashflow-snapshot.mjs --list
 *   MONGODB_URI="..." node scripts/restore-v1-cashflow-snapshot.mjs --pick 2
 */
import { MongoClient } from 'mongodb';
import {
  V1_CASHFLOW_APP_ID,
  repairV1CashflowForRead,
  countSoldUnitsInEnvelope
} from '../server/lib/v1CashflowMongoPack.js';
import {
  pickBestV1SnapshotBefore,
  restoreV1CashflowFromSnapshot
} from '../server/lib/v1CashflowAutoRestore.js';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'golden_abodes';

function parseArgs() {
  const args = { list: false, pick: 1, bestBefore: null };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--list') args.list = true;
    else if (a === '--pick') args.pick = Math.max(1, Number(process.argv[++i]) || 1);
    else if (a === '--best-before') args.bestBefore = process.argv[++i] || '';
  }
  return args;
}

async function unitsInStoredData(db, stored) {
  if (!stored) return 0;
  const env = await repairV1CashflowForRead(db, stored);
  return countSoldUnitsInEnvelope(env);
}

async function main() {
  if (!uri) {
    console.error('Set MONGODB_URI');
    process.exit(1);
  }
  const args = parseArgs();
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const snaps = db.collection('app_state_snapshots');
  const states = db.collection('app_states');

  const rows = await snaps
    .find({ appId: V1_CASHFLOW_APP_ID })
    .sort({ createdAt: -1 })
    .limit(25)
    .toArray();

  if (!rows.length) {
    console.error('No snapshots for', V1_CASHFLOW_APP_ID);
    await client.close();
    process.exit(1);
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const u = await unitsInStoredData(db, r.data);
    console.log(
      `${i + 1}. ${r.createdAt?.toISOString?.() || r.createdAt} · v${r.sourceVersion || '?'} · ${u} units · ${r.label || ''}`
    );
  }

  if (args.list) {
    await client.close();
    return;
  }

  let target;
  let unitCount;
  if (args.bestBefore) {
    const picked = await pickBestV1SnapshotBefore(db, { before: args.bestBefore });
    if (!picked) {
      console.error('No snapshot with units before', args.bestBefore);
      await client.close();
      process.exit(1);
    }
    target = picked.snapshot;
    unitCount = picked.soldUnitCount;
    console.log(`\nBest before ${args.bestBefore}: ${unitCount} units @ ${target.createdAt}`);
  } else {
    const ix = Math.min(rows.length, args.pick) - 1;
    target = rows[ix];
    unitCount = await unitsInStoredData(db, target.data);
    console.log(`\nRestoring snapshot #${ix + 1} (${unitCount} sold units)…`);
  }

  const result = await restoreV1CashflowFromSnapshot(db, target, 'restore-v1-cashflow-snapshot.mjs');
  console.log('Restored. New version:', result.version);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
