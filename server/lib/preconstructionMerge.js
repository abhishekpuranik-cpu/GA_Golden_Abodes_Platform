/** PreConstruction app_states merge — union projects by id; incoming wins per-project fields. */

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

/**
 * @param {object|null|undefined} existingRow app_states.data
 * @param {object} incoming PUT body.data (full workspace envelope)
 */
export function mergePreconstructionState(existingRow, incoming) {
  const ex = isPlainObject(existingRow) ? existingRow : {};
  const inc = isPlainObject(incoming) ? incoming : {};
  const exProjects = Array.isArray(ex.projects) ? ex.projects : [];
  const inProjects = Array.isArray(inc.projects) ? inc.projects : [];

  const byId = new Map();
  for (const p of exProjects) {
    if (p?.id != null) byId.set(String(p.id), p);
  }
  for (const p of inProjects) {
    if (p?.id == null) continue;
    const id = String(p.id);
    byId.set(id, byId.has(id) ? mergeProjectRow(byId.get(id), p) : p);
  }

  const departments =
    Array.isArray(inc.departments) && inc.departments.length
      ? inc.departments
      : Array.isArray(ex.departments)
        ? ex.departments
        : [];

  return {
    cloudUrl: inc.cloudUrl != null && String(inc.cloudUrl).trim() ? inc.cloudUrl : ex.cloudUrl || '',
    departments,
    projects: [...byId.values()]
  };
}
