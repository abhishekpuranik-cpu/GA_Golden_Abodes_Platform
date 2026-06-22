import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { authApi } from '../../lib/api.js';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { PS_NAV } from '../../lib/postSalesTabs.js';
import '../../post-sales.css';

export default function PostSalesLayout() {
  const [user, setUser] = useState(null);
  const [syncNote, setSyncNote] = useState('');
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    authApi.session().then((s) => setUser(s?.user || null));
  }, []);

  useEffect(() => {
    const cached = sessionStorage.getItem('ps_sync_note');
    if (cached) {
      setSyncNote(cached);
      setSyncing(false);
      return;
    }
    setSyncing(true);
    postSalesApi.getSyncPreferences()
      .then((prefs) => {
        if (prefs.autoSyncUnitsOnLoad === false && prefs.autoSyncDemandsOnLoad === false) {
          const note = 'Auto-sync paused — use Upload CRM data on Units for daily intake.';
          setSyncNote(note);
          sessionStorage.setItem('ps_sync_note', note);
          return null;
        }
        return postSalesApi.bootstrap({ syncUnits: prefs.autoSyncUnitsOnLoad !== false, syncDemands: prefs.autoSyncDemandsOnLoad !== false });
      })
      .then((r) => {
        if (!r) return;
        if (r.skipped?.length) {
          const note = `Auto-sync paused (${r.skipped.join(', ')}). Import units manually or use Sync from Cashflow V1 on Units.`;
          setSyncNote(note);
          sessionStorage.setItem('ps_sync_note', note);
          return;
        }
        const parts = [];
        if (r.units?.ok) parts.push(`${r.units.updated || 0} units linked from Cashflow V1`);
        if (r.demands?.ok) parts.push(`${(r.demands.created || 0) + (r.demands.updated || 0)} collection rows refreshed`);
        const note = parts.length ? parts.join(' · ') : 'Ready';
        setSyncNote(note);
        sessionStorage.setItem('ps_sync_note', note);
      })
      .catch((e) => {
        const note = e.message || 'Sync skipped';
        setSyncNote(note);
        sessionStorage.setItem('ps_sync_note', note);
      })
      .finally(() => setSyncing(false));
  }, []);

  return (
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
        <Link to="/" className="ps-vault-link">← Vault</Link>
      </header>
      {!syncing && syncNote && (
        <div className="ps-card" style={{ margin: '0 0 12px', padding: '10px 14px', background: 'var(--ps-accent-soft)', borderColor: '#bfdbfe', fontSize: '0.85rem' }}>
          {syncNote}. Upload CLP &amp; collections in <Link to="/app/post-sales/demands">Demands</Link> — Cashflow V1 reads from here.
        </div>
      )}
      {syncing && (
        <div className="ps-empty" style={{ marginBottom: 12 }}>Syncing sold units &amp; collections…</div>
      )}
      <main className="ps-body">
        <Outlet context={{ user }} />
      </main>
    </div>
  );
}
