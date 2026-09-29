#!/usr/bin/env node
/**
 * Attach the shipped V3 coding master (ga_accounting_categories.js) to live
 * v1_cashflow Mongo state so XML coding uses the 8.8.2026 workbook for all users.
 *
 *   node scripts/upload-v1-acct-master-to-mongo.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'node:vm';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import {
  packV1CashflowRowData,
  repairV1CashflowForRead,
  V1_CASHFLOW_APP_ID
} from '../server/lib/v1CashflowMongoPack.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MASTER_JS = path.join(root, 'client', 'public', 'legacy', 'ga_accounting_categories.js');
const MASTER_FILE_NAME = 'GA Accounting Categories V3 Master 8.8.2026.xlsx';

function loadDotEnv() {
  for (const name of ['.env', '.env.txt']) {
    const p = path.join(root, name);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

function loadAcctMasterFromJs(jsPath) {
  const code = fs.readFileSync(jsPath, 'utf8');
  const ctx = {};
  vm.runInNewContext(code, ctx, { filename: jsPath });
  if (!ctx.GA_ACCT_L3_BY_CODE || typeof ctx.GA_ACCT_L3_BY_CODE !== 'object') {
    throw new Error('ga_accounting_categories.js did not define GA_ACCT_L3_BY_CODE');
  }
  const keyCount = Object.keys(ctx.GA_ACCT_L3_BY_CODE).length;
  return {
    schema: ctx.GA_ACCT_SCHEMA || 'v3',
    uploadedAt: Date.now(),
    fileName: MASTER_FILE_NAME,
    source: 'server',
    keyCount,
    GA_ACCT_SCHEMA: ctx.GA_ACCT_SCHEMA || 'v3',
    GA_ACCT_L3_BY_CODE: ctx.GA_ACCT_L3_BY_CODE,
    GA_ACCT_L3_BY_SHORT: ctx.GA_ACCT_L3_BY_SHORT || {},
    GA_ACCT_CF_L1_BUILDING: ctx.GA_ACCT_CF_L1_BUILDING || [],
    GA_ACCT_CF_L1_COMMON: ctx.GA_ACCT_CF_L1_COMMON || [],
    GA_ACCT_PL_L1_BUILDING: ctx.GA_ACCT_PL_L1_BUILDING || [],
    GA_ACCT_PL_L1_COMMON: ctx.GA_ACCT_PL_L1_COMMON || [],
    GA_ACCT_BUILDING_PREFIXES: ctx.GA_ACCT_BUILDING_PREFIXES || []
  };
}

async function main() {
  loadDotEnv();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }
  const dbName = process.env.MONGODB_DB_NAME || 'golden_abodes';
  const acctMaster = loadAcctMasterFromJs(MASTER_JS);
  console.log(`Master: ${acctMaster.keyCount} keys from ${MASTER_JS}`);

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 25000 });
  await client.connect();
  const db = client.db(dbName);
  const states = db.collection('app_states');
  const snaps = db.collection('app_state_snapshots');
  const appId = V1_CASHFLOW_APP_ID;
  const now = new Date();

  try {
    const existing = await states.findOne({ _id: appId });
    if (!existing?.data) {
      throw new Error('v1_cashflow app_states row missing');
    }
    await snaps.insertOne({
      appId,
      sourceVersion: existing.version || 1,
      data: existing.data,
      createdAt: now,
      createdBy: 'upload-v1-acct-master-to-mongo.mjs',
      label: `Auto-snapshot before V3 master ${MASTER_FILE_NAME} (v${existing.version || 1})`,
      note: ''
    });

    const env = await repairV1CashflowForRead(db, existing.data);
    env.acctMaster = acctMaster;
    if (!env.v || Number(env.v) < 99) env.v = 99;
    env.ts = Date.now();

    const nextVersion = (existing.version || 0) + 1;
    const toSave = await packV1CashflowRowData(db, env, {
      version: nextVersion,
      updatedBy: 'upload-v1-acct-master-to-mongo.mjs'
    });

    await states.updateOne(
      { _id: appId },
      {
        $set: {
          appId,
          data: toSave,
          version: nextVersion,
          updatedAt: now,
          updatedBy: 'upload-v1-acct-master-to-mongo.mjs'
        }
      }
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          appId,
          version: nextVersion,
          keyCount: acctMaster.keyCount,
          fileName: acctMaster.fileName,
          packedHasAcctMasterGzip: !!(toSave && toSave.acctMasterGzip)
        },
        null,
        2
      )
    );
  } finally {
    await client.close();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
