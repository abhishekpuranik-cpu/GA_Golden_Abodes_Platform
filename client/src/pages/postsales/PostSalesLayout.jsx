import { useEffect, useState } from 'react';

import { Link, NavLink, Outlet } from 'react-router-dom';
import { authApi } from '../../lib/api.js';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { invalidatePostSalesCache } from '../../lib/postsales/postSalesCache.js';
import { PS_NAV } from '../../lib/postSalesTabs.js';
import { VaultAskAi } from '../../components/ask/VaultAskAi.jsx';
import { buildPostSalesAskContext } from '../../lib/vaultAskContextBuilders.js';
import '../../post-sales.css';



export default function PostSalesLayout() {

  const [user, setUser] = useState(null);

  const [syncNote, setSyncNote] = useState('');

  const [syncing, setSyncing] = useState(false);



  useEffect(() => {

    authApi.session().then((s) => setUser(s?.user || null));

  }, []);



  useEffect(() => {

    const cached = sessionStorage.getItem('ps_sync_note');

    if (cached) {

      setSyncNote(cached);

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

        invalidatePostSalesCache('units');

        invalidatePostSalesCache('inv-filters');

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

      {syncing && (

        <div className="ps-sync-banner" role="status">

          Syncing sold units &amp; collections in the background…

        </div>

      )}

      {!syncing && syncNote && (

        <div className="ps-card ps-sync-note">

          {syncNote}. Achieved dates: <Link to="/app/post-sales/milestones">Milestones</Link> → Save &amp; sync → Reports &amp; Step 12. Collections: <Link to="/app/post-sales/demands">Demands</Link> — Cashflow V1 reads from here.

        </div>

      )}

      <main className="ps-body">
        <Outlet context={{ user }} />
      </main>
      <VaultAskAi
        appId="post_sales"
        appLabel="Post Sales Operations"
        exampleKey="post_sales"
        buildContext={buildPostSalesAskContext}
      />
    </div>
  );
}


