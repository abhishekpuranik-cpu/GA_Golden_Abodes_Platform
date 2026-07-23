/**
 * In-memory + companion-doc cache for PreConstruction boot/work payloads.
 * Catalog is tiny (project cards); work is tasks+comments without activityLog.
 */
import {
  buildPreconstructionCatalog,
  slimPreconstructionForBoot,
} from './preconstructionMerge.js';

export const PRECON_CATALOG_DOC_ID = 'preconstruction_catalog';
export const PRECON_WORK_DOC_ID = 'preconstruction_work';

let mem = {
  version: 0,
  catalog: null,
  work: null,
  builtAt: 0,
};

export function getPreconMemCache() {
  return mem.catalog || mem.work ? mem : null;
}

export function setPreconMemCache({ version, catalog, work }) {
  mem = {
    version: Number(version) || 0,
    catalog: catalog || mem.catalog,
    work: work || mem.work,
    builtAt: Date.now(),
  };
  return mem;
}

export function clearPreconMemCache() {
  mem = { version: 0, catalog: null, work: null, builtAt: 0 };
}

export function buildPreconProjections(fullData) {
  return {
    catalog: buildPreconstructionCatalog(fullData),
    work: slimPreconstructionForBoot(fullData),
  };
}

/** Persist lean companions so cold GETs never pull the 2MB+ main doc. */
export async function writePreconCompanions(db, { data, version, updatedAt, updatedBy }) {
  const states = db.collection('app_states');
  const { catalog, work } = buildPreconProjections(data);
  const now = updatedAt || new Date();
  const by = typeof updatedBy === 'string' && updatedBy.trim() ? updatedBy.trim() : 'system';
  const v = Number(version) || 1;
  await Promise.all([
    states.updateOne(
      { _id: PRECON_CATALOG_DOC_ID },
      {
        $set: {
          appId: PRECON_CATALOG_DOC_ID,
          parentAppId: 'preconstruction',
          data: catalog,
          version: v,
          updatedAt: now,
          updatedBy: by,
        },
      },
      { upsert: true },
    ),
    states.updateOne(
      { _id: PRECON_WORK_DOC_ID },
      {
        $set: {
          appId: PRECON_WORK_DOC_ID,
          parentAppId: 'preconstruction',
          data: work,
          version: v,
          updatedAt: now,
          updatedBy: by,
        },
      },
      { upsert: true },
    ),
  ]);
  setPreconMemCache({ version: v, catalog, work });
  return { catalog, work, version: v };
}

/** Load catalog/work from mem → companion → rebuild from main. */
export async function loadPreconProjection(db, view = 'catalog') {
  const want = view === 'work' ? 'work' : 'catalog';
  const cached = getPreconMemCache();
  if (cached?.[want] && cached.version > 0) {
    return {
      data: cached[want],
      version: cached.version,
      updatedAt: cached.builtAt ? new Date(cached.builtAt) : null,
      updatedBy: 'cache',
      source: 'memory',
    };
  }

  const states = db.collection('app_states');
  const docId = want === 'work' ? PRECON_WORK_DOC_ID : PRECON_CATALOG_DOC_ID;
  const row = await states.findOne({ _id: docId });
  if (row?.data) {
    if (want === 'catalog') setPreconMemCache({ version: row.version || 1, catalog: row.data });
    else setPreconMemCache({ version: row.version || 1, work: row.data });
    return {
      data: row.data,
      version: row.version || 1,
      updatedAt: row.updatedAt || null,
      updatedBy: row.updatedBy || null,
      source: 'companion',
    };
  }

  // Rebuild companions from main document (one-time / after wipe).
  const main = await states.findOne(
    { _id: 'preconstruction' },
    {
      projection: {
        version: 1,
        updatedAt: 1,
        updatedBy: 1,
        'data.cloudUrl': 1,
        'data.departments': 1,
        'data.projects': 1,
        'data._removedProjectIds': 1,
        // omit activityLog
      },
    },
  );
  if (!main?.data) return null;

  const built = await writePreconCompanions(db, {
    data: { ...main.data, activityLog: [] },
    version: main.version || 1,
    updatedAt: main.updatedAt || new Date(),
    updatedBy: main.updatedBy || 'rebuild',
  });
  return {
    data: want === 'work' ? built.work : built.catalog,
    version: built.version,
    updatedAt: main.updatedAt || null,
    updatedBy: main.updatedBy || null,
    source: 'rebuild',
  };
}

/** Warm mem cache after process start (non-blocking). */
export async function warmPreconStateCache(db) {
  try {
    const cat = await loadPreconProjection(db, 'catalog');
    if (cat) await loadPreconProjection(db, 'work');
    console.log(
      `[precon-cache] warmed v${getPreconMemCache()?.version || 0} catalog=${!!getPreconMemCache()?.catalog} work=${!!getPreconMemCache()?.work}`,
    );
  } catch (e) {
    console.warn('[precon-cache] warm failed', e?.message || e);
  }
}
