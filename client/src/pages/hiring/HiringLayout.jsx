import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { authApi } from '../../lib/api.js';
import { hiringApi } from '../../lib/hiringApi.js';
import { HIRING_NAV } from '../../lib/hiringTabs.js';
import '../../hiring.css';

export default function HiringLayout() {
  const [user, setUser] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    authApi.session().then((s) => setUser(s?.user || null)).catch(() => setUser(null));
    hiringApi.health().then(setHealth).catch(() => setHealth({ sourcingMode: 'manual' }));
  }, []);

  const canWrite = (user?.roleIds || []).some((r) => ['admin', 'hiring_manager'].includes(r))
    || (user?.permissions || []).includes('manage_security');

  return (
    <div className="hr-app">
      <header className="hr-topbar">
        <div>
          <h1>GA Hiring &amp; Sourcing</h1>
          <div className="hr-topbar-sub">
            {user?.email || '—'}
            {health && (
              <span> · Sourcing: {health.sourcingMode === 'auto' ? 'Metaview' : 'Manual import'}</span>
            )}
          </div>
        </div>
        <nav className="hr-nav">
          {HIRING_NAV.map((n) => (
            <NavLink key={n.path} to={n.path} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/" className="hr-vault-link">← Vault</Link>
      </header>
      <main className="hr-body">
        <Outlet context={{ user, canWrite, sourcingAuto: health?.sourcingMode === 'auto' }} />
      </main>
    </div>
  );
}
