/**
 * Build client/public/legacy/ga_accounting_categories.js from
 * GA Accounting Categories V2.xlsx (sheet "Outflow").
 *
 * Set GA_ACCT_XLSX to the workbook path (defaults try common sibling paths).
 *
 * Uses GA_Cashflow_V1_React GA_ACCT_L3_BY_CODE merge for legacyCat1 when L3 codes match;
 * heuristic legacyCat1 for net-new V2 chains (P/Q/R/S/T/U/V).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import { GA_ACCT_L3_BY_CODE as V1_MAP } from '../../GA_Cashflow_V1_React/src/domain/gaAccountingCategories.data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.join(__dirname, '..');
const outFile = path.join(platformRoot, 'client', 'public', 'legacy', 'ga_accounting_categories.js');
const reactOutFile = path.join(platformRoot, '..', 'GA_Cashflow_V1_React', 'src', 'domain', 'gaAccountingCategories.data.js');

function sortedL3Keys(map) {
  return Object.keys(map || {}).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function candidateXlsxPaths() {
  const fromEnv = process.env.GA_ACCT_XLSX && process.env.GA_ACCT_XLSX.trim();
  if (fromEnv) return [path.resolve(fromEnv)];
  return [
    path.join(platformRoot, '..', 'Golden Abodes', 'Accounting', 'GA Accounting Categories V2.xlsx'),
    path.join(platformRoot, '..', '..', 'Golden Abodes', 'Accounting', 'GA Accounting Categories V2.xlsx'),
    path.join('C:', 'Users', 'HP', 'OneDrive', 'Projects', 'Golden Abodes', 'Accounting', 'GA Accounting Categories V2.xlsx'),
  ];
}

function inferLegacyCat1(v1Legacy, { l3, l1Letter, costHead }) {
  if (v1Legacy) return v1Legacy;
  const h = String(costHead || '').toLowerCase();
  const lc = String(l1Letter || '').toUpperCase();
  const pk = String(l3 || '').toUpperCase();

  if (pk.startsWith('P')) {
    if (h.includes('land broker')) return 'Land';
    return 'Regulatory & Consulting';
  }
  if (pk.startsWith('Q')) return 'Consultant';
  if (pk.startsWith('R')) return 'Construction';
  if (pk.startsWith('S')) return 'NOC';
  if (pk.startsWith('T')) return 'Construction';
  if (pk.startsWith('U')) return 'Land';
  if (pk.startsWith('V')) return 'Construction';

  /* Default outflow rollup if letter known */
  if (lc >= 'H' && lc <= 'Z') return 'Construction';
  return '';
}

function parseWorkbook(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) throw new Error('Empty worksheet');
  const header = rows[0].map((c) => String(c ?? '').replace(/\r?\n/g, ' ').trim());
  const iL1c = header.findIndex((h) => h.includes('L1') && h.includes('Code'));
  const iL1n = header.findIndex((h) => h.includes('L1') && (h.includes('Category') || h.includes('Cat')));
  const iL2c = header.findIndex((h) => h.includes('L2') && h.includes('Code'));
  const iL2n = header.findIndex((h) => h.includes('L2') && (h.includes('Category') || h.includes('Cat')));
  const iL3 = header.findIndex((h) => h.includes('L3') && h.includes('Code'));
  const iL3Head = header.findIndex(
    (h) => /L3/i.test(h) && (/Cost|Head/i.test(h) || /category/i.test(h)),
  );

  if (iL3 < 0) throw new Error('Could not find L3 Code column');

  let curL1 = '';
  let curL1Name = '';
  const obj = {};

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const l1c = String(row[iL1c] ?? '').trim();
    const l1n = String(row[iL1n] ?? '').trim();
    if (l1c) curL1 = l1c;
    if (l1n) curL1Name = l1n;

    const l3 = String(row[iL3] ?? '').trim();
    if (!l3) continue;

    const l2c = String(row[iL2c] ?? '').trim();
    const l2n = String(row[iL2n] ?? '').trim();
    const l3Head = String(row[iL3Head >= 0 ? iL3Head : iL3 + 1] ?? '').trim();
    const tail = [];

    header.forEach((h, ix) => {
      if (/description/i.test(h)) tail.push(String(row[ix] ?? '').trim());
    });
    const desc = tail.filter(Boolean)[0] || '';

    /* flow from GA letter buckets A-G inflow */
    const letter = String(curL1 || '').trim().charAt(0).toUpperCase();
    let flow = 'out';
    if (/^[A-G]$/.test(letter)) flow = 'in';

    const v1row = V1_MAP[l3];
    const legacy = inferLegacyCat1(v1row && v1row.legacyCat1 ? v1row.legacyCat1 : '', {
      l3,
      l1Letter: letter,
      costHead: l3Head,
    });

    obj[l3] = {
      l1: curL1,
      l1Name: curL1Name || (v1row && v1row.l1Name) || '',
      l2: l2c,
      l2Name: l2n,
      l3,
      l3Name: l3Head,
      desc,
      flow,
      legacyCat1: legacy || (v1row && v1row.legacyCat1) || (flow === 'in' ? 'Other Inflow' : 'Construction'),
    };
  }
  return obj;
}

function main() {
  const candidates = candidateXlsxPaths();
  let xlsxPath = '';
  for (const pth of candidates) {
    try {
      if (pth && fs.existsSync(pth)) {
        xlsxPath = pth;
        break;
      }
    } catch {
      /* ignore */
    }
  }

  if (!xlsxPath) {
    console.warn(
      `build-ga-accounting-categories-js: workbook not found. Tried:\n  ${candidates.join('\n  ')}\nSet GA_ACCT_XLSX.`,
    );
    process.exit(0);
  }

  console.log(`build-ga-accounting-categories-js: reading ${xlsxPath}`);
  const wb = XLSX.readFile(xlsxPath, { cellDates: true });
  const sheetName = wb.SheetNames.includes('Outflow') ? 'Outflow' : outflowSheetNameFallback(wb);
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('No worksheet found for GA categories');

  const GA_ACCT_L3_BY_CODE = parseWorkbook(ws);

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  /* Global for legacy HTML `<script src="ga_accounting_categories.js">` — no ES module wrapper */
  const body = `'use strict';

/* Generated by scripts/build-ga-accounting-categories-js.mjs — do not hand-edit */

var GA_ACCT_L3_BY_CODE = ${JSON.stringify(GA_ACCT_L3_BY_CODE, null, 2)};
`;
  fs.writeFileSync(outFile, body, 'utf8');

  const sortedKeys = sortedL3Keys(GA_ACCT_L3_BY_CODE);
  fs.mkdirSync(path.dirname(reactOutFile), { recursive: true });
  const reactBody = `/* Generated by scripts/build-ga-accounting-categories-js.mjs — do not hand-edit */

export const GA_ACCT_L3_BY_CODE = ${JSON.stringify(GA_ACCT_L3_BY_CODE, null, 2)};

export const GA_ACCT_L3_SORTED_KEYS = ${JSON.stringify(sortedKeys)};
`;
  fs.writeFileSync(reactOutFile, reactBody, 'utf8');

  console.log(
    `build-ga-accounting-categories-js: wrote ${Object.keys(GA_ACCT_L3_BY_CODE).length} L3 codes → ${outFile} and ${reactOutFile}`,
  );
}

function outflowSheetNameFallback(wb) {
  const n = (wb.SheetNames || []).find((s) => /outflow/i.test(s));
  return n || wb.SheetNames[0];
}

main();
