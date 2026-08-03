import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { authApi } from '../../lib/api.js';
import { adminServicesApi } from '../../lib/adminServicesApi.js';
import { PlatformShell } from '../../components/PlatformShell.jsx';
import '../../admin-services.css';

const AsCtx = createContext(null);
export function useAdminServices() {
  return useContext(AsCtx);
}

export default function AdminServicesLayout() {
  const [user, setUser] = useState(null);
  const [tabs, setTabs] = useState([]);
  const [counts, setCounts] = useState({});
  const [meta, setMeta] = useState(null);
  const [entityTag, setEntityTag] = useState(() => {
    try { return localStorage.getItem('as_entityTag') || 'PAD'; } catch { return 'PAD'; }
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const params = useParams();

  useEffect(() => {
    authApi.session().then((s) => setUser(s?.user || null)).catch(() => setUser(null));
    Promise.all([
      adminServicesApi.tabs(),
      adminServicesApi.tabCounts(),
      adminServicesApi.meta()
    ])
      .then(([t, c, m]) => {
        setTabs(t.tabs || []);
        setCounts(c.counts || {});
        setMeta(m);
        if (m?.entityTags?.length && !m.entityTags.includes(entityTag)) {
          setEntityTag(m.entityTags[0]);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    try { localStorage.setItem('as_entityTag', entityTag); } catch { /* ignore */ }
  }, [entityTag]);

  const ctx = useMemo(
    () => ({ user, tabs, counts, meta, entityTag, setEntityTag, permissions: meta?.permissions || {} }),
    [user, tabs, counts, meta, entityTag]
  );

  // Deep-link default: if at /app/admin-services exactly, go to travel if available
  useEffect(() => {
    if (!tabs.length) return;
    if (!params['*'] && window.location.pathname.replace(/\/$/, '') === '/app/admin-services') {
      const travel = tabs.find((t) => t.key === 'travel');
      if (travel) navigate('/app/admin-services/travel/log', { replace: true });
    }
  }, [tabs, navigate, params]);

  return (
    <PlatformShell title="Admin Services" breadcrumb="Vault / Admin Services">
      <div className="as-app">
        <header className="as-topbar">
          <div>
            <h1>Admin Services</h1>
            <div className="as-topbar-sub">{user?.email || '—'} · M9</div>
          </div>
          <nav className="as-nav" aria-label="Admin Services tabs">
            {tabs.map((t) => (
              <NavLink
                key={t.key}
                to={`/app/admin-services${t.route}`}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {t.displayName}
                {counts[t.key] ? <span className="as-badge">{counts[t.key]}</span> : null}
              </NavLink>
            ))}
          </nav>
          <Link to="/" className="as-vault-link">← Vault</Link>
        </header>
        <main className="as-body">
          {error && <p className="as-error">{error}</p>}
          <div className="as-shell-bar">
            <label>
              Entity
              <select value={entityTag} onChange={(e) => setEntityTag(e.target.value)}>
                {(meta?.entityTags || ['PAD']).map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </label>
          </div>
          <AsCtx.Provider value={ctx}>
            <Outlet />
          </AsCtx.Provider>
        </main>
      </div>
    </PlatformShell>
  );
}

export function ReservedTab({ name }) {
  return (
    <div className="as-card">
      <h2>{name}</h2>
      <p className="as-muted">Reserved for a future release. Registry entry only — no models or routes yet.</p>
    </div>
  );
}

export function RequireTravelPerm({ need, children }) {
  const { permissions } = useAdminServices() || { permissions: {} };
  const ok = Array.isArray(need) ? need.some((n) => permissions[n]) : permissions[need];
  if (!ok) return <Navigate to="/app/admin-services/travel/log" replace />;
  return children;
}
