import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../lib/api.js';
import { ProjectAssignPicker } from '../components/ProjectAssignPicker.jsx';
import { BandwidthReport } from '../components/BandwidthReport.jsx';
import { PlatformShell } from '../components/PlatformShell.jsx';
import { HeroBand } from '../components/ga-kit/HeroBand.jsx';
import '../theme/ga-module.css';

const ALL_APPS = ['v1_cashflow', 'v2_resource_planner', 'v3_project_acquisition', 'sales_dashboard', 'marketing_kpi', 'preconstruction', 'execution', 'finance_kpi', 'finance_kpi_admin', 'dm_spv_governance', 'post_sales', 'hiring', 'admin_security'];

const ALL_DM_TABS = 'dm_dashboard, dm_spvs, dm_projects, dm_billing, dm_invoices, dm_compliance, dm_reports, dm_scenarios, dm_executive, dm_alerts, dm_consolidated, dm_settings';

function splitCsv(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

const emptyNewUser = () => ({
  email: '',
  name: '',
  phone: '',
  password: '',
  roleIds: 'viewer',
  allowedProjects: [],
  allowedTabs: '',
  allowedApps: ''
});

function generatePassword(len = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
  let out = '';
  for (let i = 0; i < len; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

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
  const [resetTargetId, setResetTargetId] = useState(null);
  const [resetForm, setResetForm] = useState({ password: '', confirm: '' });
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [resetErr, setResetErr] = useState('');
  const [showResetPw, setShowResetPw] = useState(false);

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
      phone: newUser.phone,
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
      phone: u.phone,
      status: u.status,
      roleIds: Array.isArray(u.roleIds) ? u.roleIds : splitCsv(u.roleIds),
      allowedApps: u.allowedApps || [],
      allowedProjects: u.allowedProjects || [],
      allowedTabs: u.allowedTabs || []
    });
    await load();
  }

  function openResetPanel(u) {
    if (resetTargetId === u.id) {
      setResetTargetId(null);
      setResetForm({ password: '', confirm: '' });
      setResetMsg('');
      setResetErr('');
      setShowResetPw(false);
      return;
    }
    setResetTargetId(u.id);
    setResetForm({ password: '', confirm: '' });
    setResetMsg('');
    setResetErr('');
    setShowResetPw(false);
  }

  function fillGeneratedPassword() {
    const p = generatePassword();
    setResetForm({ password: p, confirm: p });
    setShowResetPw(true);
    setResetMsg('');
    setResetErr('');
  }

  async function submitReset(u) {
    setResetErr('');
    setResetMsg('');
    const password = resetForm.password.trim();
    const confirm = resetForm.confirm.trim();
    if (password.length < 8) {
      setResetErr('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setResetErr('Passwords do not match.');
      return;
    }
    if (
      !window.confirm(
        `Reset password for ${u.email}?\n\nThey will be signed out on all devices and must use the new password to log in.`
      )
    ) {
      return;
    }
    setResetBusy(true);
    try {
      await authApi.resetUserPassword(u.id, password);
      setResetMsg(`Password updated for ${u.email}. Share the new password securely — their active sessions were cleared.`);
      setResetForm({ password: '', confirm: '' });
      setShowResetPw(false);
    } catch (e) {
      setResetErr(e?.message || 'Reset failed');
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <PlatformShell title="Admin Security" breadcrumb="Vault / Admin Security">
    <HeroBand
      eyebrow="GOLDEN ABODES · SECURITY"
      title="Admin Security"
      sub="Users, project access, and team bandwidth across PreConstruction projects"
      actions={
        <Link to="/" className="admin-back ga-btn ga-btn-glass">
          ← Back to Vault
        </Link>
      }
    />
    <div className="admin-security">
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
            placeholder="WhatsApp phone (e.g. 9876543210 or +91…)"
            value={newUser.phone}
            onChange={(e) => setNewUser((x) => ({ ...x, phone: e.target.value }))}
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
            value={newUser.allowedTabs}
            onChange={(e) => setNewUser((x) => ({ ...x, allowedTabs: e.target.value }))}
            className="admin-inp"
            placeholder={ALL_DM_TABS}
            title="DM tabs: dm_dashboard, dm_spvs, dm_projects, dm_billing, dm_invoices, dm_compliance, dm_reports, dm_scenarios, dm_executive, dm_alerts, dm_consolidated, dm_settings"
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
              <input
                value={u.phone || ''}
                onChange={(e) => setUsers((old) => old.map((x, idx) => (idx === i ? { ...x, phone: e.target.value } : x)))}
                placeholder="WhatsApp phone"
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
                placeholder={`Allowed tabs — DM: ${ALL_DM_TABS}`}
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
            <div className="admin-user-actions">
              <button type="button" className="admin-btn" onClick={() => void saveUser(u)}>
                Save user
              </button>
              <button
                type="button"
                className="admin-btn admin-btn-warn"
                onClick={() => openResetPanel(u)}
              >
                {resetTargetId === u.id ? 'Cancel reset' : 'Reset password'}
              </button>
            </div>
            {resetTargetId === u.id ? (
              <div className="admin-reset-panel">
                <h3>Reset password for {u.email}</h3>
                <p className="admin-reset-hint">
                  Set a new login password for this user. Minimum 8 characters. All their active sessions will end
                  immediately.
                </p>
                <div className="admin-form-grid">
                  <input
                    type={showResetPw ? 'text' : 'password'}
                    placeholder="New password (min 8)"
                    value={resetForm.password}
                    onChange={(e) => setResetForm((f) => ({ ...f, password: e.target.value }))}
                    className="admin-inp"
                    autoComplete="new-password"
                  />
                  <input
                    type={showResetPw ? 'text' : 'password'}
                    placeholder="Confirm new password"
                    value={resetForm.confirm}
                    onChange={(e) => setResetForm((f) => ({ ...f, confirm: e.target.value }))}
                    className="admin-inp"
                    autoComplete="new-password"
                  />
                </div>
                <div className="admin-user-actions">
                  <button type="button" className="admin-btn" onClick={fillGeneratedPassword}>
                    Generate secure password
                  </button>
                  <button
                    type="button"
                    className="admin-btn"
                    onClick={() => setShowResetPw((v) => !v)}
                  >
                    {showResetPw ? 'Hide' : 'Show'} password
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn-primary"
                    disabled={resetBusy}
                    onClick={() => void submitReset(u)}
                  >
                    {resetBusy ? 'Updating…' : 'Set new password'}
                  </button>
                </div>
                {resetErr ? <div className="admin-err">{resetErr}</div> : null}
                {resetMsg ? <div className="admin-ok">{resetMsg}</div> : null}
              </div>
            ) : null}
          </div>
        ))}
      </section>
    </div>
    </PlatformShell>
  );
}
