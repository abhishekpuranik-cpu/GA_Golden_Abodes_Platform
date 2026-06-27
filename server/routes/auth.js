import crypto from 'crypto';
import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { withDb } from '../lib/mongo.js';
import {
  assignableProjectNames,
  computeBandwidthReport,
  listPreconTeamRosterNames,
  listProjectCatalog
} from '../lib/preconAdmin.js';

const PRECON_APP_ID = 'preconstruction';

export const authRouter = Router();

const AUTH_COOKIE = 'ga_auth_sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const PERM_ADMIN = 'manage_security';

const DEFAULT_ROLE = {
  _id: 'viewer',
  name: 'Viewer',
  description: 'Read-only vault access',
  permissions: [],
  allowedApps: ['v1_cashflow', 'v2_resource_planner', 'v3_project_acquisition', 'sales_dashboard', 'marketing_kpi', 'preconstruction', 'execution', 'finance_kpi', 'dm_spv_governance'],
  allowedProjects: [],
  allowedTabs: []
};

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  const out = {};
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = decodeURIComponent(part.slice(i + 1).trim());
    if (k) out[k] = v;
  });
  return out;
}

function setAuthCookie(res, sid) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${sid ? 43200 : 0}`];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  const v = sid || '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${encodeURIComponent(v)}; ${attrs.join('; ')}`);
}

function uniq(list) {
  return Array.from(new Set((list || []).map((x) => String(x || '').trim()).filter(Boolean)));
}

function mergeAccess(user, roles) {
  const apps = [];
  const projects = [];
  const tabs = [];
  const permissions = [];
  (roles || []).forEach((r) => {
    apps.push(...(r.allowedApps || []));
    projects.push(...(r.allowedProjects || []));
    tabs.push(...(r.allowedTabs || []));
    permissions.push(...(r.permissions || []));
  });
  apps.push(...(user.allowedApps || []));
  projects.push(...(user.allowedProjects || []));
  tabs.push(...(user.allowedTabs || []));
  permissions.push(...(user.permissions || []));
  return {
    allowedApps: uniq(apps),
    allowedProjects: uniq(projects),
    allowedTabs: uniq(tabs),
    permissions: uniq(permissions)
  };
}

async function hashPassword(password, saltHex) {
  const salt = saltHex || crypto.randomBytes(16).toString('hex');
  const key = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
  return { salt, hash: Buffer.from(key).toString('hex') };
}

async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(String(expectedHash || ''), 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function ensureDefaults(db) {
  const roles = db.collection('auth_roles');
  await roles.updateOne({ _id: DEFAULT_ROLE._id }, { $setOnInsert: DEFAULT_ROLE }, { upsert: true });
  // Keep existing deployments in sync when new vault apps ship.
  await roles.updateMany(
    { _id: { $in: ['admin', 'viewer'] } },
    { $addToSet: { allowedApps: 'dm_spv_governance' } }
  );
  await db.collection('auth_users').updateMany(
    { roleIds: 'admin' },
    { $addToSet: { allowedApps: 'dm_spv_governance' } }
  );
}

export function userHasApp(user, appId) {
  const target = String(appId || '').trim();
  const allowed = new Set((user?.allowedApps || []).map((x) => String(x)));
  if (allowed.has(target)) return true;
  if (target === 'v3_project_acquisition' && allowed.has('v3_org_planner')) return true;
  if (target === 'v3_org_planner' && allowed.has('v3_project_acquisition')) return true;
  return false;
}

export function userHasPermission(user, permission) {
  return (user?.permissions || []).includes(String(permission || ''));
}

export async function resolveSession(db, req) {
  const sid = parseCookies(req)[AUTH_COOKIE];
  if (!sid) return null;
  const sessions = db.collection('auth_sessions');
  const users = db.collection('auth_users');
  const roles = db.collection('auth_roles');
  const sess = await sessions.findOne({ _id: sid });
  if (!sess || !sess.userId || !sess.expiresAt || new Date(sess.expiresAt).getTime() < Date.now()) return null;
  const user = await users.findOne({ _id: new ObjectId(sess.userId), status: { $ne: 'disabled' } });
  if (!user) return null;
  const roleDocs = await roles.find({ _id: { $in: uniq(user.roleIds || ['viewer']) } }).toArray();
  const access = mergeAccess(user, roleDocs);
  return {
    sid,
    user: {
      id: String(user._id),
      email: user.email,
      name: user.name || '',
      roleIds: uniq(user.roleIds || ['viewer']),
      ...access
    }
  };
}

authRouter.get(
  '/bootstrap-status',
  withDb(async (_req, res, db) => {
    await ensureDefaults(db);
    const count = await db.collection('auth_users').countDocuments({});
    res.json({ needsBootstrap: count === 0 });
  })
);

authRouter.post(
  '/bootstrap',
  withDb(async (req, res, db) => {
    await ensureDefaults(db);
    const users = db.collection('auth_users');
    const count = await users.countDocuments({});
    if (count > 0) return res.status(409).json({ error: 'Bootstrap already completed' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: 'Email and password (min 8 chars) are required' });
    }
    const { salt, hash } = await hashPassword(password);
    const now = new Date();
    const doc = {
      email,
      name: name || 'Admin',
      status: 'active',
      roleIds: ['admin'],
      permissions: [PERM_ADMIN],
      allowedApps: ['v1_cashflow', 'v2_resource_planner', 'v3_project_acquisition', 'sales_dashboard', 'marketing_kpi', 'preconstruction', 'execution', 'finance_kpi', 'finance_kpi_admin', 'dm_spv_governance', 'post_sales', 'admin_security'],
      allowedProjects: [],
      allowedTabs: [],
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: now,
      updatedAt: now
    };
    await db.collection('auth_roles').updateOne(
      { _id: 'admin' },
      {
        $setOnInsert: {
          _id: 'admin',
          name: 'Admin',
          description: 'Full access',
          permissions: [PERM_ADMIN],
          allowedApps: ['v1_cashflow', 'v2_resource_planner', 'v3_project_acquisition', 'sales_dashboard', 'marketing_kpi', 'preconstruction', 'execution', 'finance_kpi', 'finance_kpi_admin', 'dm_spv_governance', 'post_sales', 'admin_security'],
          allowedProjects: [],
          allowedTabs: []
        }
      },
      { upsert: true }
    );
    const ins = await users.insertOne(doc);
    const sid = crypto.randomBytes(24).toString('hex');
    await db.collection('auth_sessions').insertOne({
      _id: sid,
      userId: String(ins.insertedId),
      createdAt: now,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    });
    setAuthCookie(res, sid);
    res.json({ ok: true });
  })
);

authRouter.post(
  '/login',
  withDb(async (req, res, db) => {
    await ensureDefaults(db);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await db.collection('auth_users').findOne({ email, status: { $ne: 'disabled' } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const sid = crypto.randomBytes(24).toString('hex');
    await db.collection('auth_sessions').insertOne({
      _id: sid,
      userId: String(user._id),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS)
    });
    setAuthCookie(res, sid);
    res.json({ ok: true });
  })
);

authRouter.post(
  '/logout',
  withDb(async (req, res, db) => {
    const sid = parseCookies(req)[AUTH_COOKIE];
    if (sid) await db.collection('auth_sessions').deleteOne({ _id: sid });
    setAuthCookie(res, null);
    res.json({ ok: true });
  })
);

authRouter.get(
  '/session',
  withDb(async (req, res, db) => {
    await ensureDefaults(db);
    const sess = await resolveSession(db, req);
    if (!sess) return res.status(401).json({ authenticated: false });
    res.json({ authenticated: true, user: sess.user });
  })
);

authRouter.get(
  '/admin/roles',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess || !sess.user.permissions.includes(PERM_ADMIN)) return res.status(403).json({ error: 'Forbidden' });
    const roles = await db.collection('auth_roles').find({}).sort({ _id: 1 }).toArray();
    res.json({ roles });
  })
);

authRouter.put(
  '/admin/roles',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess || !sess.user.permissions.includes(PERM_ADMIN)) return res.status(403).json({ error: 'Forbidden' });
    const roles = Array.isArray(req.body?.roles) ? req.body.roles : [];
    for (const r of roles) {
      const id = String(r?._id || '').trim();
      if (!id) continue;
      await db.collection('auth_roles').updateOne(
        { _id: id },
        {
          $set: {
            name: String(r.name || id),
            description: String(r.description || ''),
            permissions: uniq(r.permissions || []),
            allowedApps: uniq(r.allowedApps || []),
            allowedProjects: uniq(r.allowedProjects || []),
            allowedTabs: uniq(r.allowedTabs || []),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }
    res.json({ ok: true });
  })
);

authRouter.get(
  '/admin/users',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess || !sess.user.permissions.includes(PERM_ADMIN)) return res.status(403).json({ error: 'Forbidden' });
    const users = await db
      .collection('auth_users')
      .find({}, { projection: { passwordHash: 0, passwordSalt: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ users: users.map((u) => ({ ...u, id: String(u._id), _id: undefined })) });
  })
);

authRouter.post(
  '/admin/users',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess || !sess.user.permissions.includes(PERM_ADMIN)) return res.status(403).json({ error: 'Forbidden' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password || password.length < 8) return res.status(400).json({ error: 'Email and password (min 8 chars) required' });
    const exists = await db.collection('auth_users').findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email already exists' });
    const { salt, hash } = await hashPassword(password);
    await db.collection('auth_users').insertOne({
      email,
      name: String(req.body?.name || '').trim() || email,
      phone: String(req.body?.phone || '').trim(),
      status: String(req.body?.status || 'active'),
      roleIds: uniq(req.body?.roleIds || ['viewer']),
      permissions: uniq(req.body?.permissions || []),
      allowedApps: uniq(req.body?.allowedApps || []),
      allowedProjects: uniq(req.body?.allowedProjects || []),
      allowedTabs: uniq(req.body?.allowedTabs || []),
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    res.json({ ok: true });
  })
);

authRouter.post(
  '/admin/users/:id/reset-password',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess || !sess.user.permissions.includes(PERM_ADMIN)) return res.status(403).json({ error: 'Forbidden' });
    const id = String(req.params.id || '');
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user id' });
    const password = String(req.body?.password || '');
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const user = await db.collection('auth_users').findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const { salt, hash } = await hashPassword(password);
    await db.collection('auth_users').updateOne(
      { _id: new ObjectId(id) },
      { $set: { passwordSalt: salt, passwordHash: hash, updatedAt: new Date() } }
    );
    await db.collection('auth_sessions').deleteMany({ userId: id });
    res.json({ ok: true, email: user.email });
  })
);

authRouter.put(
  '/admin/users/:id',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess || !sess.user.permissions.includes(PERM_ADMIN)) return res.status(403).json({ error: 'Forbidden' });
    const id = String(req.params.id || '');
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid user id' });
    const patch = {
      name: String(req.body?.name || '').trim(),
      phone: String(req.body?.phone || '').trim(),
      status: String(req.body?.status || 'active'),
      roleIds: uniq(req.body?.roleIds || ['viewer']),
      permissions: uniq(req.body?.permissions || []),
      allowedApps: uniq(req.body?.allowedApps || []),
      allowedProjects: uniq(req.body?.allowedProjects || []),
      allowedTabs: uniq(req.body?.allowedTabs || []),
      updatedAt: new Date()
    };
    const password = String(req.body?.password || '');
    let passwordReset = false;
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      const { salt, hash } = await hashPassword(password);
      patch.passwordSalt = salt;
      patch.passwordHash = hash;
      passwordReset = true;
    }
    await db.collection('auth_users').updateOne({ _id: new ObjectId(id) }, { $set: patch });
    if (passwordReset) {
      await db.collection('auth_sessions').deleteMany({ userId: id });
    }
    res.json({ ok: true, passwordReset });
  })
);

async function loadPreconProjects(db) {
  const doc = await db.collection('app_states').findOne({ _id: PRECON_APP_ID });
  const data = doc?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { projects: [], departments: [] };
  return {
    projects: Array.isArray(data.projects) ? data.projects : [],
    departments: Array.isArray(data.departments) ? data.departments : []
  };
}

authRouter.get(
  '/preconstruction-team-roster',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess) return res.status(401).json({ error: 'Unauthorized' });
    if (!userHasApp(sess.user, PRECON_APP_ID)) return res.status(403).json({ error: 'Forbidden' });
    const names = await listPreconTeamRosterNames(db, sess.user);
    res.json({ names });
  })
);

authRouter.get(
  '/admin/preconstruction-projects',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess || !sess.user.permissions.includes(PERM_ADMIN)) return res.status(403).json({ error: 'Forbidden' });
    const { projects } = await loadPreconProjects(db);
    const catalog = listProjectCatalog(projects);
    res.json({
      projects: catalog,
      assignableNames: assignableProjectNames(projects)
    });
  })
);

authRouter.get(
  '/admin/bandwidth-report',
  withDb(async (req, res, db) => {
    const sess = await resolveSession(db, req);
    if (!sess || !sess.user.permissions.includes(PERM_ADMIN)) return res.status(403).json({ error: 'Forbidden' });
    const { projects, departments } = await loadPreconProjects(db);
    const authUsers = await db
      .collection('auth_users')
      .find({ status: { $ne: 'disabled' } }, { projection: { passwordHash: 0, passwordSalt: 0 } })
      .toArray();
    const users = authUsers.map((u) => ({
      name: u.name,
      email: u.email,
      status: u.status,
      allowedProjects: u.allowedProjects || []
    }));
    const report = computeBandwidthReport(projects, departments, users);
    res.json(report);
  })
);
