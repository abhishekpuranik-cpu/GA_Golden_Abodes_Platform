const COLLECTION = 'business_health_snapshots';

function monthId(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Upsert monthly business health snapshot.
 * @param {import('mongodb').Db} db
 * @param {object} payload
 */
export async function upsertMonthlySnapshot(db, payload) {
  const id = monthId();
  const doc = {
    _id: id,
    portfolio: payload.portfolio || {},
    pillars: payload.pillars || {},
    projects: payload.projects || {},
    trends: payload.trends || {},
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.collection(COLLECTION).updateOne({ _id: id }, { $set: doc }, { upsert: true });
  return doc;
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} metric
 * @param {number} months
 */
export async function loadTrendSeries(db, metric, months = 12) {
  const rows = await db
    .collection(COLLECTION)
    .find({})
    .sort({ _id: -1 })
    .limit(months)
    .toArray();

  return rows
    .reverse()
    .map((r) => ({
      period: r._id,
      value: r.trends?.[metric] ?? r.portfolio?.[metric] ?? null
    }))
    .filter((x) => x.value != null);
}

export function extractTrendPoints(dashboard, controlTower) {
  const s = dashboard?.summary || {};
  const billed = Number(s.dmFeeBilledTtd) || 0;
  const paid = Number(s.dmFeePaidTtd) || 0;
  const topline = Number(s.totalTopline) || 0;
  const collections = Number(s.totalCollections) || 0;
  return {
    portfolio_health_score: controlTower?.health?.portfolioScore ?? 0,
    collections_rate: topline > 0 ? (collections / topline) * 100 : 0,
    dm_recovery_pct: billed > 0 ? (paid / billed) * 100 : 0
  };
}

export { COLLECTION };
