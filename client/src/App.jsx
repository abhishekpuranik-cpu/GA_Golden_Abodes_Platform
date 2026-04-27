import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { APP_IDS, APP_LOCAL_STORAGE_KEYS } from './appRegistry.js';
import LegacyAppShell from './pages/LegacyAppShell.jsx';

const VaultHome = lazy(() => import('./pages/VaultHome.jsx'));

function Fall() {
  return (
    <div
      style={{
        minHeight: '40vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94a3b8',
        fontFamily: 'system-ui'
      }}
    >
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<Fall />}>
      <Routes>
        <Route path="/" element={<VaultHome />} />
        <Route
          path="/app/resource-planner"
          element={
            <LegacyAppShell
              title="Resource Planner (V2)"
              htmlFile="GA_ResourcePlanner_V2.html"
              appId={APP_IDS.V2_RESOURCE_PLANNER}
              keysList={APP_LOCAL_STORAGE_KEYS[APP_IDS.V2_RESOURCE_PLANNER]}
            />
          }
        />
        <Route
          path="/app/org-planner"
          element={
            <LegacyAppShell
              title="Project Acquisition (V3)"
              htmlFile="GA_OrgResourcePlanner_V3.html"
              appId={APP_IDS.V3_ORG_PLANNER}
              keysList={APP_LOCAL_STORAGE_KEYS[APP_IDS.V3_ORG_PLANNER]}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
