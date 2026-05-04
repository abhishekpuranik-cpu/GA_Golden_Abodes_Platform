/**
 * v3_org_planner persists duplicated project lists (ga_planner_state_v1.projs + ga_rp_projects).
 * Stale browsers auto-save every 60s and overwrite Mongo with a short list — this module unions
 * projects by id so a full portfolio cannot be wiped by an outdated tab.
 */

export const V3_ORG_PLANNER_APP_ID = 'v3_org_planner';

function tryParseJson(s) {
  if (s == null) return null;
  if (typeof s === 'object' && !Array.isArray(s)) return s;
  if (typeof s !== 'string') return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function getProjsFromRp(str) {
  const a = tryParseJson(str);
  return Array.isArray(a) ? a : [];
}

/**
 * Later lists override earlier for the same id (field-level merge per object).
 */
function mergeProjectLists(...lists) {
  const map = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const p of list) {
      if (!p || typeof p !== 'object' || !p.id) continue;
      const prev = map.get(p.id);
      map.set(p.id, prev ? { ...prev, ...p } : { ...p });
    }
  }
  return [...map.values()];
}

function buildMergedState(existingData, incomingData) {
  const exState = tryParseJson(existingData?.ga_planner_state_v1);
  const inState = tryParseJson(incomingData?.ga_planner_state_v1);
  const exRp = getProjsFromRp(existingData?.ga_rp_projects);
  const inRp = getProjsFromRp(incomingData?.ga_rp_projects);

  const exProjs = Array.isArray(exState?.projs) ? exState.projs : [];
  const inProjs = Array.isArray(inState?.projs) ? inState.projs : [];

  const mergedProjs = mergeProjectLists(exProjs, inProjs, exRp, inRp);

  let baseState;
  if (inState && typeof inState === 'object') {
    baseState = JSON.parse(JSON.stringify(inState));
  } else if (exState && typeof exState === 'object') {
    baseState = JSON.parse(JSON.stringify(exState));
  } else {
    baseState = { v: 2, ts: Date.now() };
  }

  baseState.projs = mergedProjs;
  baseState.fin = { ...(exState?.fin && typeof exState.fin === 'object' ? exState.fin : {}), ...(inState?.fin && typeof inState.fin === 'object' ? inState.fin : {}) };
  baseState.ts = Date.now();

  return baseState;
}

/**
 * @param {Record<string, string>|null|undefined} existingData — row.data before PUT
 * @param {Record<string, string>} incomingData — client body.data
 * @returns {Record<string, string>} data to persist
 */
export function mergeV3OrgPlannerForPut(existingData, incomingData) {
  if (!incomingData || typeof incomingData !== 'object') return incomingData;
  const baseState = buildMergedState(existingData, incomingData);
  const out = { ...incomingData };
  out.ga_planner_state_v1 = JSON.stringify(baseState);
  out.ga_rp_projects = JSON.stringify(baseState.projs.map((p) => Object.assign({}, p)));
  return out;
}

function projectIdsSig(arr) {
  if (!Array.isArray(arr)) return '';
  return [...new Set(arr.map((p) => p && p.id).filter(Boolean))].sort().join('|');
}

/**
 * Ensure planner JSON and ga_rp_projects agree; expand projs from ga_rp if planner is short.
 * @param {Record<string, string>|null|undefined} data
 */
export function repairV3OrgPlannerForRead(data) {
  if (!data || typeof data !== 'object') return data;
  const st = tryParseJson(data.ga_planner_state_v1);
  const rp = getProjsFromRp(data.ga_rp_projects);
  const projs = Array.isArray(st?.projs) ? st.projs : [];
  const mergedProjs = mergeProjectLists(projs, rp);

  if (
    mergedProjs.length === projs.length &&
    projectIdsSig(mergedProjs) === projectIdsSig(projs)
  ) {
    return data;
  }

  const nextState = st && typeof st === 'object' ? JSON.parse(JSON.stringify(st)) : { v: 2, ts: Date.now() };
  nextState.projs = mergedProjs;
  nextState.ts = Date.now();

  return {
    ...data,
    ga_planner_state_v1: JSON.stringify(nextState),
    ga_rp_projects: JSON.stringify(mergedProjs.map((p) => Object.assign({}, p)))
  };
}
