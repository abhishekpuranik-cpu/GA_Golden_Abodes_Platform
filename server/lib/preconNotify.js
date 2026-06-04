import { nameMatches } from './preconAdmin.js';

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

  const team = uniqRecipients(
    users
      .filter((u) => u.email && String(u.name || '').trim())
      .map((u) => ({ name: String(u.name).trim(), email: String(u.email).trim() }))
  );

  return { departmentHeads, assignees, team };
}
