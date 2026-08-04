import Demand from '../../models/postsales/Demand.js';
import Unit from '../../models/postsales/Unit.js';
import { upsertUnitForecastMilestones } from './clpScheduleSync.js';
import { formatMilestoneLabel } from './milestoneLabels.js';
import { milestoneKey } from './milestoneKey.js';
import { isUnitSpecificClpMilestone } from './clpCollectionPhase.js';
import { getEffectiveClpRowsForUnit } from './unitClpOverride.js';
import { invalidateHttpCache } from './httpCache.js';

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Record when a unit completed a unit-specific CLP stage → triggers due-as-today for that unit only. */
export async function setUnitMilestoneAchieved(unitId, milestoneName, achievedDate, { by = 'Unit' } = {}) {
  const unit = await Unit.findById(unitId);
  if (!unit) throw new Error('Unit not found');

  const label = formatMilestoneLabel(milestoneName);
  const key = milestoneKey(label);
  const when = parseDate(achievedDate);
  if (!when) throw new Error('Valid achieved date required');

  if (!unit.clpMilestoneDates) unit.clpMilestoneDates = new Map();
  unit.clpMilestoneDates.set(key, when);
  unit.markModified('clpMilestoneDates');
  await unit.save();

  const demand = await Demand.findOne({
    unitId: unit._id,
    $or: [{ milestoneName: label }, { milestoneName: milestoneName?.trim() }],
  });
  if (demand) {
    demand.actualDate = when;
    if (isUnitSpecificClpMilestone(label)) {
      demand.targetDate = when;
      demand.dueDate = when;
    }
    await demand.save();
  }

  const rows = await getEffectiveClpRowsForUnit(unit.toObject?.() || unit);
  await upsertUnitForecastMilestones(unit, rows);

  invalidateHttpCache('demands:');
  invalidateHttpCache('reports:');

  return {
    ok: true,
    unitId: String(unit._id),
    milestoneName: label,
    achievedDate: when.toISOString(),
    by,
  };
}
