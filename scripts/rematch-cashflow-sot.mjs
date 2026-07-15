/**
 * Rematch all Tally-sourced cashflow actuals with Cashflow as source of truth:
 * Payment → outflow; Receipt → inflow; never leave Payment on inflow cats.
 * Writes remapped pack back to Mongo v1_cashflow.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import {
  unpackV1CashflowRowData,
  packV1CashflowRowData,
  V1_CASHFLOW_APP_ID,
} from '../server/lib/v1CashflowMongoPack.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const INFLOW = new Set([
  'Sales Revenue',
  'Equity Infusion',
  'Investor Funding',
  'Unsecured Loan',
  'Customer Collections',
  'Customer UL',
  'Other Income',
  'Other Inflow',
]);

function coerceMoney(v) {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function extractVt(a) {
  if (a.voucherType) return String(a.voucherType).trim();
  const m = /^\[([^\]]+)\]/.exec(String(a.note || ''));
  return m ? String(m[1] || '').trim() : '';
}
function applySot(a) {
  let cat1 = String(a.cat1 || '').trim() || 'Construction';
  let mapSrc = String(a.tallyMapSrc || '');
  let isInflow = INFLOW.has(cat1);
  const vt = extractVt(a);
  if (/^payment\b/i.test(vt)) {
    isInflow = false;
    if (INFLOW.has(cat1)) {
      if (/unsecured loan/i.test(cat1)) cat1 = 'Principal Repaid';
      else if (/investor funding|equity infusion/i.test(cat1)) cat1 = 'Principal Repaid';
      else cat1 = 'Construction';
      mapSrc = mapSrc ? `${mapSrc}+cf-sot-pay-out` : 'cf-sot-pay-out';
    }
  } else if (/^receipt\b/i.test(vt)) {
    isInflow = true;
    if (!INFLOW.has(cat1)) {
      const blob = `${a.gaL1 || ''} ${a.gaL2 || ''} ${a.gaL3Name || ''} ${cat1} ${a.party || ''}`;
      if (/-ul\b|customer ul/i.test(blob)) cat1 = 'Customer UL';
      else if (/customer|collection|sales|booking|milestone/i.test(blob)) cat1 = 'Customer Collections';
      else if (/unsecured|loan|funding|investor|promoter|equity/i.test(blob)) cat1 = 'Unsecured Loan';
      else cat1 = 'Other Income';
      mapSrc = mapSrc ? `${mapSrc}+cf-sot-rcpt-in` : 'cf-sot-rcpt-in';
    }
  }
  if (cat1 === 'Other Inflow') cat1 = 'Other Income';
  const mag = Math.abs(coerceMoney(a.amount));
  const amount = mag ? (isInflow ? mag : -mag) : coerceMoney(a.amount);
  return {
    ...a,
    cat1,
    amount,
    tallyMapSrc: mapSrc,
    voucherType: vt || a.voucherType || '',
    codingAuthority: 'cashflow',
  };
}

const dry = process.argv.includes('--dry');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 45000 });
await client.connect();
const db = client.db(process.env.MONGODB_DB_NAME || 'golden_abodes');
const states = db.collection('app_states');
const doc = await states.findOne({ _id: V1_CASHFLOW_APP_ID || 'v1_cashflow' });
if (!doc?.data) throw new Error('v1_cashflow missing');

const env = await unpackV1CashflowRowData(db, doc.data);
let touchLines = 0;
let touchProjects = 0;
const samples = [];

for (const pid of Object.keys(env.data || {})) {
  const cfg = env.data[pid];
  if (!cfg?.actuals?.length) continue;
  let local = 0;
  cfg.actuals = cfg.actuals.map((a) => {
    if (!a || a.source !== 'tally') return a;
    const before = { cat1: a.cat1, amount: coerceMoney(a.amount) };
    const next = applySot(a);
    if (next.cat1 !== before.cat1 || coerceMoney(next.amount) !== before.amount) {
      local++;
      if (samples.length < 20) {
        samples.push({
          pid,
          party: a.party,
          date: a.date,
          before,
          after: { cat1: next.cat1, amount: coerceMoney(next.amount), map: next.tallyMapSrc },
        });
      }
    }
    return next;
  });
  if (local) {
    touchProjects++;
    touchLines += local;
  }
}

console.log('Projects touched', touchProjects, 'lines remapped', touchLines);
console.log('Samples', JSON.stringify(samples, null, 2));

if (dry) {
  console.log('DRY RUN — no write');
  await client.close();
  process.exit(0);
}

env.v = Math.max(Number(env.v) || 0, 64);
env.ts = new Date().toISOString();
const nextVersion = (Number(doc.version) || 0) + 1;
const packed = await packV1CashflowRowData(db, env, {
  version: nextVersion,
  updatedBy: 'cashflow-sot-rematch',
});
await states.updateOne(
  { _id: doc._id },
  {
    $set: {
      data: packed,
      version: nextVersion,
      updatedAt: new Date(),
      updatedBy: 'cashflow-sot-rematch',
    },
  },
);
console.log('Saved v1_cashflow version', nextVersion);
await client.close();
