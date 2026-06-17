import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { authApi } from '../../lib/api.js';
import { PS_NAV } from '../../lib/postSalesTabs.js';
import '../../post-sales.css';

export default function PostSalesLayout() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    authApi.session().then((s) => setUser(s?.user || null));
  }, []);

  return (
    <div className="ps-app">
      <header className="ps-topbar">
        <div>
          <h1>GA Post Sales Operations</h1>
          <div className="ps-topbar-sub">20-step pipeline · {user?.email || '—'}</div>
        </div>
        <nav className="ps-nav">
          {PS_NAV.map((n) => (
            <NavLink key={n.path} to={n.path} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/" className="ps-vault-link">← Vault</Link>
      </header>
      <main className="ps-body">
        <Outlet context={{ user }} />
      </main>
    </div>
  );
}
