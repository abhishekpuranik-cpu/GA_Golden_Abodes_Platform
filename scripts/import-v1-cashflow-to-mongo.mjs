#!/usr/bin/env node
/**
 * Push a Cashflow V1 JSON (Drive backup, local export, or ga_cf_v1 snapshot) into Mongo app_states v1_cashflow.
 *
 * Usage:
 *   Set MONGODB_URI (and optionally MONGODB_DB_NAME, default golden_abodes), then:
 *     node scripts/import-v1-cashflow-to-mongo.mjs path/to/snapshot.json
 *
 *   Or call your live API (no local Mongo URI needed):
 *     node scripts/import-v1-cashflow-to-mongo.mjs path/to/snapshot.json --http https://ga-golden-abodes-platform.onrender.com
 *
 * Options:
 *   --merge   Merge project keys with existing Mongo doc (default is --replace: Mongo becomes this file).
 *   --http URL   POST to /api/apps/v1_cashflow/import instead of writing Mongo directly.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

function parseArgs(argv) {
  const args = { file: null, merge: false, http: null };
  const rest = [];
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--merge') args.merge = true;
    else if (a === '--http') args.http = argv[++i] || '';
    else if (!a.startsWith('-')) rest.push(a);
  }
  args.file = rest[0] || null;
  return args;
}

function isEnvelopeShape(o) {
  return o && typeof o === 'object' && o.data !== undefined && typeof o.data === 'object' && !Array.isArray(o.data);
}

function normalizeEnvelope(e) {
  if (!e || typeof e !== 'object') throw new Error('Invalid envelope');
  if (e.data === undefined) throw new Error('Envelope missing `data` (workbook map)');
  return {
    v: e.v ?? 4,
    ts: e.ts ?? Date.now(),
    data: e.data,
    manualProjs: Array.isArray(e.manualProjs) ? e.manualProjs : [],
    ui:
      e.ui && typeof e.ui === 'object'
        ? e.ui
        : {
            projRoot: '__all__',
            phase: '__all__',
            building: '__all__',
            projectGroup: '__all__'
          }
  };
}

/** Accepts: raw Cashflow envelope, or Drive-style { ga_cf_v1: object|string }, or wrapper with ga_cf_v1. */
function extractCashflowEnvelope(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Root JSON must be an object');
  if (raw.ga_cf_v1 != null) {
    const inner = typeof raw.ga_cf_v1 === 'string' ? JSON.parse(raw.ga_cf_v1) : raw.ga_cf_v1;
    return normalizeEnvelope(inner);
  }
  if (isEnvelopeShape(raw)) return normalizeEnvelope(raw);
  throw new Error('Unrecognized JSON shape: need { data: {...} } or { ga_cf_v1: {...} }');
}

async function importViaHttp(baseUrl, envelope, mode, noteLabel) {
  const base = String(baseUrl).replace(/\/$/, '');
  const url = `${base}/api/apps/v1_cashflow/import`;
  const body = {
    data: envelope,
    mode,
    updatedBy: 'import-v1-cashflow-to-mongo.mjs',
    note: noteLabel
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  if (!res.ok) throw new Error(json.error || text);
  return json;
}

async function importViaMongo(uri, dbName, envelope, mode) {
  const { packV1CashflowRowData, mergeV1CashflowEnvelopes, repairV1CashflowForRead, V1_CASHFLOW_APP_ID } =
    await import(path.join(rootDir, 'server', 'lib', 'v1CashflowMongoPack.js'));

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);
  const states = db.collection('app_states');
  const snaps = db.collection('app_state_snapshots');
  const appId = V1_CASHFLOW_APP_ID;
  const now = new Date();

  try {
    const existing = await states.findOne({ _id: appId });
    if (existing?.data) {
      await snaps.insertOne({
        appId,
        sourceVersion: existing.version || 1,
        data: existing.data,
        createdAt: now,
        createdBy: 'import-v1-cashflow-to-mongo.mjs',
        label: `Auto-snapshot before import (v${existing.version || 1})`,
        note: ''
      });
    }

    let merged = envelope;
    if (mode === 'merge' && existing?.data) {
      const base = await repairV1CashflowForRead(db, existing.data);
      merged = mergeV1CashflowEnvelopes(base, envelope);
    }

    const nextVersion = (existing?.version || 0) + 1;
    const toSave = await packV1CashflowRowData(db, merged, {
      version: nextVersion,
      updatedBy: 'import-v1-cashflow-to-mongo.mjs'
    });

    await states.updateOne(
      { _id: appId },
      {
        $set: {
          appId,
          data: toSave,
          version: nextVersion,
          updatedAt: now,
          updatedBy: 'import-v1-cashflow-to-mongo.mjs'
        }
      },
      { upsert: true }
    );

    return { ok: true, appId, version: nextVersion, updatedAt: now, mode };
  } finally {
    await client.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    console.error(`Usage: node scripts/import-v1-cashflow-to-mongo.mjs <file.json> [--merge] [--http BASE_URL]`);
    console.error('');
    console.error('Examples:');
    console.error('  set MONGODB_URI=... && node scripts/import-v1-cashflow-to-mongo.mjs backup.json');
    console.error('  node scripts/import-v1-cashflow-to-mongo.mjs backup.json --http https://ga-golden-abodes-platform.onrender.com');
    process.exit(1);
  }

  const abs = path.isAbsolute(args.file) ? args.file : path.join(process.cwd(), args.file);
  if (!fs.existsSync(abs)) {
    console.error('File not found:', abs);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const envelope = extractCashflowEnvelope(raw);
  const nProjects = Object.keys(envelope.data || {}).length;
  const mode = args.merge ? 'merge' : 'replace';
  const noteLabel = `Imported from ${path.basename(abs)}`;

  console.error(`Envelope: ${nProjects} project id(s) in data, mode=${mode}`);

  let result;
  if (args.http) {
    result = await importViaHttp(args.http, envelope, mode, noteLabel);
  } else {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      console.error('Missing MONGODB_URI. Set it to your Atlas connection string, or use --http https://<your-app>');
      process.exit(1);
    }
    const dbName = process.env.MONGODB_DB_NAME || 'golden_abodes';
    result = await importViaMongo(uri, dbName, envelope, mode);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
