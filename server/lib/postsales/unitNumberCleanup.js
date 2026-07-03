import Unit from '../../models/postsales/Unit.js';
import { deleteSingleUnit } from './deleteUnit.js';
import {
  buildCrmUnitKeyFromUnit,
  normalizeUnitNumber,
  unitNumberHasProjectPrefix,
  unitScopeKey,
} from './unitNumberNormalize.js';

function normUnitKey(unitNo) {
  return String(unitNo || '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * Remove "Paradise · Paradise 101" duplicates — keep "Paradise · 101".
 * Renames lone prefixed rows; deletes prefixed rows when canonical already exists.
 */
export async function cleanupPrefixedUnitNumbers() {
  const units = await Unit.find({}).lean();
  const report = { renamed: 0, deleted: 0, actions: [], errors: [] };

  const groups = new Map();
  for (const u of units) {
    const canonical = normalizeUnitNumber(u.project, u.unitNumber, u.building || u.tower);
    const key = unitScopeKey(u, canonical);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      ...u,
      canonical,
      prefixed: unitNumberHasProjectPrefix(u.project, u.unitNumber),
    });
  }

  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = group[0];
      if (!only.prefixed && only.unitNumber === only.canonical) continue;
      try {
        await Unit.findByIdAndUpdate(only._id, {
          unitNumber: only.canonical,
          crmUnitKey: buildCrmUnitKeyFromUnit(only, only.canonical),
          v1UnitKey: normUnitKey(only.canonical),
        });
        report.renamed += 1;
        report.actions.push({
          action: 'renamed',
          project: only.project,
          from: only.unitNumber,
          to: only.canonical,
        });
      } catch (e) {
        report.errors.push({ unitId: String(only._id), error: e.message });
      }
      continue;
    }

    const canonicalUnits = group.filter((u) => !u.prefixed && u.unitNumber === u.canonical);
    const prefixedUnits = group.filter((u) => u.prefixed || u.unitNumber !== u.canonical);

    let keeper = canonicalUnits.sort(
      (a, b) => (b.currentStepNumber || 0) - (a.currentStepNumber || 0),
    )[0];

    if (!keeper && prefixedUnits.length) {
      const best = prefixedUnits.sort(
        (a, b) => (b.currentStepNumber || 0) - (a.currentStepNumber || 0),
      )[0];
      try {
        await Unit.findByIdAndUpdate(best._id, {
          unitNumber: best.canonical,
          crmUnitKey: buildCrmUnitKeyFromUnit(best, best.canonical),
          v1UnitKey: normUnitKey(best.canonical),
        });
        report.renamed += 1;
        report.actions.push({
          action: 'renamed',
          project: best.project,
          from: best.unitNumber,
          to: best.canonical,
        });
        keeper = { ...best, unitNumber: best.canonical, prefixed: false };
      } catch (e) {
        report.errors.push({ unitId: String(best._id), error: e.message });
      }
    }

    for (const dup of prefixedUnits) {
      if (keeper && String(dup._id) === String(keeper._id)) continue;
      if (keeper && !dup.prefixed && dup.unitNumber === dup.canonical) continue;
      try {
        await deleteSingleUnit(dup._id);
        report.deleted += 1;
        report.actions.push({
          action: 'deleted',
          project: dup.project,
          unitNumber: dup.unitNumber,
          kept: keeper?.unitNumber || dup.canonical,
        });
      } catch (e) {
        report.errors.push({ unitId: String(dup._id), unitNumber: dup.unitNumber, error: e.message });
      }
    }
  }

  return { ok: true, ...report };
}

let cleanupDone = false;

export async function maybeCleanupPrefixedUnitNumbersOnStart() {
  if (cleanupDone) return null;
  cleanupDone = true;
  try {
    const result = await cleanupPrefixedUnitNumbers();
    if (result.deleted || result.renamed) {
      console.log('[unit-number-cleanup]', JSON.stringify({
        deleted: result.deleted,
        renamed: result.renamed,
        errors: result.errors.length,
      }));
    }
    return result;
  } catch (e) {
    console.warn('[unit-number-cleanup]', e?.message || e);
    return null;
  }
}

export function resetUnitNumberCleanupForTests() {
  cleanupDone = false;
}
