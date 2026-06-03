import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { usePlannerIframeSync } from '../hooks/usePlannerIframeSync.js';

export default function LegacyAppShell({
  title,
  htmlFile,
  appId,
  keysList,
  iframeSrc,
  workspaceBlobKey,
  /** Off by default for V3 — periodic save was overwriting Mongo with stale 2-project tabs; server merge fixes that, but disabling avoids noise. */
  defaultAutoSave = true
}) {
  const iframeRef = useRef(null);
  const { status, mongoAt, autoSave, setAutoSave, pushToCloud, restoreFromCloud, hasRemoteUpdate, version, snapshots, restoreSnapshotById } =
    usePlannerIframeSync({
    iframeRef,
    appId,
    keysList,
    workspaceBlobKey,
    defaultAutoSave,
    autoSaveMs: 60_000
    });

  /** e.g. `/v1/index.html` for React GA_Cashflow_V1 built with base `/v1/`; otherwise legacy single-file under `/legacy/`. */
  const src = iframeSrc?.trim() || `/legacy/${encodeURI(htmlFile || '')}`;
  const statusColor = status?.level === 'err' ? '#b91c1c' : status?.level === 'ok' ? '#166534' : '#475569';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0f4fa' }}>
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
          ← Vault
        </Link>
        <span style={{ color: '#94a3b8' }}>|</span>
        <span style={{ fontWeight: 800, color: '#0a3266' }}>{title}</span>
        <span style={{ color: '#64748b', fontSize: 12 }}>v{version || 0}</span>
        <span style={{ flex: 1 }} />
        {hasRemoteUpdate ? (
          <button
            type="button"
            onClick={() => void restoreFromCloud()}
            style={{ ...btnGhost, borderColor: '#d97706', color: '#a16207', background: '#fffbeb' }}
          >
            New team update — Load latest
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
          style={selectStyle}
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
      <iframe ref={iframeRef} title={title} src={src} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
    </div>
  );
}

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

const selectStyle = {
  padding: '7px 10px',
  borderRadius: 8,
  background: '#fff',
  border: '1.5px solid #cbd5e1',
  color: '#0a3266',
  fontWeight: 600,
  fontSize: 12
};
