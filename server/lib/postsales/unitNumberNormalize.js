function normUnitKey(unitNo) {
  return String(unitNo || '').trim().toLowerCase().replace(/\s+/g, '');
}

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Remove leading project name from unit number ("Paradise 101" → "101"). */
export function stripProjectPrefixFromUnitNumber(project, unitNumber) {
  const u = String(unitNumber || '').trim();
  const p = String(project || '').trim();
  if (!u || !p) return u;

  const ul = u.toLowerCase();
  const pl = p.toLowerCase();
  if (ul === pl) return u;

  const reSpaced = new RegExp(`^${escapeRegex(p)}[\\s\\-_]+(.+)$`, 'i');
  const m = u.match(reSpaced);
  if (m?.[1]?.trim()) return m[1].trim();

  if (ul.startsWith(pl) && u.length > p.length) {
    const rest = u.slice(p.length).replace(/^[\s\-_]+/, '').trim();
    if (rest) return rest;
  }
  return u;
}

export function unitNumberHasProjectPrefix(project, unitNumber) {
  const stripped = stripProjectPrefixFromUnitNumber(project, unitNumber);
  return stripped !== String(unitNumber || '').trim();
}

/** Canonical display/storage: no project prefix; optional building prefix only. */
export function normalizeUnitNumber(project, unitNumber, building) {
  let raw = stripProjectPrefixFromUnitNumber(project, unitNumber);
  raw = String(raw || '').trim();
  const b = String(building || '').trim();
  if (!raw) return b || '—';
  if (b && !raw.toLowerCase().includes(b.toLowerCase())) {
    return `${b}-${raw}`.replace(/\s+/g, '-');
  }
  return raw;
}

export function unitScopeKey(unit, unitNumber) {
  return [
    String(unit.project || '').toLowerCase(),
    String(unit.phase || '').toLowerCase(),
    String(unit.building || unit.tower || '').toLowerCase(),
    normUnitKey(unitNumber),
  ].join('|');
}

export function buildCrmUnitKeyFromUnit(unit, unitNumber) {
  return [unit.project, unit.phase, unit.building || unit.tower, unitNumber]
    .map((x) => String(x || '').trim().toLowerCase())
    .join('|');
}
