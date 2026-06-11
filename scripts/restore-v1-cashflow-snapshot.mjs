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
  packV1CashflowRowData,
  countSoldUnitsInEnvelope
} from '../server/lib/v1CashflowMongoPack.js';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'golden_abodes';

function parseArgs() {
  const args = { list: false, pick: 1 };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--list') args.list = true;
    else if (a === '--pick') args.pick = Math.max(1, Number(process.argv[++i]) || 1);
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

  const ix = Math.min(rows.length, args.pick) - 1;
  const target = rows[ix];
  const unitCount = await unitsInStoredData(db, target.data);
  console.log(`\nRestoring snapshot #${ix + 1} (${unitCount} sold units)…`);

  const existing = await states.findOne({ _id: V1_CASHFLOW_APP_ID });
  const now = new Date();
  if (existing?.data) {
    await snaps.insertOne({
      appId: V1_CASHFLOW_APP_ID,
      sourceVersion: existing.version || 1,
      data: existing.data,
      createdAt: now,
      createdBy: 'restore-v1-cashflow-snapshot.mjs',
      label: `Auto-snapshot before CLI restore (v${existing.version || 1})`,
      note: ''
    });
  }

  const nextVersion = (existing?.version || 0) + 1;
  const env = await repairV1CashflowForRead(db, target.data);
  const packed = await packV1CashflowRowData(db, env, {
    version: nextVersion,
    updatedBy: 'restore-v1-cashflow-snapshot.mjs'
  });

  await states.updateOne(
    { _id: V1_CASHFLOW_APP_ID },
    {
      $set: {
        appId: V1_CASHFLOW_APP_ID,
        data: packed,
        version: nextVersion,
        updatedAt: now,
        updatedBy: 'restore-v1-cashflow-snapshot.mjs'
      }
    },
    { upsert: true }
  );

  console.log('Restored. New version:', nextVersion);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
