import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { authApi } from '../../lib/api.js';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { PS_NAV } from '../../lib/postSalesTabs.js';
import { PlatformShell } from '../../components/PlatformShell.jsx';
import { PostSalesFilterProvider } from '../../hooks/postsales/useInventoryFilters.js';
import '../../post-sales.css';

const VaultAskAi = lazy(() => import('../../components/ask/VaultAskAi.jsx').then((m) => ({ default: m.VaultAskAi })));

async function buildPostSalesAskContext() {
  const mod = await import('../../lib/vaultAskContextBuilders.js');
  return mod.buildPostSalesAskContext();
}

export default function PostSalesLayout() {
  const [user, setUser] = useState(null);
  const [syncNote, setSyncNote] = useState('');

  useEffect(() => {
    authApi.session().then((s) => setUser(s?.user || null));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem('ps_sync_note');
    if (cached) {
      setSyncNote(cached);
      return;
    }
    postSalesApi
      .getSyncPreferences()
      .then((prefs) => {
        const note = prefs.autoSyncUnitsOnLoad === false && prefs.autoSyncDemandsOnLoad === false
          ? 'Auto-sync paused — use Upload CRM data on Units for daily intake.'
          : 'Refresh data from Units → Sync from Cashflow V1 or Upload CRM when needed.';
        setSyncNote(note);
        sessionStorage.setItem('ps_sync_note', note);
      })
      .catch(() => {});
  }, []);

  return (
    <PlatformShell title="Post Sales Operations" breadcrumb="Vault / Post Sales">
      <PostSalesFilterProvider>
        <div className="ps-app">
          <header className="ps-topbar">
            <div>
              <h1>GA Post Sales Operations</h1>
              <div className="ps-topbar-sub">
                Your working app for sold units, collections, pipeline &amp; allocation · {user?.email || '—'}
              </div>
            </div>
            <nav className="ps-nav">
              {PS_NAV.map((n) => (
                <NavLink key={n.path} to={n.path} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {n.label}
                </NavLink>
              ))}
            </nav>
            <Link to="/" className="ps-vault-link">
              ← Vault
            </Link>
          </header>
          {syncNote ? (
            <div className="ps-card ps-sync-note">
              {syncNote} Achieved dates: <Link to="/app/post-sales/milestones">Milestones</Link> → Save &amp; sync →
              Reports &amp; Step 12. Collections: <Link to="/app/post-sales/demands">Demands</Link>.
            </div>
          ) : null}
          <main className="ps-body">
            <Outlet context={{ user }} />
          </main>
          <Suspense fallback={null}>
            <VaultAskAi
              appId="post_sales"
              appLabel="Post Sales Operations"
              exampleKey="post_sales"
              buildContext={buildPostSalesAskContext}
            />
          </Suspense>
        </div>
      </PostSalesFilterProvider>
    </PlatformShell>
  );
}
