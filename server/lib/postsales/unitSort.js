/** Natural chronological sort for unit numbers (2 before 10, A-101 before A-102). */
export function unitNumberSortKey(unitNumber) {
  const s = String(unitNumber || '').trim();
  if (!s) return '';
  const parts = s.match(/\d+|\D+/g) || [s];
  return parts
    .map((p) => (/^\d+$/.test(p) ? Number(p).toString().padStart(10, '0') : p.toLowerCase()))
    .join('');
}

export function compareUnitNumbers(a, b) {
  const ka = unitNumberSortKey(a);
  const kb = unitNumberSortKey(b);
  if (ka !== kb) return ka.localeCompare(kb, undefined, { numeric: true });
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true });
}

export function compareUnitsChronological(a, b) {
  const proj = String(a.project || '').localeCompare(String(b.project || ''));
  if (proj !== 0) return proj;
  const phase = String(a.phase || '').localeCompare(String(b.phase || ''));
  if (phase !== 0) return phase;
  const bld = String(a.building || a.tower || '').localeCompare(String(b.building || b.tower || ''));
  if (bld !== 0) return bld;
  return compareUnitNumbers(a.unitNumber, b.unitNumber);
}

export function sortUnitsChronologically(units = []) {
  return [...units].sort(compareUnitsChronological);
}
