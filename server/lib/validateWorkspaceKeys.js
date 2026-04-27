import { WORKSPACE_MAX_KEYS, WORKSPACE_MAX_VALUE_CHARS } from './config.js';

const KEY_RE = /^[a-zA-Z0-9_.@-]+$/;

/**
 * @param {unknown} keys
 * @returns {{ ok: true, keys: Record<string, string> } | { ok: false, error: string }}
 */
export function validateWorkspaceKeys(keys) {
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) {
    return { ok: false, error: 'body.keys must be a plain object' };
  }
  const entries = Object.entries(keys);
  if (entries.length > WORKSPACE_MAX_KEYS) {
    return { ok: false, error: `Too many keys (max ${WORKSPACE_MAX_KEYS})` };
  }
  /** @type {Record<string, string>} */
  const out = {};
  let total = 0;
  for (const [k, v] of entries) {
    if (typeof k !== 'string' || !KEY_RE.test(k)) {
      return { ok: false, error: `Invalid key: ${String(k).slice(0, 40)}` };
    }
    if (v === null || v === undefined) continue;
    if (typeof v !== 'string') {
      return { ok: false, error: `Value for "${k}" must be a string (JSON.stringify if needed)` };
    }
    if (v.length > WORKSPACE_MAX_VALUE_CHARS) {
      return { ok: false, error: `Value for "${k}" exceeds max length` };
    }
    total += v.length;
    out[k] = v;
  }
  if (total > 15_500_000) {
    return { ok: false, error: 'Combined payload too large for one MongoDB document' };
  }
  return { ok: true, keys: out };
}
