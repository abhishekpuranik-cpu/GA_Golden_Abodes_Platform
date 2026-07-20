import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { authApi } from '../../lib/api.js';
import { hiringApi } from '../../lib/hiringApi.js';
import { HIRING_NAV } from '../../lib/hiringTabs.js';
import { VaultAskAi } from '../../components/ask/VaultAskAi.jsx';
import { buildHiringAskContext } from '../../lib/vaultAskContextBuilders.js';
import { ModuleFrame } from '../../components/ModuleFrame.jsx';
import '../../hiring.css';

export default function HiringLayout() {
  const [user, setUser] = useState(null);
  const [health, setHealth] = useState(null);

  useEffect(() => {
    authApi.session().then((s) => setUser(s?.user || null)).catch(() => setUser(null));
    hiringApi.health().then(setHealth).catch(() => setHealth({ sourcingMode: 'manual' }));
  }, []);

  const canWrite =
    (user?.roleIds || []).some((r) => ['admin', 'hiring_manager'].includes(r)) ||
    (user?.permissions || []).includes('manage_security') ||
    (user?.allowedApps || []).includes('hiring');

  return (
    <>
      <ModuleFrame
        title="Hiring & Sourcing"
        breadcrumb="Vault / Hiring"
        heroTitle="Hiring & Sourcing"
        heroSub={
          <>
            {user?.email || '—'}
            {health && <span> · Sourcing: {health.sourcingMode === 'auto' ? 'Metaview' : 'Manual import'}</span>}
          </>
        }
        navItems={HIRING_NAV}
        brandTitle="GA Hiring"
        brandSub="Sourcing"
      >
        <div className="hr-app">
          <Outlet context={{ user, canWrite, sourcingAuto: health?.sourcingMode === 'auto' }} />
        </div>
      </ModuleFrame>
      <VaultAskAi
        appId="hiring"
        appLabel="Hiring & Sourcing"
        exampleKey="hiring"
        buildContext={buildHiringAskContext}
      />
    </>
  );
}
