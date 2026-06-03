import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../lib/api.js';

const ALL_APPS = ['v1_cashflow', 'v2_resource_planner', 'v3_project_acquisition', 'sales_dashboard', 'marketing_kpi', 'preconstruction', 'execution', 'admin_security'];

function splitCsv(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

export default function AdminSecurityPage() {
  const [session, setSession] = useState(null);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', roleIds: 'viewer', allowedProjects: '', allowedTabs: '', allowedApps: '' });

  async function load() {
    setErr('');
    try {
      const s = await authApi.session();
      if (!s?.authenticated) throw new Error('Not logged in');
      if (!(s.user?.permissions || []).includes('manage_security')) throw new Error('Admin access required');
      setSession(s.user);
      const [r, u] = await Promise.all([authApi.listRoles(), authApi.listUsers()]);
      setRoles(r.roles || []);
      setUsers(u.users || []);
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
      allowedProjects: splitCsv(newUser.allowedProjects),
      allowedTabs: splitCsv(newUser.allowedTabs),
      allowedApps: splitCsv(newUser.allowedApps)
    });
    setNewUser({ email: '', name: '', password: '', roleIds: 'viewer', allowedProjects: '', allowedTabs: '', allowedApps: '' });
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
    <div className="admin-security" style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginTop: 0 }}>Admin Security</h1>
      <div style={{ marginBottom: 16 }}>
        <Link to="/">Back to Vault</Link>
      </div>
      {err ? <div style={{ color: '#ef4444', marginBottom: 12 }}>{err}</div> : null}
      {session ? <div style={{ marginBottom: 16, color: '#94a3b8' }}>Signed in as {session.email}</div> : null}

      <section style={{ marginBottom: 28 }}>
        <h3>Roles</h3>
        {roles.map((r, i) => (
          <div key={r._id} style={{ border: '1px solid #334155', padding: 10, borderRadius: 8, marginBottom: 8 }}>
            <input value={r._id} disabled style={{ marginRight: 8 }} />
            <input value={r.name || ''} onChange={(e) => setRoles((old) => old.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} placeholder="Role name" style={{ marginRight: 8 }} />
            <input value={(r.permissions || []).join(', ')} onChange={(e) => setRoles((old) => old.map((x, idx) => (idx === i ? { ...x, permissions: splitCsv(e.target.value) } : x)))} placeholder="permissions (csv)" style={{ width: 300, marginRight: 8 }} />
            <input value={(r.allowedApps || []).join(', ')} onChange={(e) => setRoles((old) => old.map((x, idx) => (idx === i ? { ...x, allowedApps: splitCsv(e.target.value) } : x)))} placeholder="allowed apps (csv)" style={{ width: 300 }} />
          </div>
        ))}
        <button onClick={saveRoles}>Save Roles</button>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h3>Create User</h3>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(2,minmax(280px,1fr))' }}>
          <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser((x) => ({ ...x, email: e.target.value }))} />
          <input placeholder="Name" value={newUser.name} onChange={(e) => setNewUser((x) => ({ ...x, name: e.target.value }))} />
          <input placeholder="Password (min 8)" type="password" value={newUser.password} onChange={(e) => setNewUser((x) => ({ ...x, password: e.target.value }))} />
          <input placeholder="Role IDs (csv)" value={newUser.roleIds} onChange={(e) => setNewUser((x) => ({ ...x, roleIds: e.target.value }))} />
          <input placeholder="Allowed apps (csv, optional)" value={newUser.allowedApps} onChange={(e) => setNewUser((x) => ({ ...x, allowedApps: e.target.value }))} />
          <input placeholder="Allowed projects (csv)" value={newUser.allowedProjects} onChange={(e) => setNewUser((x) => ({ ...x, allowedProjects: e.target.value }))} />
          <input placeholder="Allowed tabs (csv)" value={newUser.allowedTabs} onChange={(e) => setNewUser((x) => ({ ...x, allowedTabs: e.target.value }))} />
        </div>
        <button style={{ marginTop: 8 }} onClick={addUser}>
          Create User
        </button>
      </section>

      <section>
        <h3>Users</h3>
        {users.map((u, i) => (
          <div key={u.id} style={{ border: '1px solid #334155', padding: 10, borderRadius: 8, marginBottom: 8 }}>
            <div style={{ fontWeight: 700 }}>{u.email}</div>
            <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(2,minmax(260px,1fr))', marginTop: 6 }}>
              <input value={u.name || ''} onChange={(e) => setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} placeholder="Name" />
              <select value={u.status || 'active'} onChange={(e) => setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, status: e.target.value } : x)))}>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
              <input value={(u.roleIds || []).join(', ')} onChange={(e) => setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, roleIds: splitCsv(e.target.value) } : x)))} placeholder="Role IDs" />
              <input value={(u.allowedProjects || []).join(', ')} onChange={(e) => setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, allowedProjects: splitCsv(e.target.value) } : x)))} placeholder="Allowed projects" />
              <input value={(u.allowedTabs || []).join(', ')} onChange={(e) => setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, allowedTabs: splitCsv(e.target.value) } : x)))} placeholder="Allowed tabs" />
              <input value={(u.allowedApps || []).join(', ')} onChange={(e) => setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, allowedApps: splitCsv(e.target.value) } : x)))} placeholder={`Allowed apps (e.g. ${ALL_APPS.join(', ')})`} />
            </div>
            <button style={{ marginTop: 8 }} onClick={() => saveUser(u)}>
              Save User
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
