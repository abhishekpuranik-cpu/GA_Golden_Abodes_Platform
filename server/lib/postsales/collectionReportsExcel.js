import XLSX from 'xlsx';
import { formatMilestoneLabel } from './milestoneLabels.js';

function excelDate(v) {
  if (!v) return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(v);
  if (Number.isFinite(n) && n > 30000 && n < 60000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const parsed = new Date(v);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s;
}

function num(v) {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function normKey(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function rowVal(row, ...keys) {
  const map = {};
  for (const [k, v] of Object.entries(row || {})) map[normKey(k)] = v;
  for (const key of keys) {
    const v = map[normKey(key)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

const REGISTER_HEADERS = [
  'Unit', 'Client_Names', 'Project', 'Phase', 'Building', 'Booking_Date', 'Agreement Date',
  'Saleable Area', 'Agreement Value', 'Total Due', 'Received Amount', 'Pending_As Of Today',
  'Tax Due', 'Tax Received', 'Tax Pending', 'Next Expected Amount', 'Next Expected Date',
  'CX Executive', 'Payment Plan', 'Priority', 'Follow Up Owner', 'Collection Remarks',
];

const FORECAST_HEADERS = [
  'Project', 'Unit', 'Milestone', 'Installment_Seq', 'Expected Amount', 'Expected Date',
  'Risk Category', 'Includes Tax', 'Tax Amount', 'Note', 'Installment Received',
];

const DISB_HEADERS = [
  'Week', 'Date', 'Clear', 'Risky', 'Delayed', 'Total Pending', 'Total Received',
  'Unit', 'Client', 'Milestone', 'Entry Type', 'Amount', 'Category',
];

export function buildCollectionRegisterWorkbook(rows, disbData = null) {
  const registerRows = rows.map((r) => [
    r.unitNumber,
    r.clientName,
    r.project,
    r.phase || '',
    r.building || '',
    excelDate(r.bookingDate),
    excelDate(r.agreementDate),
    r.saleableArea || r.carpetArea || '',
    r.agreementValue || '',
    r.totalDue || 0,
    r.receivedAmount || 0,
    r.pendingAsOfToday || 0,
    r.taxDue || 0,
    r.taxReceived || 0,
    r.taxPending || 0,
    r.nextExpectedAmount || '',
    excelDate(r.nextExpectedDate),
    r.cxExecutive || '',
    r.paymentPlan || '',
    r.cxPriority || 'normal',
    r.followUpOwner || '',
    r.collectionRemarks || '',
  ]);

  const forecastRows = [];
  for (const r of rows) {
    for (const m of r.milestones || []) {
      const insts = m.installments?.length ? m.installments : [];
      if (!insts.length) {
        forecastRows.push([r.project, r.unitNumber, formatMilestoneLabel(m.milestoneName), 1, '', '', 'clear', 'N', '', '', '']);
        continue;
      }
      insts.forEach((inst, idx) => {
        forecastRows.push([
          r.project,
          r.unitNumber,
          formatMilestoneLabel(m.milestoneName),
          idx + 1,
          inst.amount || '',
          excelDate(inst.expectedDate),
          inst.riskCategory || 'clear',
          inst.includesTax ? 'Y' : 'N',
          inst.taxAmount || '',
          inst.note || '',
          inst.receivedAmount || '',
        ]);
      });
    }
  }

  const disbRows = [];
  if (disbData?.weeks) {
    for (const w of disbData.weeks) {
      disbRows.push([w.label, '', w.clear, w.risky, w.delayed, w.totalPending, w.totalReceived, '', '', '', 'week_total', '', '']);
      for (const d of w.dates || []) {
        disbRows.push(['', d.date, d.clear, d.risky, d.delayed, d.totalPending, d.totalReceived, '', '', '', 'date_total', '', '']);
        for (const c of d.clients || []) {
          disbRows.push([
            '', '', '', '', '', '', '',
            c.unitNumber,
            c.clientName,
            c.milestoneName,
            c.type,
            c.amount,
            c.category,
          ]);
        }
      }
    }
    if (disbData.grandTotal) {
      const g = disbData.grandTotal;
      disbRows.push(['Grand Total', '', g.clear, g.risky, g.delayed, g.totalPending, g.totalReceived, '', '', '', 'grand_total', '', '']);
    }
  }

  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([REGISTER_HEADERS, ...registerRows]);
  const ws2 = XLSX.utils.aoa_to_sheet([FORECAST_HEADERS, ...forecastRows]);
  const ws3 = XLSX.utils.aoa_to_sheet([DISB_HEADERS, ...disbRows]);
  XLSX.utils.book_append_sheet(wb, ws1, 'Collection Register');
  XLSX.utils.book_append_sheet(wb, ws2, 'Expected Payments');
  XLSX.utils.book_append_sheet(wb, ws3, 'Disbursement Forecast');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function buildReportsTemplateWorkbook() {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([
    REGISTER_HEADERS,
    ['1002', 'Sharma', 'Paradise', 'Phase 2', 'Tower B', '2024-01-12', '2024-06-15', 1200, 5400000, 3240000, 2700000, 540000, 672758, 135000, 537758, 270000, '2026-06-25', 'Priya', 'CLP', 'normal', 'Priya', 'Client committed balance by month-end',],
  ]);
  const ws2 = XLSX.utils.aoa_to_sheet([
    FORECAST_HEADERS,
    ['Paradise', '1002', 'Slab complete', 1, 150000, '2026-06-20', 'clear', 'N', '', 'First part', ''],
    ['Paradise', '1002', 'Slab complete', 2, 120000, '2026-07-05', 'clear', 'N', '', 'Second installment', ''],
    ['Paradise', '1002', 'GST', 1, 200000, '2026-06-28', 'risky', 'Y', 200000, 'GST tranche', ''],
  ]);
  XLSX.utils.book_append_sheet(wb, ws1, 'Collection Register');
  XLSX.utils.book_append_sheet(wb, ws2, 'Expected Payments');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function parseReportsWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const registerSheet = wb.Sheets['Collection Register'] || wb.Sheets[wb.SheetNames[0]];
  const forecastSheet = wb.Sheets['Expected Payments'] || wb.Sheets[wb.SheetNames[1]];
  const registerRows = registerSheet ? XLSX.utils.sheet_to_json(registerSheet, { defval: '' }) : [];
  const forecastRows = forecastSheet ? XLSX.utils.sheet_to_json(forecastSheet, { defval: '' }) : [];
  return { registerRows, forecastRows };
}

/**
 * Build forecast payloads keyed by "project|unitNumber" for DB upsert.
 */
export function buildForecastUpdatesFromExcel(registerRows, forecastRows, unitLookup) {
  const metaByKey = new Map();
  for (const row of registerRows) {
    const project = String(rowVal(row, 'Project', 'project')).trim();
    const unit = String(rowVal(row, 'Unit', 'unit_number', 'unit number')).trim();
    if (!project || !unit) continue;
    const key = `${project}|${unit}`;
    metaByKey.set(key, {
      collectionRemarks: String(rowVal(row, 'Collection Remarks', 'collection_remarks')).trim(),
      cxPriority: String(rowVal(row, 'Priority', 'priority') || 'normal').trim().toLowerCase(),
      followUpOwner: String(rowVal(row, 'Follow Up Owner', 'follow_up_owner')).trim(),
    });
  }

  const milestonesByKey = new Map();
  for (const row of forecastRows) {
    const project = String(rowVal(row, 'Project', 'project')).trim();
    const unit = String(rowVal(row, 'Unit', 'unit_number')).trim();
    const milestone = String(rowVal(row, 'Milestone', 'milestone_name')).trim();
    const amount = num(rowVal(row, 'Expected Amount', 'expected_amount'));
    const expectedDate = excelDate(rowVal(row, 'Expected Date', 'expected_date'));
    if (!project || !unit || !milestone) continue;
    if (!amount || !expectedDate) continue;

    const key = `${project}|${unit}`;
    if (!milestonesByKey.has(key)) milestonesByKey.set(key, new Map());
    const msMap = milestonesByKey.get(key);
    if (!msMap.has(milestone)) msMap.set(milestone, []);
    const includesTaxRaw = String(rowVal(row, 'Includes Tax', 'includes_tax')).trim().toUpperCase();
    msMap.get(milestone).push({
      amount,
      expectedDate,
      riskCategory: String(rowVal(row, 'Risk Category', 'risk_category') || 'clear').trim().toLowerCase(),
      includesTax: includesTaxRaw === 'Y' || includesTaxRaw === 'YES' || includesTaxRaw === 'TRUE',
      taxAmount: num(rowVal(row, 'Tax Amount', 'tax_amount')),
      note: String(rowVal(row, 'Note', 'note')).trim(),
      receivedAmount: num(rowVal(row, 'Installment Received', 'installment_received')),
    });
  }

  const updates = [];
  const errors = [];
  const keys = new Set([...metaByKey.keys(), ...milestonesByKey.keys()]);

  for (const key of keys) {
    const [project, unitNumber] = key.split('|');
    const unit = unitLookup.get(key);
    if (!unit) {
      errors.push({ project, unitNumber, error: 'Unit not found' });
      continue;
    }
    const meta = metaByKey.get(key) || {};
    const msMap = milestonesByKey.get(key) || new Map();
    const milestones = [...msMap.entries()].map(([milestoneName, installments]) => ({
      milestoneName,
      installments: installments.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate)),
    }));

    updates.push({
      unitId: unit._id,
      project,
      unitNumber,
      payload: {
        collectionRemarks: meta.collectionRemarks ?? '',
        cxPriority: ['normal', 'high', 'watch'].includes(meta.cxPriority) ? meta.cxPriority : 'normal',
        followUpOwner: meta.followUpOwner ?? '',
        milestones,
      },
    });
  }

  return { updates, errors };
}

export function sheetToRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}
