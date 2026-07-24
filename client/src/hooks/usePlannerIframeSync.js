import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appStateApi } from '../lib/api.js';

function readKeysFromWindow(win, keysList) {
  const keys = {};
  if (!win?.localStorage) return keys;
  for (const k of keysList) {
    try {
      const v = win.localStorage.getItem(k);
      if (v != null) keys[k] = v;
    } catch {
      /* ignore */
    }
  }
  return keys;
}

/** Mongo may round-trip numbers/booleans; localStorage values must be strings. */
function encodeStorageValue(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function writeKeysToWindow(win, map) {
  if (!win?.localStorage || !map) return;
  const errors = [];
  for (const [k, v] of Object.entries(map)) {
    if (v == null) continue;
    const str = encodeStorageValue(v);
    if (str == null) continue;
    try {
      win.localStorage.setItem(k, str);
    } catch (e) {
      errors.push(`${k}: ${e?.message || e}`);
    }
  }
  if (errors.length) {
    throw new Error(`Could not write workspace to browser storage (${errors.join('; ')}). Try freeing disk space, closing other tabs, or use another browser profile.`);
  }
}

/** Full planner snapshot JSON stored under ga_planner_state_v1 / ga_rp_state_v1 etc. */
function isValidWorkspaceBlob(raw) {
  if (typeof raw !== 'string' || raw.length < 25) return false;
  try {
    const o = JSON.parse(raw);
    return o !== null && typeof o === 'object';
  } catch {
    return false;
  }
}

/** Local workspace edit time (ms) from blob.ts — 0 if missing/invalid. */
function readLocalWorkspaceTs(win, workspaceBlobKey) {
  if (!win?.localStorage || !workspaceBlobKey) return 0;
  try {
    const raw = win.localStorage.getItem(workspaceBlobKey);
    if (!isValidWorkspaceBlob(raw)) return 0;
    const o = JSON.parse(raw);
    return Number(o?.ts) || 0;
  } catch {
    return 0;
  }
}

function flushLegacyIframeSave(win) {
  try {
    if (typeof win?.gaAutoSave === 'function') win.gaAutoSave();
  } catch (e) {
    console.warn('[Vault] gaAutoSave before cloud push failed:', e);
  }
}

/** True when no substantive keys are set (ignore display-only keys so we still hydrate after a name-only visit). */
function isEmptyForHydrate(win, keysList) {
  const skip = new Set(['ga_user_name', 'ga_cloud_url']);
  if (!win?.localStorage) return true;
  for (const k of keysList) {
    if (skip.has(k)) continue;
    try {
      const v = win.localStorage.getItem(k);
      if (v != null && v !== '') return false;
    } catch {
      return true;
    }
  }
  return true;
}

/**
 * V3/V2 always write ga_rp_projects on boot, so `isEmptyForHydrate` stays false and server pull never ran.
 * When we know the canonical blob key, hydrate iff that blob is missing or corrupt.
 */
function needsHydrateFromServer(win, keysList, workspaceBlobKey) {
  if (!win?.localStorage) return true;
  if (workspaceBlobKey) {
    try {
      const blob = win.localStorage.getItem(workspaceBlobKey);
      if (isValidWorkspaceBlob(blob)) return false;
    } catch {
      /* fall through */
    }
    return true;
  }
  return isEmptyForHydrate(win, keysList);
}

/** Parent-window marker so we know when Mongo has a newer save than this browser last applied (iframe blob can be valid but stale — e.g. only 2 projects). */
function vaultSyncKey(appId) {
  return `ga_vault_sync_${appId}`;
}

function readVaultSyncMarker(appId) {
  try {
    const raw = window.localStorage.getItem(vaultSyncKey(appId));
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return o;
  } catch {
    return null;
  }
}

function writeVaultSyncMarker(appId, version, updatedAt) {
  try {
    window.localStorage.setItem(
      vaultSyncKey(appId),
      JSON.stringify({ version: Number(version) || 0, updatedAt: updatedAt || null })
    );
  } catch {
    /* ignore */
  }
}

function applyWorkspaceToLoadedIframe(win, workspaceBlobKey) {
  if (!win) return false;
  try {
    if (workspaceBlobKey === 'ga_planner_state_v1') {
      let raw = null;
      try {
        raw = win.localStorage.getItem('ga_planner_state_v1');
      } catch {
        raw = null;
      }
      if (isValidWorkspaceBlob(raw)) {
        if (typeof win.gaApply === 'function') {
          win.gaApply(JSON.parse(raw));
          return true;
        }
        if (typeof win.gaLoadLocal === 'function') {
          const ts = win.gaLoadLocal();
          if (ts) return true;
        }
      }
    }
    if (workspaceBlobKey === 'ga_rp_state_v1' && typeof win.loadState === 'function') {
      win.loadState();
      if (typeof win.renderAll === 'function') win.renderAll();
      return true;
    }
    if (typeof win.gaLoadLocal === 'function') {
      const ts = win.gaLoadLocal();
      if (ts) return true;
    }
    if (typeof win.loadState === 'function') {
      win.loadState();
      if (typeof win.renderAll === 'function') win.renderAll();
      return true;
    }
    if (typeof win.renderAll === 'function') {
      win.renderAll();
      return true;
    }
  } catch (e) {
    console.warn('[Vault] Could not apply iframe workspace in place:', e);
  }
  return false;
}

/**
 * Same-origin iframe + Mongo workspace mirror.
 * @param {{ iframeRef: React.RefObject<HTMLIFrameElement | null>, autoSaveMs?: number }} opts
 */
export function usePlannerIframeSync({
  iframeRef,
  appId,
  keysList,
  workspaceBlobKey = null,
  defaultAutoSave = true,
  autoSaveMs = 60_000
}) {
  const [status, setStatus] = useState(/** @type {{ level: 'ok' | 'err' | 'info', text: string } | null} */ (null));
  const [mongoAt, setMongoAt] = useState(/** @type {string | null} */ (null));
  const [autoSave, setAutoSave] = useState(defaultAutoSave);
  const [version, setVersion] = useState(0);
  const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const saving = useRef(false);
  const autoHydrateBusy = useRef(false);
  const userName = useMemo(() => {
    try {
      return window.localStorage.getItem('ga_user_name') || 'User';
    } catch {
      return 'User';
    }
  }, []);

  const refreshSnapshots = useCallback(async () => {
    try {
      const body = await appStateApi.listSnapshots(appId, 2);
      setSnapshots(Array.isArray(body?.snapshots) ? body.snapshots : []);
    } catch {
      setSnapshots([]);
    }
  }, [appId]);

  const pushToCloud = useCallback(async () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      setStatus({ level: 'info', text: 'Frame not ready' });
      return;
    }
    if (saving.current) return;
    saving.current = true;
    try {
      flushLegacyIframeSave(win);
      const data = readKeysFromWindow(win, keysList);
      if (workspaceBlobKey) {
        const blob = data[workspaceBlobKey];
        if (!isValidWorkspaceBlob(blob)) {
          setStatus({
            level: 'err',
            text: `Save blocked: ${workspaceBlobKey} is missing or empty (the iframe had not finished saving its full state). Wait until the planner finishes loading, touch any field or scenario, then Save again.`
          });
          return;
        }
      }
      const write = async (expectedVersion) =>
        appStateApi.putState(appId, { data, expectedVersion, updatedBy: userName });
      let body;
      try {
        body = await write(version);
      } catch (e) {
        if (e?.status !== 409) throw e;
        // Another tab/user saved first. Rebase to latest version and retry once.
        const remoteVersion = Number(e?.payload?.currentVersion ?? 0);
        setVersion(remoteVersion);
        body = await write(remoteVersion);
      }
      setMongoAt(body.updatedAt || null);
      setVersion(body.version || 0);
      writeVaultSyncMarker(appId, body.version, body.updatedAt);
      setHasRemoteUpdate(false);
      void refreshSnapshots();
      setStatus({ level: 'ok', text: `Saved ${Object.keys(data).length} keys to ${appId}` });
    } catch (e) {
      if (e?.status === 409) {
        setHasRemoteUpdate(true);
      }
      setStatus({ level: 'err', text: e?.message || String(e) });
    } finally {
      saving.current = false;
    }
  }, [appId, iframeRef, keysList, refreshSnapshots, userName, version, workspaceBlobKey]);

  const restoreFromCloud = useCallback(async () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      setStatus({ level: 'info', text: 'Frame not ready' });
      return;
    }
    try {
      const body = await appStateApi.getState(appId);
      const workspace = body?.data;
      const updatedAt = body?.updatedAt ?? null;
      const remoteVersion = body?.version ?? 0;
      const n = Object.keys(workspace || {}).length;
      if (!n) {
        setStatus({ level: 'info', text: 'No data in MongoDB yet' });
        return;
      }
      writeKeysToWindow(win, workspace);
      if (workspaceBlobKey && !isValidWorkspaceBlob(win.localStorage.getItem(workspaceBlobKey))) {
        setStatus({
          level: 'err',
          text: `Cloud data has no usable ${workspaceBlobKey} (last upload may have been incomplete). Ask whoever saved last to open V3, confirm all projects show, then click Save to cloud again.`
        });
        return;
      }
      setMongoAt(updatedAt || null);
      setVersion(remoteVersion || 0);
      writeVaultSyncMarker(appId, remoteVersion, updatedAt);
      setHasRemoteUpdate(false);
      void refreshSnapshots();
      const appliedInPlace = applyWorkspaceToLoadedIframe(win, workspaceBlobKey);
      setStatus({ level: 'ok', text: appliedInPlace ? `Restored ${n} keys` : `Restored ${n} keys — reloading…` });
      if (!appliedInPlace) win.location.reload();
    } catch (e) {
      setStatus({ level: 'err', text: e?.message || String(e) });
    }
  }, [appId, iframeRef, refreshSnapshots, workspaceBlobKey]);

  const restoreSnapshotById = useCallback(
    async (snapshotId) => {
      if (!snapshotId) return;
      try {
        await appStateApi.restoreSnapshot(appId, snapshotId, { updatedBy: userName, note: 'UI restore from snapshot' });
        await restoreFromCloud();
        await refreshSnapshots();
      } catch (e) {
        setStatus({ level: 'err', text: e?.message || String(e) });
      }
    },
    [appId, refreshSnapshots, restoreFromCloud, userName]
  );

  const checkRemoteMeta = useCallback(async () => {
    try {
      const meta = await appStateApi.getMeta(appId);
      const remoteVersion = Number(meta.version || 0);
      const marker = readVaultSyncMarker(appId);
      const markerVer = marker?.version != null ? Number(marker.version) : -1;
      if (remoteVersion > markerVer) {
        setHasRemoteUpdate(true);
      }
    } catch {
      /* ignore while offline */
    }
  }, [appId]);

  useEffect(() => {
    if (!autoSave) return undefined;
    const t = setInterval(() => {
      void pushToCloud();
    }, autoSaveMs);
    return () => clearInterval(t);
  }, [autoSave, autoSaveMs, pushToCloud]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && autoSave) void pushToCloud();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [autoSave, pushToCloud]);

  useEffect(() => {
    /** Defer so the iframe can start loading the legacy HTML + CDN scripts first. */
    const id = window.setTimeout(() => {
      void checkRemoteMeta();
    }, 400);
    const t = setInterval(() => {
      void checkRemoteMeta();
    }, 20_000);
    return () => {
      clearTimeout(id);
      clearInterval(t);
    };
  }, [checkRemoteMeta]);

  useEffect(() => {
    void refreshSnapshots();
  }, [refreshSnapshots]);

  /** On first load, if the iframe has no saved keys yet, pull the last cloud snapshot (same as manual Restore). */
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return undefined;

    const tryAutoHydrate = async () => {
      if (autoHydrateBusy.current) return;
      autoHydrateBusy.current = true;
      const win = iframeRef.current?.contentWindow;
      if (!win) {
        autoHydrateBusy.current = false;
        return;
      }

      let hasServerDoc = false;
      let metaVer = 0;
      let metaAt = null;
      try {
        const meta = await appStateApi.getMeta(appId);
        hasServerDoc = true;
        metaVer = Number(meta.version || 0);
        metaAt = meta.updatedAt || null;
      } catch {
        hasServerDoc = false;
      }

      const marker = readVaultSyncMarker(appId);
      const markerVer = marker?.version != null ? Number(marker.version) : -1;
      const serverAhead = hasServerDoc && metaVer > markerVer;
      const needsBlob = needsHydrateFromServer(win, keysList, workspaceBlobKey);

      if (!needsBlob && !serverAhead) {
        autoHydrateBusy.current = false;
        return;
      }

      // Local edits (autosave-to-localStorage) can be newer than Mongo while cloud auto-save is off.
      // Do not silently overwrite fresher browser data — surface "Load latest" instead.
      if (!needsBlob && serverAhead) {
        const localTs = readLocalWorkspaceTs(win, workspaceBlobKey);
        const remoteTs = metaAt ? Date.parse(metaAt) : 0;
        if (localTs > 0 && (!remoteTs || localTs > remoteTs)) {
          setVersion(metaVer || 0);
          setMongoAt(metaAt || null);
          setHasRemoteUpdate(true);
          setStatus({
            level: 'info',
            text: `Cloud has v${metaVer}, but this browser has newer local edits — Save to cloud, or Load latest to discard them.`
          });
          autoHydrateBusy.current = false;
          return;
        }
      }

      try {
        const body = await appStateApi.getState(appId);
        const workspace = body?.data;
        const updatedAt = body?.updatedAt ?? null;
        const remoteVersion = body?.version ?? 0;
        const n = Object.keys(workspace || {}).length;
        if (!n) {
          setStatus({
            level: 'info',
            text: `Server has no saved keys for ${appId} yet — use Save to cloud once from a machine that has the full planner.`
          });
          return;
        }
        writeKeysToWindow(win, workspace);
        if (workspaceBlobKey && !isValidWorkspaceBlob(win.localStorage.getItem(workspaceBlobKey))) {
          setStatus({
            level: 'err',
            text: `Server copy has no usable ${workspaceBlobKey}. Re-save from Vault (Save to cloud) after the planner fully loads.`
          });
          return;
        }
        writeVaultSyncMarker(appId, remoteVersion, updatedAt);
        setMongoAt(updatedAt || null);
        setVersion(remoteVersion || 0);
        setHasRemoteUpdate(false);
        const appliedInPlace = applyWorkspaceToLoadedIframe(win, workspaceBlobKey);
        setStatus({
          level: 'ok',
          text: appliedInPlace
            ? (serverAhead ? `Applied team workspace v${remoteVersion}` : 'Loaded last saved workspace')
            : (serverAhead ? `Applying team workspace v${remoteVersion} — reloading…` : 'Loaded last saved workspace — reloading…')
        });
        if (!appliedInPlace) win.location.reload();
      } catch (e) {
        const msg = e?.message || String(e);
        setStatus({
          level: 'err',
          text: `Could not load workspace from server: ${msg}`
        });
      } finally {
        autoHydrateBusy.current = false;
      }
    };

    const onLoad = () => {
      void tryAutoHydrate();
    };
    iframe.addEventListener('load', onLoad);
    try {
      if (iframe.contentDocument?.readyState === 'complete') {
        queueMicrotask(() => {
          void tryAutoHydrate();
        });
      }
    } catch {
      /* ignore */
    }
    /** Retry once — iframe storage + meta can settle a moment after `load`. */
    const retryT = window.setTimeout(() => void tryAutoHydrate(), 900);
    return () => {
      iframe.removeEventListener('load', onLoad);
      window.clearTimeout(retryT);
    };
  }, [appId, iframeRef, keysList, workspaceBlobKey]);

  return {
    status,
    mongoAt,
    autoSave,
    setAutoSave,
    pushToCloud,
    restoreFromCloud,
    hasRemoteUpdate,
    version,
    snapshots,
    restoreSnapshotById
  };
}
