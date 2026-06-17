/**
 * Pull project list from ga_rp_projects (V2/V3 Mongo state or workspace).
 * @param {import('mongodb').Db} db
 */
export async function pullGaRpProjects(db) {
  const sources = [];

  async function parseProjectsFromState(appId) {
    const doc = await db.collection('app_states').findOne({ _id: appId });
    if (!doc?.data) return [];
    let raw = doc.data.ga_rp_projects;
    if (!raw && typeof doc.data === 'object') {
      raw = doc.data['ga_rp_projects'];
    }
    if (!raw) return [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const v2 = await parseProjectsFromState('v2_resource_planner');
  if (v2.length) sources.push({ source: 'v2_resource_planner', projects: v2 });

  const v3 = await parseProjectsFromState('v3_org_planner');
  if (v3.length) sources.push({ source: 'v3_org_planner', projects: v3 });

  const kv = await db.collection('workspace_kv').findOne({ _id: 'main' });
  if (kv?.keys?.ga_rp_projects) {
    try {
      const parsed = JSON.parse(kv.keys.ga_rp_projects);
      if (Array.isArray(parsed) && parsed.length) {
        sources.push({ source: 'workspace_kv', projects: parsed });
      }
    } catch {
      /* ignore */
    }
  }

  const byId = new Map();
  sources.forEach(({ source, projects }) => {
    projects.forEach((p) => {
      const id = String(p.id || p._id || '').trim();
      if (!id) return;
      byId.set(id, { ...p, _syncSource: source });
    });
  });

  return Array.from(byId.values());
}

/**
 * Sync dm_projects from ga_rp_projects without overwriting DM-specific fields.
 * @param {import('mongodb').Db} db
 * @param {object} opts
 */
export async function syncProjectsFromRegistry(db, opts = {}) {
  const registry = await pullGaRpProjects(db);
  const projects = db.collection('dm_projects');
  const now = new Date();
  const results = { imported: 0, updated: 0, skipped: 0, projects: registry.length };

  for (const rp of registry) {
    const id = String(rp.id || '').trim();
    if (!id) {
      results.skipped += 1;
      continue;
    }

    const existing = await projects.findOne({ _id: id });
    const patch = {
      projectCode: id,
      name: String(rp.name || existing?.name || id).trim(),
      location: rp.location || existing?.location || '',
      toplineGdv: Number(rp._gdv ?? rp.rev ?? existing?.toplineGdv ?? 0) || 0,
      saleableAreaSqf: Number(rp.sqf ?? existing?.saleableAreaSqf ?? 0) || 0,
      unitCount: Number(rp.unt ?? existing?.unitCount ?? 0) || 0,
      integrationSnapshot: {
        ...(existing?.integrationSnapshot || {}),
        registrySource: rp._syncSource,
        registrySyncedAt: now.toISOString(),
        planningDmFee: Number(rp._dmFee ?? 0) || 0
      },
      updatedAt: now
    };

    if (existing) {
      if (!opts.overwrite && opts.registryOnly) {
        results.skipped += 1;
        continue;
      }
      await projects.updateOne({ _id: id }, { $set: patch });
      results.updated += 1;
    } else if (!opts.skipNew) {
      await projects.insertOne({
        _id: id,
        ...patch,
        spvIds: [],
        assetClass: 'mixed_use',
        eligibleBaseType: 'topline_gdv',
        dmCapPct: 10,
        revenueStatus: 'pre_revenue',
        billingModelType: 'HYBRID_GA',
        collectionsTtd: 0,
        collectionsMtd: 0,
        constructionProgressPct: 0,
        dmSyncEnabled: false,
        riskStatus: 'amber',
        createdAt: now,
        createdBy: opts.userEmail || 'sync'
      });
      results.imported += 1;
    } else {
      results.skipped += 1;
    }
  }

  return results;
}
