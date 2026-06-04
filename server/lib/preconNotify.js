import { nameMatches, parseAssignees } from './preconAdmin.js';

function uniqRecipients(list) {
  const byEmail = new Map();
  for (const r of list || []) {
    const email = String(r.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    const name = String(r.name || '').trim() || email;
    if (!byEmail.has(email)) byEmail.set(email, { name, email });
  }
  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name));
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
  if (/design|regulatory|approval|architect|iod|sanction|noc/i.test(n)) {
    return (departments || []).find((d) => d.id === 'dept_design') || null;
  }
  if (/land|registration|financial|financing|feasibility|sales office|due diligence|scout/i.test(n)) {
    return (departments || []).find((d) => d.id === 'dept_acquisition') || null;
  }
  return (departments || []).find((d) => d.id === 'dept_execution') || null;
}

/**
 * Vault admins / security managers — "Leadership" distribution.
 * @param {import('mongodb').Db} db
 */
export async function buildLeadershipList(db) {
  const roles = await db.collection('auth_roles').find({}).toArray();
  const leadershipRoleIds = new Set(
    roles
      .filter((r) => {
        const id = String(r._id || '').toLowerCase();
        const name = String(r.name || '').toLowerCase();
        const perms = r.permissions || [];
        return (
          id === 'admin' ||
          name.includes('admin') ||
          name.includes('lead') ||
          perms.includes('manage_security')
        );
      })
      .map((r) => r._id)
  );

  const users = await db
    .collection('auth_users')
    .find({ status: { $ne: 'disabled' } }, { projection: { name: 1, email: 1, roleIds: 1, permissions: 1 } })
    .toArray();

  return uniqRecipients(
    users
      .filter((u) => {
        if (!u.email) return false;
        if ((u.permissions || []).includes('manage_security')) return true;
        return (u.roleIds || []).some((id) => leadershipRoleIds.has(id));
      })
      .map((u) => ({ name: String(u.name || '').trim() || u.email, email: String(u.email).trim() }))
  );
}

/**
 * @param {import('mongodb').Db} db
 * @param {object} opts
 * @param {object[]} opts.departments
 * @param {string[]} opts.assigneeNames — names on current project tasks
 */
export async function buildNotifyRecipientGroups(db, opts = {}) {
  const { departments = [], assigneeNames = [] } = opts;
  const users = await db
    .collection('auth_users')
    .find({ status: { $ne: 'disabled' } }, { projection: { name: 1, email: 1 } })
    .toArray();

  const byName = (name) => {
    const n = String(name || '').trim();
    if (!n) return null;
    const hit = users.find((u) => nameMatches(u.name, n) || nameMatches(n, u.email?.split('@')[0]));
    if (!hit?.email) return { name: n, email: '', noEmail: true };
    return { name: hit.name || n, email: String(hit.email).trim() };
  };

  const departmentHeads = uniqRecipients(
    (departments || [])
      .map((d) => {
        const h = String(d.head || '').trim();
        if (!h) return null;
        return byName(h) || { name: h, email: '', noEmail: true };
      })
      .filter(Boolean)
  );

  const assignees = uniqRecipients(
    [...new Set((assigneeNames || []).map((n) => String(n).trim()).filter(Boolean))]
      .flatMap((n) => {
        const parts = n.split(/\s*[;,]\s*|\s+&\s+|\s+and\s+/i);
        return parts.map((p) => byName(p)).filter(Boolean);
      })
  );

  const leadership = await buildLeadershipList(db);

  const team = uniqRecipients(
    users
      .filter((u) => u.email && String(u.name || '').trim())
      .map((u) => ({ name: String(u.name).trim(), email: String(u.email).trim() }))
  );

  return { departmentHeads, leadership, assignees, team };
}

/**
 * Default auto-email list: all dept heads, leadership, task assignees, phase dept head.
 */
export function resolveAutoNotifyRecipients(groups, { departments, phaseName, taskWho }) {
  const withEmail = (list) => (list || []).filter((r) => r.email && !r.noEmail);

  const taskNames = parseAssignees(taskWho);
  const taskAssignees = withEmail(groups.assignees).filter((a) =>
    taskNames.some((n) => nameMatches(a.name, n))
  );

  const phaseDept = getDepartmentForPhase(phaseName, departments);
  const phaseHeadName = String(phaseDept?.head || '').trim();
  const phaseHead = phaseHeadName
    ? withEmail(groups.departmentHeads).find((h) => nameMatches(h.name, phaseHeadName)) ||
      withEmail(groups.leadership).find((h) => nameMatches(h.name, phaseHeadName))
    : null;

  return uniqRecipients([
    ...withEmail(groups.departmentHeads),
    ...withEmail(groups.leadership),
    ...taskAssignees,
    ...(phaseHead ? [phaseHead] : [])
  ]);
}

export { uniqRecipients };
