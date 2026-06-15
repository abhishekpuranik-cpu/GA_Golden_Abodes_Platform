/** PreConstruction app_states merge — union projects by id; tombstones prevent deleted projects returning. */

function isPlainObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function countTasks(proj) {
  let n = 0;
  for (const ph of proj?.phases || []) {
    if (Array.isArray(ph?.tasks)) n += ph.tasks.length;
  }
  return n;
}

function mergeProjectRow(existing, incoming) {
  if (!isPlainObject(existing)) return incoming;
  if (!isPlainObject(incoming)) return existing;
  const exTasks = countTasks(existing);
  const inTasks = countTasks(incoming);
  if (inTasks >= exTasks) return { ...existing, ...incoming };
  return { ...incoming, ...existing };
}

function normalizeRemovedIds(...sources) {
  const out = new Set();
  for (const src of sources) {
    if (!isPlainObject(src)) continue;
    const list = Array.isArray(src._removedProjectIds) ? src._removedProjectIds : [];
    for (const id of list) {
      const s = String(id || '').trim();
      if (s) out.add(s);
    }
  }
  return [...out];
}

function applyProjectTombstones(projects, removedIds) {
  const drop = new Set((removedIds || []).map((x) => String(x)));
  if (!drop.size) return projects || [];
  return (projects || []).filter((p) => p?.id != null && !drop.has(String(p.id)));
}

/** Strip tombstoned projects on read (GET / state load). */
export function repairPreconstructionForRead(data) {
  if (!isPlainObject(data)) return data;
  const removedIds = normalizeRemovedIds(data);
  if (!removedIds.length) return data;
  return {
    ...data,
    _removedProjectIds: removedIds,
    projects: applyProjectTombstones(data.projects, removedIds)
  };
}

/**
 * @param {object|null|undefined} existingRow app_states.data
 * @param {object} incoming PUT body.data (full workspace envelope)
 * @param {{ allowProjectRemoval?: boolean }} [opts]
 */
export function mergePreconstructionState(existingRow, incoming, opts = {}) {
  const allowProjectRemoval = !!opts.allowProjectRemoval;
  const ex = isPlainObject(existingRow) ? existingRow : {};
  const inc = isPlainObject(incoming) ? incoming : {};
  const exProjects = Array.isArray(ex.projects) ? ex.projects : [];
  const inProjects = Array.isArray(inc.projects) ? inc.projects : [];

  let removedIds = normalizeRemovedIds(ex, inc);
  if (allowProjectRemoval) {
    const inIds = new Set(inProjects.map((p) => String(p?.id)).filter(Boolean));
    for (const p of exProjects) {
      if (p?.id == null) continue;
      const id = String(p.id);
      if (!inIds.has(id)) removedIds.push(id);
    }
    removedIds = [...new Set(removedIds)];
  }

  const byId = new Map();
  if (allowProjectRemoval) {
    for (const p of inProjects) {
      if (p?.id == null) continue;
      const id = String(p.id);
      const exRow = exProjects.find((x) => String(x?.id) === id);
      byId.set(id, exRow ? mergeProjectRow(exRow, p) : p);
    }
  } else {
    for (const p of exProjects) {
      if (p?.id != null) byId.set(String(p.id), p);
    }
    for (const p of inProjects) {
      if (p?.id == null) continue;
      const id = String(p.id);
      byId.set(id, byId.has(id) ? mergeProjectRow(byId.get(id), p) : p);
    }
  }

  for (const id of removedIds) byId.delete(id);

  const departments =
    Array.isArray(inc.departments) && inc.departments.length
      ? inc.departments
      : Array.isArray(ex.departments)
        ? ex.departments
        : [];

  return {
    cloudUrl: inc.cloudUrl != null && String(inc.cloudUrl).trim() ? inc.cloudUrl : ex.cloudUrl || '',
    departments,
    _removedProjectIds: removedIds,
    projects: [...byId.values()]
  };
}
