/**
 * PreConstruction project catalog + inter-project bandwidth for Admin Security.
 */

const NON_ADOPTED_STATUSES = new Set(['pipeline', 'evaluation']);
const COMPLETED_STATUSES = new Set(['under construction', 'completed', 'closed', 'cancelled', 'handed over']);

export function parseAssignees(who) {
  return String(who || '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function nameMatches(a, b) {
  const w = String(a || '').trim().toLowerCase();
  const p = String(b || '').trim().toLowerCase();
  if (!w || !p) return false;
  if (w === p) return true;
  const wParts = w.split(/\s+/);
  const pParts = p.split(/\s+/);
  if (wParts.some((x) => x && p.includes(x))) return true;
  if (pParts.some((x) => x.length > 2 && w.includes(x))) return true;
  return false;
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

function normPhaseName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getDepartmentForPhase(phaseName, departments) {
  const n = normPhaseName(phaseName);
  if (!n) return null;
  for (const dept of departments || []) {
    if ((dept.phaseNames || []).some((pn) => n === pn || n.includes(pn) || pn.includes(n))) {
      return dept;
    }
    const slug = n.replace(/\s+/g, '_');
    if ((dept.phaseSlugs || []).some((s) => slug.includes(s) || s.includes(slug))) {
      return dept;
    }
  }
  return null;
}

function taskRolesList(task) {
  const r = task?.roles;
  if (Array.isArray(r)) return r.filter(Boolean);
  if (typeof r === 'string' && r.trim()) {
    return r
      .split(/[,;|/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function taskIsInScope(task, phaseName, person, departments) {
  if (!person) return false;
  if (parseAssignees(task.who).some((w) => nameMatches(w, person))) return true;
  const roles = taskRolesList(task);
  if (roles.some((role) => nameMatches(role, person) || nameMatches(person, role))) return true;
  const dept = getDepartmentForPhase(phaseName, departments);
  if (dept && nameMatches(dept.head, person)) return true;
  return false;
}

function taskIsOpen(task) {
  const st = String(task?.status || '').trim().toLowerCase();
  if (st === 'completed' || task?.ae) return false;
  return true;
}

/** Activity load: duration-weighted open in-scope tasks (current + future pipeline). */
function workloadWeightForProject(person, project, departments) {
  let w = 0;
  for (const ph of project.phases || []) {
    for (const task of ph.tasks || []) {
      if (!taskIsOpen(task)) continue;
      if (!taskIsInScope(task, ph.name, person, departments)) continue;
      const dur = Number(task.dur);
      w += Number.isFinite(dur) && dur > 0 ? dur : 1;
    }
  }
  return w;
}

function resolveAllocatedProjectNames(user, projects) {
  const allowed = user?.allowedProjects || [];
  if (!Array.isArray(allowed) || !allowed.length) return [];
  const keys = new Set(allowed.map((x) => String(x).trim().toLowerCase()).filter(Boolean));
  return (projects || [])
    .filter((p) => {
      const id = String(p.id || '').toLowerCase();
      const name = String(p.name || '').toLowerCase();
      return keys.has(name) || keys.has(id);
    })
    .map((p) => String(p.name || '').trim())
    .filter(Boolean);
}

function projectsWithInScopeWork(person, projects, departments) {
  const names = [];
  for (const proj of projects || []) {
    const name = String(proj.name || '').trim();
    if (!name) continue;
    if (workloadWeightForProject(person, proj, departments) > 0) names.push(name);
  }
  return names;
}

function distributeTo100(weights) {
  const keys = Object.keys(weights).filter((k) => weights[k] > 0);
  const out = {};
  if (!keys.length) return out;
  const total = keys.reduce((s, k) => s + weights[k], 0);
  if (total <= 0) {
    const each = Math.round((1000 / keys.length)) / 10;
    let sum = 0;
    keys.forEach((k, i) => {
      if (i < keys.length - 1) {
        out[k] = each;
        sum += each;
      } else out[k] = Math.round((100 - sum) * 10) / 10;
    });
    return out;
  }
  const ranked = keys
    .map((k) => ({ k, raw: (weights[k] / total) * 100 }))
    .sort((a, b) => b.raw - a.raw);
  let sum = 0;
  ranked.forEach((r, i) => {
    if (i < ranked.length - 1) {
      r.pct = Math.round(r.raw * 10) / 10;
      sum += r.pct;
    } else r.pct = Math.round((100 - sum) * 10) / 10;
    out[r.k] = r.pct;
  });
  return out;
}

/**
 * Inter-project bandwidth: each person's row sums to 100% across admin-assigned projects.
 * Split by in-scope open activity load (assignee, process role, or department head).
 * One allocated project → 100% on that project.
 *
 * @param {object[]} projects
 * @param {object[]} departments
 * @param {object[]} users — auth users with allowedProjects
 */
export function computeBandwidthReport(projects, departments = [], users = []) {
  const projectMeta = listProjectCatalog(projects);
  const projectByName = new Map(
    (projects || []).map((p) => [String(p.name || '').trim(), p]).filter(([n]) => n)
  );
  const matrix = {};
  const personMeta = {};
  const peopleSet = new Set();

  const activeUsers = (users || []).filter((u) => u.status !== 'disabled' && String(u.name || '').trim());
  activeUsers.forEach((u) => peopleSet.add(String(u.name).trim()));
  (departments || []).forEach((d) => {
    const h = String(d.head || '').trim();
    if (h) peopleSet.add(h);
  });

  for (const person of [...peopleSet].sort((a, b) => a.localeCompare(b))) {
    const authUser = activeUsers.find((u) => nameMatches(u.name, person));
    let allocated = authUser ? resolveAllocatedProjectNames(authUser, projects) : [];
    let adminAllocated = allocated.length > 0;

    if (!allocated.length) {
      allocated = projectsWithInScopeWork(person, projects, departments);
      if (!allocated.length) continue;
    }

    const openLoadByProject = {};
    allocated.forEach((pname) => {
      const proj = projectByName.get(pname);
      openLoadByProject[pname] = proj ? workloadWeightForProject(person, proj, departments) : 0;
    });

    let split = {};
    let splitMode = 'workload';

    if (allocated.length === 1) {
      split[allocated[0]] = 100;
      splitMode = 'single';
    } else {
      const weights = { ...openLoadByProject };
      const totalLoad = Object.values(weights).reduce((a, b) => a + b, 0);
      if (totalLoad <= 0) {
        const equal = {};
        allocated.forEach((p) => {
          equal[p] = 1;
        });
        split = distributeTo100(equal);
        splitMode = 'equal';
      } else {
        split = distributeTo100(weights);
        splitMode = 'workload';
      }
    }

    matrix[person] = split;
    personMeta[person] = {
      allocatedProjects: allocated,
      adminAllocated,
      projectCount: allocated.length,
      splitMode,
      openLoadByProject,
      totalOpenDays: Object.values(openLoadByProject).reduce((a, b) => a + b, 0),
    };
  }

  const people = Object.keys(matrix).sort((a, b) => a.localeCompare(b));
  return { people, projects: projectMeta, matrix, personMeta };
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

function uniqStrings(list) {
  return [...new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean))];
}

/** True when either side has no project filter (all projects) or lists overlap. */
export function allowedProjectsOverlap(allowedA, allowedB) {
  const a = uniqStrings(allowedA).map((x) => x.toLowerCase());
  const b = uniqStrings(allowedB).map((x) => x.toLowerCase());
  if (!a.length || !b.length) return true;
  return a.some((x) => b.includes(x));
}

/** True when project matches Admin Security allowedProjects (name, id, or partial). */
export function projectInAllowedList(project, allowed) {
  if (!Array.isArray(allowed) || !allowed.length) return true;
  const id = String(project?.id || '').toLowerCase();
  const name = String(project?.name || '').toLowerCase();
  return allowed.some((raw) => {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return false;
    if (key === id || key === name) return true;
    if (name.includes(key) || key.includes(name)) return true;
    if (id.includes(key) || key.includes(id)) return true;
    return nameMatches(name, key) || nameMatches(key, name);
  });
}

export function mergeUserAccess(user, roleDocs) {
  const apps = [];
  const projects = [];
  (roleDocs || []).forEach((r) => {
    apps.push(...(r.allowedApps || []));
    projects.push(...(r.allowedProjects || []));
  });
  apps.push(...(user.allowedApps || []));
  projects.push(...(user.allowedProjects || []));
  return {
    allowedApps: uniqStrings(apps),
    allowedProjects: uniqStrings(projects)
  };
}

export function userHasPreconApp(allowedApps) {
  const apps = new Set((allowedApps || []).map((x) => String(x).trim().toLowerCase()));
  return apps.has('preconstruction');
}

/** PreConstruction app + this project (empty allowedProjects = all projects). */
export function userHasPreconProjectAccess(user, roleDocs, project) {
  const access = mergeUserAccess(user, roleDocs);
  if (!userHasPreconApp(access.allowedApps)) return false;
  return projectInAllowedList(project, access.allowedProjects);
}

/**
 * @param {import('mongodb').Db} db
 * @param {{ allowedProjects?: string[] }} sessionUser
 */
export async function listPreconTeamRosterNames(db, sessionUser) {
  const rolesCol = db.collection('auth_roles');
  const usersCol = db.collection('auth_users');
  const allRoles = await rolesCol.find({}).toArray();
  const roleById = Object.fromEntries(allRoles.map((r) => [r._id, r]));
  const users = await usersCol.find({ status: { $ne: 'disabled' } }).toArray();
  const myProjects = sessionUser?.allowedProjects || [];
  const names = new Set();

  for (const u of users) {
    const roleDocs = (u.roleIds || ['viewer']).map((id) => roleById[id]).filter(Boolean);
    const access = mergeUserAccess(u, roleDocs);
    if (!userHasPreconApp(access.allowedApps)) continue;
    if (!allowedProjectsOverlap(myProjects, access.allowedProjects)) continue;
    const n = String(u.name || '').trim();
    if (n) names.add(n);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}
