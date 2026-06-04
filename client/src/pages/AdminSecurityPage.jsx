import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../lib/api.js';
import { ProjectAssignPicker } from '../components/ProjectAssignPicker.jsx';
import { BandwidthReport } from '../components/BandwidthReport.jsx';

const ALL_APPS = ['v1_cashflow', 'v2_resource_planner', 'v3_project_acquisition', 'sales_dashboard', 'marketing_kpi', 'preconstruction', 'execution', 'admin_security'];

function splitCsv(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const emptyNewUser = () => ({
  email: '',
  name: '',
  password: '',
  roleIds: 'viewer',
  allowedProjects: [],
  allowedTabs: '',
  allowedApps: ''
});

export default function AdminSecurityPage() {
  const [session, setSession] = useState(null);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [projectCatalog, setProjectCatalog] = useState([]);
  const [bandwidth, setBandwidth] = useState(null);
  const [bwLoading, setBwLoading] = useState(false);
  const [bwError, setBwError] = useState('');
  const [newUser, setNewUser] = useState(emptyNewUser);

  async function loadBandwidth() {
    setBwLoading(true);
    setBwError('');
    try {
      const r = await authApi.bandwidthReport();
      setBandwidth(r);
    } catch (e) {
      setBwError(e?.message || 'Bandwidth report failed');
      setBandwidth(null);
    } finally {
      setBwLoading(false);
    }
  }

  async function load() {
    setErr('');
    try {
      const s = await authApi.session();
      if (!s?.authenticated) throw new Error('Not logged in');
      if (!(s.user?.permissions || []).includes('manage_security')) throw new Error('Admin access required');
      setSession(s.user);
      const [r, u, catalog] = await Promise.all([
        authApi.listRoles(),
        authApi.listUsers(),
        authApi.listPreconstructionProjects()
      ]);
      setRoles(r.roles || []);
      setUsers(
        (u.users || []).map((user) => ({
          ...user,
          allowedProjects: Array.isArray(user.allowedProjects) ? user.allowedProjects : []
        }))
      );
      setProjectCatalog(catalog.projects || []);
      await loadBandwidth();
    } catch (e) {
      setErr(e?.message || 'Load failed');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveRoles() {
    await authApi.saveRoles(roles);
    await load();
  }

  async function addUser() {
    await authApi.createUser({
      email: newUser.email,
      name: newUser.name,
      password: newUser.password,
      roleIds: splitCsv(newUser.roleIds),
      allowedProjects: newUser.allowedProjects || [],
      allowedTabs: splitCsv(newUser.allowedTabs),
      allowedApps: splitCsv(newUser.allowedApps)
    });
    setNewUser(emptyNewUser());
    await load();
  }

  async function saveUser(u) {
    await authApi.updateUser(u.id, {
      name: u.name,
      status: u.status,
      roleIds: Array.isArray(u.roleIds) ? u.roleIds : splitCsv(u.roleIds),
      allowedApps: u.allowedApps || [],
      allowedProjects: u.allowedProjects || [],
      allowedTabs: u.allowedTabs || []
    });
    await load();
  }

  return (
    <div className="admin-security">
      <header className="admin-hdr">
        <div>
          <h1>Admin Security</h1>
          <p className="admin-sub">Users, project access, and team bandwidth across PreConstruction projects</p>
        </div>
        <Link to="/" className="admin-back">
          ← Back to Vault
        </Link>
      </header>
      {err ? <div className="admin-err">{err}</div> : null}
      {session ? <div className="admin-session">Signed in as {session.email}</div> : null}

      <section className="admin-card">
        <h2>Bandwidth report</h2>
        <p className="admin-card-sub">
          Each person&apos;s 100% bandwidth split across Admin-assigned projects (weighted by open in-scope
          activities and role)
        </p>
        <div className="admin-card-actions">
          <button type="button" className="admin-btn" onClick={() => void loadBandwidth()} disabled={bwLoading}>
            {bwLoading ? 'Refreshing…' : 'Refresh report'}
          </button>
        </div>
        <BandwidthReport report={bandwidth} loading={bwLoading} error={bwError} />
      </section>

      <section className="admin-card">
        <h2>Roles</h2>
        {roles.map((r, i) => (
          <div key={r._id} className="admin-row">
            <input value={r._id} disabled className="admin-inp-id" />
            <input
              value={r.name || ''}
              onChange={(e) => setRoles((old) => old.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
              placeholder="Role name"
              className="admin-inp"
            />
            <input
              value={(r.permissions || []).join(', ')}
              onChange={(e) =>
                setRoles((old) => old.map((x, idx) => (idx === i ? { ...x, permissions: splitCsv(e.target.value) } : x)))
              }
              placeholder="permissions (csv)"
              className="admin-inp-wide"
            />
            <input
              value={(r.allowedApps || []).join(', ')}
              onChange={(e) =>
                setRoles((old) => old.map((x, idx) => (idx === i ? { ...x, allowedApps: splitCsv(e.target.value) } : x)))
              }
              placeholder="allowed apps (csv)"
              className="admin-inp-wide"
            />
          </div>
        ))}
        <button type="button" className="admin-btn" onClick={() => void saveRoles()}>
          Save roles
        </button>
      </section>

      <section className="admin-card">
        <h2>Create user</h2>
        <div className="admin-form-grid">
          <input
            placeholder="Email"
            value={newUser.email}
            onChange={(e) => setNewUser((x) => ({ ...x, email: e.target.value }))}
            className="admin-inp"
          />
          <input
            placeholder="Name"
            value={newUser.name}
            onChange={(e) => setNewUser((x) => ({ ...x, name: e.target.value }))}
            className="admin-inp"
          />
          <input
            placeholder="Password (min 8)"
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser((x) => ({ ...x, password: e.target.value }))}
            className="admin-inp"
          />
          <input
            placeholder="Role IDs (csv)"
            value={newUser.roleIds}
            onChange={(e) => setNewUser((x) => ({ ...x, roleIds: e.target.value }))}
            className="admin-inp"
          />
          <input
            placeholder="Allowed apps (csv, optional)"
            value={newUser.allowedApps}
            onChange={(e) => setNewUser((x) => ({ ...x, allowedApps: e.target.value }))}
            className="admin-inp"
          />
          <input
            placeholder="Allowed tabs (csv)"
            value={newUser.allowedTabs}
            onChange={(e) => setNewUser((x) => ({ ...x, allowedTabs: e.target.value }))}
            className="admin-inp"
          />
        </div>
        <div className="admin-picker-block">
          <label className="admin-lbl">Assigned projects</label>
          <ProjectAssignPicker
            projects={projectCatalog}
            value={newUser.allowedProjects}
            onChange={(allowedProjects) => setNewUser((x) => ({ ...x, allowedProjects }))}
          />
        </div>
        <button type="button" className="admin-btn admin-btn-primary" onClick={() => void addUser()}>
          Create user
        </button>
      </section>

      <section className="admin-card">
        <h2>Users</h2>
        {users.map((u, i) => (
          <div key={u.id} className="admin-user-card">
            <div className="admin-user-email">{u.email}</div>
            <div className="admin-form-grid">
              <input
                value={u.name || ''}
                onChange={(e) => setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
                placeholder="Name"
                className="admin-inp"
              />
              <select
                value={u.status || 'active'}
                onChange={(e) => setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, status: e.target.value } : x)))}
                className="admin-inp"
              >
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
              <input
                value={(u.roleIds || []).join(', ')}
                onChange={(e) =>
                  setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, roleIds: splitCsv(e.target.value) } : x)))
                }
                placeholder="Role IDs"
                className="admin-inp"
              />
              <input
                value={(u.allowedTabs || []).join(', ')}
                onChange={(e) =>
                  setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, allowedTabs: splitCsv(e.target.value) } : x)))
                }
                placeholder="Allowed tabs"
                className="admin-inp"
              />
              <input
                value={(u.allowedApps || []).join(', ')}
                onChange={(e) =>
                  setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, allowedApps: splitCsv(e.target.value) } : x)))
                }
                placeholder={`Allowed apps (e.g. ${ALL_APPS.join(', ')})`}
                className="admin-inp-wide"
              />
            </div>
            <div className="admin-picker-block">
              <label className="admin-lbl">Assigned projects</label>
              <ProjectAssignPicker
                projects={projectCatalog}
                value={u.allowedProjects || []}
                onChange={(allowedProjects) =>
                  setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, allowedProjects } : x)))
                }
              />
            </div>
            <button type="button" className="admin-btn" onClick={() => void saveUser(u)}>
              Save user
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
