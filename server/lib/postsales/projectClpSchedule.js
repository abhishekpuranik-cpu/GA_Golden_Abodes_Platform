import XLSX from 'xlsx';
import ProjectClpSchedule from '../../models/postsales/ProjectClpSchedule.js';
import { syncScheduleRowToUnits } from './clpScheduleSync.js';

function slug(s) {
  return String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function parseDate(v) {
  if (!v) return undefined;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const CLP_SCHEDULE_HEADERS = [
  'Milestone', 'Percent Due', 'Construction-linked? (Y/N)', 'Target Date', 'Achieved Date',
];

export function buildClpScheduleTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    CLP_SCHEDULE_HEADERS,
    ['Token', 10, 'N', '2024-01-15', ''],
    ['Slab 5', 15, 'Y', '2025-06-01', ''],
    ['Slab 10', 10, 'Y', '2025-12-01', ''],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CLP Schedule');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export function parseClpScheduleWorkbook(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

export function normalizeClpScheduleRows(rawRows, project) {
  return rawRows.map((row, idx) => {
    const milestone = row.Milestone || row.milestone || row['Milestone Name'] || '';
    const pct = Number(row['Percent Due'] ?? row.percentDue ?? row['Percent% Due'] ?? row.percent ?? 0);
    const linkedRaw = String(row['Construction-linked? (Y/N)'] ?? row.constructionLinked ?? row['Construction Linked'] ?? 'Y').trim().toUpperCase();
    return {
      milestone: String(milestone).trim(),
      percentDue: pct,
      constructionLinked: linkedRaw !== 'N' && linkedRaw !== 'NO',
      targetDate: parseDate(row['Target Date'] ?? row.targetDate),
      achievedDate: parseDate(row['Achieved Date'] ?? row.achievedDate),
      scheduleOrder: idx,
    };
  }).filter((r) => r.milestone);
}

export async function saveProjectClpSchedule(project, rows, updatedBy) {
  return ProjectClpSchedule.findOneAndUpdate(
    { project },
    { $set: { project, rows, updatedBy } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function triggerDemandTasksForAchievedRow(project, row, { tower, phase, building, by = 'CLP Schedule' } = {}) {
  if (!row.achievedDate || !row.milestone) {
    return { skipped: true, reason: 'Missing achieved date or milestone name' };
  }

  const scopedBuilding = building || tower || '';
  return syncScheduleRowToUnits(project, row, {
    phase: phase || '',
    building: scopedBuilding,
    by,
  });
}
