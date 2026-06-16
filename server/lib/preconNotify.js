import { nameMatches, parseAssignees } from './preconAdmin.js';

function uniqRecipients(list) {
  const byKey = new Map();
  for (const r of list || []) {
    const email = String(r.email || '').trim().toLowerCase();
    const phoneDigits = String(r.phone || '').replace(/\D/g, '');
    const hasEmail = email && email.includes('@');
    const hasPhone = phoneDigits.length >= 10;
    if (!hasEmail && !hasPhone) continue;
    const key = hasEmail ? `e:${email}` : `p:${phoneDigits}`;
    const name = String(r.name || '').trim() || email || phoneDigits;
    if (!byKey.has(key)) {
      byKey.set(key, {
        name,
        email: hasEmail ? email : '',
        phone: hasPhone ? String(r.phone || '').trim() || phoneDigits : ''
      });
    } else {
      const ex = byKey.get(key);
      if (hasPhone && !ex.phone) ex.phone = String(r.phone || '').trim() || phoneDigits;
      if (hasEmail && !ex.email) ex.email = email;
    }
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function hasNotifyContact(r) {
  const email = String(r?.email || '').trim();
  const phoneDigits = String(r?.phone || '').replace(/\D/g, '');
  return (email.includes('@') && !r?.noEmail) || phoneDigits.length >= 10;
}

/** Attach phones (and emails) from auth_users for notify routing. */
export function enrichRecipientsWithAuthPhones(recipients, authUsers) {
  const byEmail = new Map(
    (authUsers || []).map((u) => [String(u.email || '').trim().toLowerCase(), u])
  );
  return (recipients || []).map((r) => {
    const email = String(r.email || '').trim().toLowerCase();
    const u = email ? byEmail.get(email) : null;
    let phone = String(r.phone || '').trim();
    if (!phone && u?.phone) phone = String(u.phone).trim();
    if (!phone && r.name) {
      const hit = (authUsers || []).find(
        (x) => x.email && (nameMatches(x.name, r.name) || nameMatches(r.name, x.email.split('@')[0]))
      );
      if (hit?.phone) phone = String(hit.phone).trim();
    }
    const outEmail = r.email || (u?.email ? String(u.email).trim() : '');
    return { ...r, email: outEmail, phone };
  });
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
    .find({ status: { $ne: 'disabled' } }, { projection: { name: 1, email: 1, phone: 1, roleIds: 1, permissions: 1 } })
    .toArray();

  return uniqRecipients(
    users
      .filter((u) => {
        if (!u.email) return false;
        if ((u.permissions || []).includes('manage_security')) return true;
        return (u.roleIds || []).some((id) => leadershipRoleIds.has(id));
      })
      .map((u) => ({
        name: String(u.name || '').trim() || u.email,
        email: String(u.email).trim(),
        phone: String(u.phone || '').trim()
      }))
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
    .find({ status: { $ne: 'disabled' } }, { projection: { name: 1, email: 1, phone: 1 } })
    .toArray();

  const byName = (name) => {
    const n = String(name || '').trim();
    if (!n) return null;
    const hit = users.find((u) => nameMatches(u.name, n) || nameMatches(n, u.email?.split('@')[0]));
    if (!hit) return { name: n, email: '', phone: '', noEmail: true };
    return {
      name: hit.name || n,
      email: String(hit.email || '').trim(),
      phone: String(hit.phone || '').trim(),
      noEmail: !hit.email
    };
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
      .map((u) => ({
        name: String(u.name).trim(),
        email: String(u.email).trim(),
        phone: String(u.phone || '').trim()
      }))
  );

  return { departmentHeads, leadership, assignees, team };
}

/**
 * Default auto-email list: all dept heads, leadership, task assignees, phase dept head.
 */
export function resolveAutoNotifyRecipients(groups, { departments, phaseName, taskWho }) {
  const withContact = (list) => (list || []).filter(hasNotifyContact);

  const taskNames = parseAssignees(taskWho);
  const taskAssignees = withContact(groups.assignees).filter((a) =>
    taskNames.some((n) => nameMatches(a.name, n))
  );

  const phaseDept = getDepartmentForPhase(phaseName, departments);
  const phaseHeadName = String(phaseDept?.head || '').trim();
  const phaseHead = phaseHeadName
    ? withContact(groups.departmentHeads).find((h) => nameMatches(h.name, phaseHeadName)) ||
      withContact(groups.leadership).find((h) => nameMatches(h.name, phaseHeadName))
    : null;

  return uniqRecipients([
    ...withContact(groups.departmentHeads),
    ...withContact(groups.leadership),
    ...taskAssignees,
    ...(phaseHead ? [phaseHead] : [])
  ]);
}

export { uniqRecipients };
