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

/**
 * Same-origin iframe + Mongo workspace mirror.
 * @param {{ iframeRef: React.RefObject<HTMLIFrameElement | null>, autoSaveMs?: number }} opts
 */
export function usePlannerIframeSync({ iframeRef, appId, keysList, autoSaveMs = 60_000 }) {
  const [status, setStatus] = useState(/** @type {{ level: 'ok' | 'err' | 'info', text: string } | null} */ (null));
  const [mongoAt, setMongoAt] = useState(/** @type {string | null} */ (null));
  const [autoSave, setAutoSave] = useState(true);
  const [version, setVersion] = useState(0);
  const [hasRemoteUpdate, setHasRemoteUpdate] = useState(false);
  const saving = useRef(false);
  const userName = useMemo(() => {
    try {
      return window.localStorage.getItem('ga_user_name') || 'User';
    } catch {
      return 'User';
    }
  }, []);

  const pushToCloud = useCallback(async () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      setStatus({ level: 'info', text: 'Frame not ready' });
      return;
    }
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
        // Another tab/user saved first. Rebase to latest version and retry once.
        const remoteVersion = Number(e?.payload?.currentVersion ?? 0);
        setVersion(remoteVersion);
        body = await write(remoteVersion);
      }
      setMongoAt(body.updatedAt || null);
      setVersion(body.version || 0);
      setHasRemoteUpdate(false);
      setStatus({ level: 'ok', text: `Saved ${Object.keys(data).length} keys to ${appId}` });
    } catch (e) {
      if (e?.status === 409) {
        setHasRemoteUpdate(true);
      }
      setStatus({ level: 'err', text: e?.message || String(e) });
    } finally {
      saving.current = false;
    }
  }, [appId, iframeRef, keysList, userName, version]);

  const restoreFromCloud = useCallback(async () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) {
      setStatus({ level: 'info', text: 'Frame not ready' });
      return;
    }
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
      setStatus({ level: 'ok', text: `Restored ${n} keys — reloading…` });
      win.location.reload();
    } catch (e) {
      setStatus({ level: 'err', text: e?.message || String(e) });
    }
  }, [appId, iframeRef]);

  const checkRemoteMeta = useCallback(async () => {
    try {
      const meta = await appStateApi.getMeta(appId);
      const remoteVersion = Number(meta.version || 0);
      if (remoteVersion > version) {
        setHasRemoteUpdate(true);
      }
    } catch {
      /* ignore while offline */
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

  return { status, mongoAt, autoSave, setAutoSave, pushToCloud, restoreFromCloud, hasRemoteUpdate, version };
}
