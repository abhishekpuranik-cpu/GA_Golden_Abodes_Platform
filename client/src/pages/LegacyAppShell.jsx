import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  /** PreConstruction-style leave guard (Save / Don't Save / Cancel). Default on. */
  leaveGuard = true,
}) {
  const navigate = useNavigate();
  const iframeRef = useRef(null);
  const [unsavedPrompt, setUnsavedPrompt] = useState(/** @type {{ action: () => void } | null} */ (null));
  const [unsavedBusy, setUnsavedBusy] = useState(false);
  const [leaveHint, setLeaveHint] = useState('');
  const {
    status,
    mongoAt,
    autoSave,
    setAutoSave,
    pushToCloud,
    restoreFromCloud,
    hasRemoteUpdate,
    hasUnsaved,
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

  const runGuardedNav = useCallback(
    (action) => {
      if (typeof action !== 'function') return;
      if (!leaveGuard || !hasUnsaved) {
        action();
        return;
      }
      setLeaveHint('');
      setUnsavedPrompt({ action });
    },
    [hasUnsaved, leaveGuard]
  );

  const closeUnsavedPrompt = useCallback(() => {
    if (unsavedBusy) return;
    setUnsavedPrompt(null);
  }, [unsavedBusy]);

  const confirmUnsavedSave = useCallback(async () => {
    if (!unsavedPrompt?.action) return;
    setUnsavedBusy(true);
    setLeaveHint('');
    try {
      const ok = await pushToCloud();
      if (!ok) {
        setLeaveHint("Could not save — stay on this page or choose Don't Save");
        return;
      }
      const next = unsavedPrompt.action;
      setUnsavedPrompt(null);
      next();
    } finally {
      setUnsavedBusy(false);
    }
  }, [pushToCloud, unsavedPrompt]);

  const confirmUnsavedDiscard = useCallback(async () => {
    if (!unsavedPrompt?.action) return;
    setUnsavedBusy(true);
    try {
      const ok = await restoreFromCloud();
      if (!ok) {
        // Still allow leave — local dirty may be intentional discard when cloud is empty.
        console.warn('[Vault] Discard restore did not complete cleanly');
      }
      const next = unsavedPrompt.action;
      setUnsavedPrompt(null);
      next();
    } finally {
      setUnsavedBusy(false);
    }
  }, [restoreFromCloud, unsavedPrompt]);

  useEffect(() => {
    if (!leaveGuard || !hasUnsaved) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsaved, leaveGuard]);

  return (
    <PlatformShell
      title={title}
      breadcrumb={`Vault / ${title}`}
      showTopbar
      onLeaveAttempt={leaveGuard ? runGuardedNav : undefined}
    >
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
          <button
            type="button"
            onClick={() => runGuardedNav(() => navigate('/'))}
            style={{
              color: 'var(--ga-navy)',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            ← Vault
          </button>
          <span style={{ color: 'var(--ga-body)' }}>|</span>
          <span style={{ fontWeight: 800, color: 'var(--ga-navy)' }}>{title}</span>
          <span style={{ color: 'var(--ga-body)', fontSize: 12 }}>v{version || 0}</span>
          {leaveGuard && hasUnsaved ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#9a3412',
                background: 'rgba(240,89,44,0.12)',
                border: '1px solid rgba(240,89,44,0.35)',
                borderRadius: 999,
                padding: '2px 8px',
              }}
              title="Local edits not yet saved to cloud"
            >
              Unsaved
            </span>
          ) : null}
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

      {unsavedPrompt ? (
        <div
          className="unsaved-mb"
          role="presentation"
          onClick={closeUnsavedPrompt}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            zIndex: 650,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="unsaved-mbox"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 420,
              maxWidth: '100%',
              background: 'var(--ga-paper, #fff)',
              borderRadius: 10,
              border: '1px solid var(--ga-line, #e2e8f0)',
              boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)',
              zIndex: 700,
              padding: '18px 18px 14px',
            }}
          >
            <h3 id="unsaved-title" style={{ margin: '0 0 10px', fontSize: 16, color: 'var(--ga-navy, #0f172a)' }}>
              Unsaved changes
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#55504A', lineHeight: 1.55 }}>
              You have unsaved changes. Save them before leaving this page?
            </p>
            {leaveHint ? (
              <p style={{ margin: '-8px 0 14px', fontSize: 12, color: '#b91c1c', lineHeight: 1.4 }}>{leaveHint}</p>
            ) : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" disabled={unsavedBusy} onClick={closeUnsavedPrompt} style={btnGhost}>
                Cancel
              </button>
              <button
                type="button"
                disabled={unsavedBusy}
                onClick={() => void confirmUnsavedDiscard()}
                style={{ ...btnGhost, color: '#9a3412', borderColor: '#fdba74' }}
              >
                Don&apos;t Save
              </button>
              <button type="button" disabled={unsavedBusy} onClick={() => void confirmUnsavedSave()} style={btnPrimary}>
                {unsavedBusy ? 'Working…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
