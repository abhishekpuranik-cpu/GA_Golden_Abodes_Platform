/**
 * PreConstruction project catalog + bandwidth for Admin Security.
 */

const NON_ADOPTED_STATUSES = new Set(['pipeline', 'evaluation']);
const COMPLETED_STATUSES = new Set(['under construction', 'completed', 'closed', 'cancelled', 'handed over']);

export function parseAssignees(who) {
  return String(who || '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Assignable in admin "Add all" — excludes non-adopted and completed-type statuses. */
export function isProjectAssignable(project) {
  const s = String(project?.status || '').trim().toLowerCase();
  if (!s) return true;
  if (NON_ADOPTED_STATUSES.has(s)) return false;
  if (COMPLETED_STATUSES.has(s)) return false;
  if (s.includes('complete')) return false;
  if (s.includes('non-adopted') || s.includes('non adopted')) return false;
  return true;
}

function taskIsOpen(task) {
  const st = String(task?.status || '').trim().toLowerCase();
  if (st === 'completed' || task?.ae) return false;
  return true;
}

/**
 * Bandwidth % = share of open tasks on a project (split equally among co-assignees).
 * @param {object[]} projects — from preconstruction state.projects
 * @param {object[]} departments — optional, for roster of dept heads
 */
export function computeBandwidthReport(projects, departments = []) {
  const roster = new Set();
  const projectMeta = [];
  const matrix = {};

  (departments || []).forEach((d) => {
    const h = String(d.head || '').trim();
    if (h) roster.add(h);
  });

  for (const proj of projects || []) {
    const name = String(proj.name || proj.id || '').trim();
    if (!name) continue;
    projectMeta.push({
      id: proj.id,
      name,
      status: proj.status || '',
      assignable: isProjectAssignable(proj)
    });

    let totalWeight = 0;
    const load = {};

    for (const ph of proj.phases || []) {
      for (const task of ph.tasks || []) {
        if (!taskIsOpen(task)) continue;
        const assignees = parseAssignees(task.who);
        assignees.forEach((a) => roster.add(a));
        if (!assignees.length) continue;
        totalWeight += 1;
        const share = 1 / assignees.length;
        assignees.forEach((a) => {
          load[a] = (load[a] || 0) + share;
        });
      }
    }

    for (const [person, weight] of Object.entries(load)) {
      if (!matrix[person]) matrix[person] = {};
      matrix[person][name] =
        totalWeight > 0 ? Math.round((weight / totalWeight) * 1000) / 10 : 0;
    }
  }

  const people = [...roster].sort((a, b) => a.localeCompare(b));
  return { people, projects: projectMeta, matrix };
}

export function listProjectCatalog(projects) {
  return (projects || []).map((p) => ({
    id: p.id,
    name: p.name,
    loc: p.loc || '',
    status: p.status || '',
    assignable: isProjectAssignable(p)
  }));
}

export function assignableProjectNames(projects) {
  return listProjectCatalog(projects)
    .filter((p) => p.assignable)
    .map((p) => p.name);
}
