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

function writeKeysToWindow(win, map) {
  if (!win?.localStorage || !map) return;
  for (const [k, v] of Object.entries(map)) {
    if (v == null) continue;
    try {
      win.localStorage.setItem(k, typeof v === 'string' ? v : String(v));
    } catch {
      /* ignore */
    }
  }
}

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
 * Embeds a planner app in the same document (not iframe) — same localStorage as the vault, Mongo mirror via `keysList`.
 * On restore, call `onAfterRestore` to remount the child app instead of `location.reload` (avoids nuking the shell).
 */
export function usePlannerWindowSync({ appId, keysList, autoSaveMs = 60_000, onAfterRestore }) {
  const [workspaceReady, setWorkspaceReady] = useState(() =>
    typeof window !== 'undefined' ? !isEmptyForHydrate(window, keysList) : false
  );
  const [status, setStatus] = useState(/** @type {{ level: 'ok' | 'err' | 'info', text: string } | null} */ (null));
  const [mongoAt, setMongoAt] = useState(/** @type {string | null} */ (null));
  const [autoSave, setAutoSave] = useState(true);
  const [version, setVersion] = useState(0);
  const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
  const [snapshots, setSnapshots] = useState([]);
  const saving = useRef(false);
  const onAfterRestoreRef = useRef(onAfterRestore);
  onAfterRestoreRef.current = onAfterRestore;
  const userName = useMemo(() => {
    try {
      return window.localStorage.getItem('ga_user_name') || 'User';
    } catch {
      return 'User';
    }
  }, []);

  const getWin = useCallback(() => window, []);

  const refreshSnapshots = useCallback(async () => {
    try {
      const body = await appStateApi.listSnapshots(appId, 2);
      setSnapshots(Array.isArray(body?.snapshots) ? body.snapshots : []);
    } catch {
      setSnapshots([]);
    }
  }, [appId]);

  const pushToCloud = useCallback(async () => {
    const win = getWin();
    if (saving.current) return;
    saving.current = true;
    try {
      const data = readKeysFromWindow(win, keysList);
      const write = async (expectedVersion) =>
        appStateApi.putState(appId, { data, expectedVersion, updatedBy: userName });
      let body;
      try {
        body = await write(version);
      } catch (e) {
        if (e?.status !== 409) throw e;
        const remoteVersion = Number(e?.payload?.currentVersion ?? 0);
        setVersion(remoteVersion);
        body = await write(remoteVersion);
      }
      setMongoAt(body.updatedAt || null);
      setVersion(body.version || 0);
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
  }, [appId, getWin, keysList, refreshSnapshots, userName, version]);

  const restoreFromCloud = useCallback(async () => {
    const win = getWin();
    try {
      const { data, updatedAt, version: remoteVersion } = await appStateApi.getState(appId);
      const n = Object.keys(data || {}).length;
      if (!n) {
        setStatus({ level: 'info', text: 'No data in MongoDB yet' });
        return;
      }
      writeKeysToWindow(win, data);
      setMongoAt(updatedAt || null);
      setVersion(remoteVersion || 0);
      setHasRemoteUpdate(false);
      void refreshSnapshots();
      setStatus({ level: 'ok', text: `Restored ${n} keys — rebuilding…` });
      onAfterRestoreRef.current?.();
    } catch (e) {
      setStatus({ level: 'err', text: e?.message || String(e) });
    }
  }, [appId, getWin, refreshSnapshots]);

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

  /** First paint: if nothing substantive is in localStorage, load the last Mongo snapshot (no V3/V2 tab required). */
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!isEmptyForHydrate(window, keysList)) {
        if (!cancelled) setWorkspaceReady(true);
        return;
      }
      try {
        const { data, updatedAt, version: remoteVersion } = await appStateApi.getState(appId);
        if (cancelled) return;
        const n = Object.keys(data || {}).length;
        if (n) {
          writeKeysToWindow(window, data);
          setMongoAt(updatedAt || null);
          setVersion(remoteVersion || 0);
          setHasRemoteUpdate(false);
          onAfterRestoreRef.current?.();
        }
      } catch {
        /* no snapshot / offline */
      } finally {
        if (!cancelled) setWorkspaceReady(true);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [appId, keysList]);

  const checkRemoteMeta = useCallback(async () => {
    try {
      const meta = await appStateApi.getMeta(appId);
      const remoteVersion = Number(meta.version || 0);
      if (remoteVersion > version) {
        setHasRemoteUpdate(true);
      }
    } catch {
      /* ignore */
    }
  }, [appId, version]);

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
    void checkRemoteMeta();
    const t = setInterval(() => {
      void checkRemoteMeta();
    }, 20_000);
    return () => clearInterval(t);
  }, [checkRemoteMeta]);

  useEffect(() => {
    void refreshSnapshots();
  }, [refreshSnapshots]);

  return {
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
  };
}
