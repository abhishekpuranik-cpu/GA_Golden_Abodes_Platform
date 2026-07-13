import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { authApi } from '../../lib/api.js';
import { dmGovernanceApi } from '../../lib/dmGovernanceApi.js';
import { DM_NAV, DM_TABS } from '../../lib/dmGovernanceTabs.js';
import { VaultAskAi } from '../../components/ask/VaultAskAi.jsx';
import { buildDmAskContext } from '../../lib/vaultAskContextBuilders.js';
import '../../dm-governance.css';

export default function DmGovernanceLayout() {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const location = useLocation();

  useEffect(() => {
    authApi.session().then((s) => setUser(s?.user || null));
    dmGovernanceApi.meta().then(setMeta).catch(() => setMeta(null));
  }, []);

  const allowedTabs = new Set(meta?.tabs || []);

  return (
    <div className="dm-app">
      <header className="dm-topbar">
        <div>
          <h1>Business Health</h1>
          <div className="dm-topbar-sub">Golden Abodes · {user?.email || '—'}</div>
        </div>
        <nav className="dm-nav">
          {DM_NAV.filter((n) => {
            if (!meta?.tabs?.length) return true;
            if (n.id === DM_TABS.BUSINESS_HEALTH) {
              return allowedTabs.has(DM_TABS.BUSINESS_HEALTH) || allowedTabs.has(DM_TABS.DASHBOARD);
            }
            if (n.id === 'dm_approvals') return allowedTabs.has(DM_TABS.INVOICES) || allowedTabs.has('dm_approvals');
            if (n.id === 'dm_billing_config') return allowedTabs.has(DM_TABS.BILLING) || allowedTabs.has('dm_billing_config');
            if (n.id === 'dm_reconciliation') return allowedTabs.has(DM_TABS.REPORTS) || allowedTabs.has('dm_reconciliation');
            if (n.id === 'dm_expenses') return allowedTabs.has(DM_TABS.BILLING) || allowedTabs.has('dm_expenses');
            if (n.id === 'dm_risks') return allowedTabs.has(DM_TABS.DASHBOARD) || allowedTabs.has('dm_risks');
            if (n.id === DM_TABS.SCENARIOS) return allowedTabs.has(DM_TABS.BILLING) || allowedTabs.has(DM_TABS.SCENARIOS);
            if (n.id === DM_TABS.EXECUTIVE) return allowedTabs.has(DM_TABS.CONSOLIDATED) || allowedTabs.has(DM_TABS.EXECUTIVE) || allowedTabs.has(DM_TABS.DASHBOARD);
            if (n.id === DM_TABS.ALERTS) return allowedTabs.has(DM_TABS.DASHBOARD) || allowedTabs.has(DM_TABS.ALERTS);
            return allowedTabs.has(n.id);
          }).map((n) => (
            <NavLink key={n.path} to={n.path} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <Link to="/" className="dm-vault-link">
          ← Vault
        </Link>
      </header>
      <main className="dm-body">
        <Outlet context={{ user, meta, pathname: location.pathname }} />
      </main>
      <VaultAskAi
        appId="dm_spv_governance"
        appLabel="Business Health"
        exampleKey="dm_spv_governance"
        buildContext={buildDmAskContext}
      />
    </div>
  );
}
