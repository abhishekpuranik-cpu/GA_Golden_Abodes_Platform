import { useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { usePlannerIframeSync } from '../hooks/usePlannerIframeSync.js';
import { injectLegacyMobileCss } from '../lib/injectLegacyMobileCss.js';
import { VaultAskAi } from '../components/ask/VaultAskAi.jsx';
import { buildPlannerAskContext } from '../lib/vaultAskContextBuilders.js';
import { PlatformShell } from '../components/PlatformShell.jsx';

export default function LegacyAppShell({
  title,
  htmlFile,
  appId,
  keysList,
  iframeSrc,
  workspaceBlobKey,
  /** Bump when legacy HTML ships; busts browser cache for V3 plotting / project form updates. */
  htmlCacheVersion,
  /** Off by default for V3 — periodic save was overwriting Mongo with stale 2-project tabs; server merge fixes that, but disabling avoids noise. */
  defaultAutoSave = true,
}) {
  const iframeRef = useRef(null);
  const {
    status,
    mongoAt,
    autoSave,
    setAutoSave,
    pushToCloud,
    restoreFromCloud,
    hasRemoteUpdate,
    version,
    snapshots,
    restoreSnapshotById,
  } = usePlannerIframeSync({
    iframeRef,
    appId,
    keysList,
    workspaceBlobKey,
    defaultAutoSave,
    autoSaveMs: 60_000,
  });

  /** e.g. `/v1/index.html` for React GA_Cashflow_V1 built with base `/v1/`; otherwise legacy single-file under `/legacy/`. */
  const baseSrc = iframeSrc?.trim() || `/legacy/${encodeURI(htmlFile || '')}`;
  const src = htmlCacheVersion
    ? `${baseSrc}${baseSrc.includes('?') ? '&' : '?'}v=${encodeURIComponent(htmlCacheVersion)}`
    : baseSrc;
  const statusColor = status?.level === 'err' ? '#b91c1c' : status?.level === 'ok' ? '#166534' : '#475569';
  const onIframeLoad = useCallback(() => {
    injectLegacyMobileCss(iframeRef.current);
  }, []);

  const buildContext = useCallback(() => buildPlannerAskContext(appId, title), [appId, title]);

  return (
    <PlatformShell title={title} breadcrumb={`Vault / ${title}`} showTopbar>
      <div className="app-shell-full" style={{ background: 'var(--ga-canvas)', minHeight: 'calc(100dvh - 64px)' }}>
        <div
          className="planner-toolbar"
          style={{
            flexShrink: 0,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderBottom: '1px solid var(--ga-line)',
            background: 'var(--ga-paper)',
            boxShadow: '0 1px 0 rgba(33, 38, 49, 0.04)',
          }}
        >
          <Link to="/" style={{ color: 'var(--ga-navy)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
            ← Vault
          </Link>
          <span style={{ color: 'var(--ga-body)' }}>|</span>
          <span style={{ fontWeight: 800, color: 'var(--ga-navy)' }}>{title}</span>
          <span style={{ color: 'var(--ga-body)', fontSize: 12 }}>v{version || 0}</span>
          <span style={{ flex: 1 }} />
          {hasRemoteUpdate ? (
            <button
              type="button"
              onClick={() => void restoreFromCloud()}
              style={{
                ...btnGhost,
                borderColor: 'var(--ga-orange)',
                color: 'var(--ga-orange-hi)',
                background: 'rgba(240,89,44,0.08)',
              }}
            >
              New team update — Load latest
            </button>
          ) : null}
          <label style={{ fontSize: 12, color: 'var(--ga-body)', display: 'flex', alignItems: 'center', gap: 6 }}>
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
              borderBottom: '1px solid var(--ga-line)',
              background: 'var(--ga-paper)',
            }}
          >
            {status.text}
            {mongoAt ? ` · Last cloud: ${new Date(mongoAt).toLocaleString()}` : ''}
          </div>
        ) : null}
        <div className="legacy-iframe-wrap">
          <iframe
            ref={iframeRef}
            title={title}
            src={src}
            onLoad={onIframeLoad}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block', flex: 1, minHeight: 0 }}
          />
        </div>
        <VaultAskAi appId={appId} appLabel={title} buildContext={buildContext} />
      </div>
    </PlatformShell>
  );
}

const btnPrimary = {
  padding: '7px 14px',
  borderRadius: 4,
  border: '1.5px solid var(--ga-orange)',
  background: 'var(--ga-orange)',
  color: '#fff',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const btnGhost = {
  padding: '7px 14px',
  borderRadius: 4,
  background: 'var(--ga-paper)',
  border: '1.5px solid var(--ga-line)',
  color: 'var(--ga-navy)',
  fontWeight: 600,
  fontSize: 12,
  cursor: 'pointer',
};

const selectStyle = {
  padding: '7px 10px',
  borderRadius: 4,
  background: 'var(--ga-paper)',
  border: '1.5px solid var(--ga-line)',
  color: 'var(--ga-navy)',
  fontWeight: 600,
  fontSize: 12,
};
