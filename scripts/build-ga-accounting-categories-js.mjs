/**
 * Build client/public/legacy/ga_accounting_categories.js from
 * GA Accounting Categories V3 workbook (Building + Common master sheets).
 *
 * Set GA_ACCT_XLSX to the workbook path. Defaults try:
 *   data/GA_Accounting_Categories_V3.xlsx
 *   Downloads/Coding (1).xlsx
 * Falls back to V2 Outflow sheet when V3 sheets are absent.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.join(__dirname, '..');
const outFile = path.join(platformRoot, 'client', 'public', 'legacy', 'ga_accounting_categories.js');
const reactOutFile = path.join(platformRoot, '..', 'GA_Cashflow_V1_React', 'src', 'domain', 'gaAccountingCategories.data.js');

const V3_BUILDING_SHEET = 'Master Sheet for Building';
const V3_COMMON_SHEET = 'Master Sheet For Common';

function sortedKeys(map) {
  return Object.keys(map || {}).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function candidateXlsxPaths() {
  const fromEnv = process.env.GA_ACCT_XLSX && process.env.GA_ACCT_XLSX.trim();
  if (fromEnv) return [path.resolve(fromEnv)];
  return [
    path.join(platformRoot, 'data', 'GA_Accounting_Categories_V3.xlsx'),
    path.join('C:', 'Users', 'HP', 'Downloads', 'Coding (1).xlsx'),
    path.join(platformRoot, '..', 'Golden Abodes', 'Accounting', 'GA Accounting Categories V3 Master.xlsx'),
    path.join(platformRoot, '..', 'Golden Abodes', 'Accounting', 'GA Accounting Categories V2.xlsx'),
    path.join('C:', 'Users', 'HP', 'OneDrive', 'Projects', 'Golden Abodes', 'Accounting', 'GA Accounting Categories V2.xlsx'),
  ];
}

function yesNo(v) {
  return String(v ?? '').trim().toLowerCase() === 'yes';
}

function clean(v) {
  return String(v ?? '').trim();
}

/** Extract short ledger code like B1-1 from a CF/PL full string. */
function extractShortCode(fullStr) {
  const t = clean(fullStr);
  if (!t || t === '0') return '';
  const m = t.match(/\b([A-Z]\d+-\d+)\b/);
  return m ? m[1] : '';
}

function inferFlow(l1Letter, l1Name, scope) {
  const lc = clean(l1Letter).toUpperCase();
  const name = clean(l1Name).toLowerCase();
  if (scope === 'common' && lc === 'Z') return 'cash';
  if (/collection|revenue|sales|funding|loan|inflow|receipt|equity|investor|unsecured|customer/i.test(name)) {
    if (/expense|cost|paid|tax|fee|construction|marketing|interest|principal|land|consult/i.test(name)) {
      /* mixed keyword — use letter */
    } else return 'in';
  }
  if (/^[A-G]$/.test(lc) && scope === 'building') {
    if (lc === 'B') return 'in';
    if (lc === 'A') return 'in';
    return 'out';
  }
  if (/^[A-G]$/.test(lc)) return 'in';
  return 'out';
}

function inferLegacyCat1({ l1Name, flow, scope }) {
  const n = clean(l1Name);
  const nl = n.toLowerCase();
  if (flow === 'in') {
    if (nl.includes('customer collection')) return 'Customer Collections';
    if (nl.includes('sales revenue')) return 'Sales Revenue';
    if (nl.includes('equity') || nl.includes('promoter')) return 'Equity Infusion';
    if (nl.includes('investor')) return 'Investor Funding';
    if (nl.includes('unsecured')) return 'Unsecured Loan';
    return 'Other Inflow';
  }
  if (nl.includes('project acquisition') || nl.includes('land')) return 'Land';
  if (nl.includes('regulatory')) return 'Regulatory & Consulting';
  if (nl.includes('consult')) return 'Consultant';
  if (nl.includes('noc')) return 'NOC';
  if (nl.includes('marketing')) return 'Marketing';
  if (nl.includes('g&a') || nl.includes('g a') || nl.includes('dm fee')) return 'GA DM Fee';
  if (nl.includes('interest')) return 'Interest Paid';
  if (nl.includes('principal') || nl.includes('debt')) return 'Principal Repaid';
  if (nl.includes('construction') || nl.includes('show flat') || nl.includes('sales office')) return 'Construction';
  if (scope === 'common') return 'Construction';
  return 'Construction';
}

function scopedL1Label(scope, l1Name) {
  const label = clean(l1Name);
  if (!label) return '';
  return scope === 'common' ? `Common · ${label}` : `Building · ${label}`;
}

function parseV3MasterSheet(ws, scope, prefix) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const entries = {};
  const cfL1Order = [];
  const plL1Order = [];
  const cfL1Seen = new Set();
  const plL1Seen = new Set();

  let curL1 = '';
  let curL1Name = '';
  let curL2 = '';
  let curL2Name = '';

  for (let r = 5; r < rows.length; r++) {
    const row = rows[r] || [];
    const cfApplicable = yesNo(row[0]);
    const plApplicable = yesNo(row[1]);

    if (row[2]) {
      curL1 = clean(row[2]);
      curL1Name = clean(row[3]);
    }
    if (row[4]) {
      curL2 = clean(row[4]);
      curL2Name = clean(row[5]);
    }

    const l3CodeNum = clean(row[6]);
    const l3Name = clean(row[7]);
    if (!l3Name) continue;

    const desc = clean(row[8]);
    const cfL1 = clean(row[9]);
    const cfL2 = clean(row[10]);
    const cfL3 = clean(row[11]);
    const plL1 = clean(row[12]);
    const plL2 = clean(row[13]);
    const plL3 = clean(row[14]);

    const shortCode =
      extractShortCode(cfL3) ||
      extractShortCode(plL3) ||
      (curL1 && l3CodeNum ? `${curL1}${curL2}-${l3CodeNum}` : '');

    if (!shortCode) continue;

    const masterKey = `${prefix}|${shortCode}`;
    const flow = inferFlow(curL1, curL1Name, scope);
    const legacyCat1 = inferLegacyCat1({ l1Name: curL1Name, flow, scope });

    const entry = {
      schema: 'v3',
      scope,
      prefix,
      masterKey,
      shortCode,
      cfApplicable,
      plApplicable,
      l1: curL1,
      l1Name: curL1Name,
      l2: curL2,
      l2Name: curL2Name,
      l3: shortCode,
      l3Name,
      desc,
      cfL1,
      cfL2,
      cfL3,
      plL1,
      plL2,
      plL3,
      cfL1Label: scopedL1Label(scope, curL1Name),
      plL1Label: scopedL1Label(scope, curL1Name),
      flow,
      legacyCat1,
    };

    entries[masterKey] = entry;

    if (cfApplicable && curL1Name) {
      const col = entry.cfL1Label;
      if (!cfL1Seen.has(col)) {
        cfL1Seen.add(col);
        cfL1Order.push({ scope, l1: curL1, l1Name: curL1Name, label: col, flow });
      }
    }
    if (plApplicable && curL1Name) {
      const col = entry.plL1Label;
      if (!plL1Seen.has(col)) {
        plL1Seen.add(col);
        plL1Order.push({ scope, l1: curL1, l1Name: curL1Name, label: col });
      }
    }
  }

  return { entries, cfL1Order, plL1Order };
}

function parseV2Outflow(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) throw new Error('Empty worksheet');
  const header = rows[0].map((c) => String(c ?? '').replace(/\r?\n/g, ' ').trim());
  const iL1c = header.findIndex((h) => h.includes('L1') && h.includes('Code'));
  const iL1n = header.findIndex((h) => h.includes('L1') && (h.includes('Category') || h.includes('Cat')));
  const iL2c = header.findIndex((h) => h.includes('L2') && h.includes('Code'));
  const iL2n = header.findIndex((h) => h.includes('L2') && (h.includes('Category') || h.includes('Cat')));
  const iL3 = header.findIndex((h) => h.includes('L3') && h.includes('Code'));
  const iL3Head = header.findIndex((h) => /L3/i.test(h) && (/Cost|Head/i.test(h) || /category/i.test(h)));

  if (iL3 < 0) throw new Error('Could not find L3 Code column');

  let curL1 = '';
  let curL1Name = '';
  const entries = {};

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
    const letter = String(curL1 || '').trim().charAt(0).toUpperCase();
    const flow = /^[A-G]$/.test(letter) ? 'in' : 'out';
    const masterKey = `A|${l3}`;

    entries[masterKey] = {
      schema: 'v2',
      scope: 'building',
      prefix: 'A',
      masterKey,
      shortCode: l3,
      cfApplicable: true,
      plApplicable: false,
      l1: curL1,
      l1Name: curL1Name,
      l2: l2c,
      l2Name: l2n,
      l3,
      l3Name: l3Head,
      desc,
      cfL1: '',
      cfL2: '',
      cfL3: '',
      plL1: '',
      plL2: '',
      plL3: '',
      cfL1Label: scopedL1Label('building', curL1Name),
      plL1Label: scopedL1Label('building', curL1Name),
      flow,
      legacyCat1: flow === 'in' ? 'Other Inflow' : 'Construction',
    };
  }
  return { entries, cfL1Order: [], plL1Order: [] };
}

function buildShortCodeIndex(entries) {
  const byShort = {};
  Object.values(entries).forEach((e) => {
    const k = e.shortCode;
    if (!byShort[k]) byShort[k] = [];
    byShort[k].push(e.masterKey);
  });
  return byShort;
}

/** A–Z building chart prefixes from Masters sheet (CM = common, not a building prefix). */
function parseBuildingPrefixes(wb) {
  const sheetName = wb.SheetNames.find((s) => /^masters$/i.test(s));
  if (!sheetName) return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  const prefixes = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = clean(row[c]).toUpperCase();
      if (cell === 'CM') continue;
      if (/^[A-Z]$/.test(cell) && !prefixes.includes(cell)) prefixes.push(cell);
    }
  }
  if (!prefixes.length) return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return prefixes.sort();
}

function writeOutputs(payload) {
  const {
    schema,
    sourceFile,
    GA_ACCT_L3_BY_CODE,
    GA_ACCT_L3_BY_SHORT,
    GA_ACCT_CF_L1_BUILDING,
    GA_ACCT_CF_L1_COMMON,
    GA_ACCT_PL_L1_BUILDING,
    GA_ACCT_PL_L1_COMMON,
    GA_ACCT_BUILDING_PREFIXES,
  } = payload;

  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const legacyBody = `'use strict';

/* Generated by scripts/build-ga-accounting-categories-js.mjs — do not hand-edit */
/* Source: ${sourceFile} */

var GA_ACCT_SCHEMA = ${JSON.stringify(schema)};
var GA_ACCT_L3_BY_CODE = ${JSON.stringify(GA_ACCT_L3_BY_CODE, null, 2)};
var GA_ACCT_L3_BY_SHORT = ${JSON.stringify(GA_ACCT_L3_BY_SHORT, null, 2)};
var GA_ACCT_CF_L1_BUILDING = ${JSON.stringify(GA_ACCT_CF_L1_BUILDING, null, 2)};
var GA_ACCT_CF_L1_COMMON = ${JSON.stringify(GA_ACCT_CF_L1_COMMON, null, 2)};
var GA_ACCT_PL_L1_BUILDING = ${JSON.stringify(GA_ACCT_PL_L1_BUILDING, null, 2)};
var GA_ACCT_PL_L1_COMMON = ${JSON.stringify(GA_ACCT_PL_L1_COMMON, null, 2)};
var GA_ACCT_BUILDING_PREFIXES = ${JSON.stringify(GA_ACCT_BUILDING_PREFIXES, null, 2)};
`;
  fs.writeFileSync(outFile, legacyBody, 'utf8');

  const sortedMasterKeys = sortedKeys(GA_ACCT_L3_BY_CODE);
  fs.mkdirSync(path.dirname(reactOutFile), { recursive: true });
  const reactBody = `/* Generated by scripts/build-ga-accounting-categories-js.mjs — do not hand-edit */
/* Source: ${sourceFile} */

export const GA_ACCT_SCHEMA = ${JSON.stringify(schema)};
export const GA_ACCT_L3_BY_CODE = ${JSON.stringify(GA_ACCT_L3_BY_CODE, null, 2)};
export const GA_ACCT_L3_BY_SHORT = ${JSON.stringify(GA_ACCT_L3_BY_SHORT, null, 2)};
export const GA_ACCT_CF_L1_BUILDING = ${JSON.stringify(GA_ACCT_CF_L1_BUILDING, null, 2)};
export const GA_ACCT_CF_L1_COMMON = ${JSON.stringify(GA_ACCT_CF_L1_COMMON, null, 2)};
export const GA_ACCT_PL_L1_BUILDING = ${JSON.stringify(GA_ACCT_PL_L1_BUILDING, null, 2)};
export const GA_ACCT_PL_L1_COMMON = ${JSON.stringify(GA_ACCT_PL_L1_COMMON, null, 2)};
export const GA_ACCT_BUILDING_PREFIXES = ${JSON.stringify(GA_ACCT_BUILDING_PREFIXES, null, 2)};
export const GA_ACCT_MASTER_SORTED_KEYS = ${JSON.stringify(sortedMasterKeys)};
`;
  fs.writeFileSync(reactOutFile, reactBody, 'utf8');

  console.log(
    `build-ga-accounting-categories-js: wrote ${sortedMasterKeys.length} master keys (${schema}) → ${outFile}`,
  );
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

  let entries = {};
  let cfL1Building = [];
  let cfL1Common = [];
  let plL1Building = [];
  let plL1Common = [];
  let buildingPrefixes = parseBuildingPrefixes(wb);
  let schema = 'v2';

  if (wb.SheetNames.includes(V3_BUILDING_SHEET) && wb.SheetNames.includes(V3_COMMON_SHEET)) {
    schema = 'v3';
    const building = parseV3MasterSheet(wb.Sheets[V3_BUILDING_SHEET], 'building', 'A');
    const common = parseV3MasterSheet(wb.Sheets[V3_COMMON_SHEET], 'common', 'CM');
    entries = { ...building.entries, ...common.entries };
    cfL1Building = building.cfL1Order;
    cfL1Common = common.cfL1Order;
    plL1Building = building.plL1Order;
    plL1Common = common.plL1Order;
    buildingPrefixes = parseBuildingPrefixes(wb);
  } else {
    const sheetName = wb.SheetNames.includes('Outflow') ? 'Outflow' : wb.SheetNames[0];
    const parsed = parseV2Outflow(wb.Sheets[sheetName]);
    entries = parsed.entries;
  }

  writeOutputs({
    schema,
    sourceFile: xlsxPath,
    GA_ACCT_L3_BY_CODE: entries,
    GA_ACCT_L3_BY_SHORT: buildShortCodeIndex(entries),
    GA_ACCT_CF_L1_BUILDING: cfL1Building,
    GA_ACCT_CF_L1_COMMON: cfL1Common,
    GA_ACCT_PL_L1_BUILDING: plL1Building,
    GA_ACCT_PL_L1_COMMON: plL1Common,
    GA_ACCT_BUILDING_PREFIXES: buildingPrefixes,
  });
}

main();
