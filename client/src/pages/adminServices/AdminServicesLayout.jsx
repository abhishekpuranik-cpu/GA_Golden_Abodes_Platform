import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { adminServicesApi } from '../../lib/adminServicesApi.js';
import { PlatformShell } from '../../components/PlatformShell.jsx';
import '../../admin-services.css';

const AsCtx = createContext(null);
export function useAdminServices() {
  return useContext(AsCtx);
}

export default function AdminServicesLayout() {
  const [tabs, setTabs] = useState([]);
  const [counts, setCounts] = useState({});
  const [meta, setMeta] = useState(null);
  const [locations, setLocations] = useState(null);
  const [ready, setReady] = useState(false);
  const [entityTag, setEntityTag] = useState(() => {
    try { return localStorage.getItem('as_entityTag') || 'PAD'; } catch { return 'PAD'; }
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    const t0 = performance.now();
    adminServicesApi.bootstrap({ entityTag, locations: '1' })
      .then((d) => {
        if (!alive) return;
        setTabs(d.tabs || []);
        setCounts(d.counts || {});
        setMeta(d.meta || null);
        setLocations(d.locations || []);
        setReady(true);
        if (d.meta?.entityTags?.length && !d.meta.entityTags.includes(entityTag)) {
          setEntityTag(d.meta.entityTags[0]);
        }
        if (import.meta.env.DEV) {
          console.debug(`[admin-services] bootstrap ${Math.round(performance.now() - t0)}ms`);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message || 'Failed to load');
          setReady(true);
        }
      });
    return () => { alive = false; };
  }, []);

  // Entity change — refresh slim locations only (skip first paint; bootstrap already loaded)
  const firstEntityPaint = useRef(true);
  useEffect(() => {
    if (!ready) return undefined;
    if (firstEntityPaint.current) {
      firstEntityPaint.current = false;
      try { localStorage.setItem('as_entityTag', entityTag); } catch { /* ignore */ }
      return undefined;
    }
    let alive = true;
    adminServicesApi.listLocations({ entityTag, limit: 200 })
      .then((d) => { if (alive) setLocations(d.locations || []); })
      .catch(() => { if (alive) setLocations([]); });
    try { localStorage.setItem('as_entityTag', entityTag); } catch { /* ignore */ }
    return () => { alive = false; };
  }, [entityTag, ready]);

  useEffect(() => {
    if (!ready || !tabs.length) return;
    const path = window.location.pathname.replace(/\/$/, '');
    if (path === '/app/admin-services') {
      navigate('/app/admin-services/travel/log', { replace: true });
    }
  }, [ready, tabs, navigate]);

  const ctx = useMemo(
    () => ({
      user: meta?.user || null,
      tabs,
      counts,
      meta,
      entityTag,
      setEntityTag,
      permissions: meta?.permissions || {},
      locations: locations || [],
      locationsReady: locations != null
    }),
    [tabs, counts, meta, entityTag, locations]
  );

  return (
    <PlatformShell title="Travel Expenses" breadcrumb="Vault / Travel Expenses">
      <div className="as-app">
        <header className="as-topbar">
          <div className="as-topbar-brand">
            <h1>Travel Expenses</h1>
            <div className="as-topbar-sub">{meta?.user?.email || '…'} · M9</div>
          </div>
          <div className="as-topbar-actions">
            <label className="as-entity-chip">
              Entity
              <select value={entityTag} onChange={(e) => setEntityTag(e.target.value)} aria-label="Entity">
                {(meta?.entityTags || ['PAD']).map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </label>
            <Link to="/" className="as-vault-link">← Vault</Link>
          </div>
        </header>
        <main className="as-body">
          {error && <p className="as-error">{error}</p>}
          {!ready ? (
            <div className="as-card" aria-busy="true">
              <div className="as-skeleton" style={{ width: '40%' }} />
              <div className="as-skeleton" style={{ width: '80%' }} />
              <div className="as-skeleton" style={{ width: '65%' }} />
            </div>
          ) : (
            <AsCtx.Provider value={ctx}>
              <Outlet />
            </AsCtx.Provider>
          )}
        </main>
      </div>
    </PlatformShell>
  );
}
