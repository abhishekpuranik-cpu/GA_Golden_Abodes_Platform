import { lazy, Suspense, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePlannerWindowSync } from '../hooks/usePlannerWindowSync.js';
import { APP_IDS, APP_LOCAL_STORAGE_KEYS } from '../appRegistry.js';
import '@gaV1/index.css';

const V1App = lazy(() => import('@gaV1/App.jsx'));
const keysList = APP_LOCAL_STORAGE_KEYS[APP_IDS.V1_CASHFLOW];

const btnPrimary = {
  padding: '7px 14px',
  borderRadius: 8,
  border: '1.5px solid #1558a0',
  background: '#1558a0',
  color: '#fff',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer'
};

const btnGhost = {
  padding: '7px 14px',
  borderRadius: 8,
  background: '#fff',
  border: '1.5px solid #cbd5e1',
  color: '#0a3266',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer'
};

function V1LoadFallback() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--cf-bg, #e8e8e0)',
        color: 'var(--cf-muted, #4a4a4a)',
        fontFamily: 'system-ui, sans-serif'
      }}
    >
      Loading Cashflow (V1)…
    </div>
  );
}

export default function CashflowV1Embedded() {
  const [appKey, setAppKey] = useState(0);
  const {
    status,
    mongoAt,
    autoSave,
    setAutoSave,
    pushToCloud,
    restoreFromCloud,
    hasRemoteUpdate,
    version,
    workspaceReady,
    snapshots,
    restoreSnapshotById
  } = usePlannerWindowSync({
      appId: APP_IDS.V1_CASHFLOW,
      keysList,
      autoSaveMs: 60_000,
      onAfterRestore: () => setAppKey((k) => k + 1)
    });
  const statusColor = status?.level === 'err' ? '#b91c1c' : status?.level === 'ok' ? '#166534' : '#475569';

  return (
    <div className="ga-v1-embed app-shell-full" style={{ background: '#f0f4fa' }}>
      <div
        className="planner-toolbar"
        style={{
          flexShrink: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
          boxShadow: '0 1px 0 rgba(15, 23, 42, 0.04)'
        }}
      >
        <Link to="/" style={{ color: '#0a3266', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
          &larr; Vault
        </Link>
        <span style={{ color: '#94a3b8' }}>|</span>
        <span style={{ fontWeight: 800, color: '#0a3266' }}>Cashflow Tracker (V1)</span>
        <span style={{ color: '#64748b', fontSize: 12 }}>embedded React · v{version || 0}</span>
        <span style={{ flex: 1 }} />
        {hasRemoteUpdate ? (
          <button
            type="button"
            onClick={() => void restoreFromCloud()}
            style={{ ...btnGhost, borderColor: '#d97706', color: '#a16207', background: '#fffbeb' }}
          >
            New team update &mdash; Load latest
          </button>
        ) : null}
        <label style={{ fontSize: 12, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
          Auto-save 60s
        </label>
        <button type="button" onClick={() => void restoreFromCloud()} style={btnGhost}>
          Restore from cloud
        </button>
        <select
          defaultValue=""
          onChange={(e) => {
            const id = e.target.value;
            if (!id) return;
            void restoreSnapshotById(id);
            e.target.value = '';
          }}
          style={btnGhost}
          title="Restore one of the latest 2 snapshots"
        >
          <option value="">Restore snapshot (last 2)</option>
          {snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {new Date(s.createdAt).toLocaleString()}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void pushToCloud()} style={btnPrimary}>
          Save to cloud now
        </button>
      </div>
      {status ? (
        <div
          style={{
            fontSize: 12,
            color: statusColor,
            padding: '6px 14px',
            borderBottom: '1px solid #e2e8f0',
            background: '#eff6ff'
          }}
        >
          {status.text}
          {mongoAt ? ` · Last cloud: ${new Date(mongoAt).toLocaleString()}` : ''}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {!workspaceReady ? (
          <V1LoadFallback />
        ) : (
          <Suspense fallback={<V1LoadFallback />}>
            <V1App key={appKey} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
