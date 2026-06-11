import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.join(__dirname, '..', '..');

export const VERSION = '0.3.0';

export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
export const DB_NAME = process.env.MONGODB_DB_NAME || 'golden_abodes';
export const PORT = Number(process.env.PORT) || 3020;

const bundledLegacy = path.normalize(path.join(rootDir, 'client', 'public', 'legacy'));
const siblingLegacy = path.normalize(path.join(rootDir, '..', '..', 'API_Tool'));
const defaultTool = fs.existsSync(bundledLegacy) ? bundledLegacy : siblingLegacy;
export const API_TOOL_PATH = process.env.API_TOOL_PATH
  ? path.normalize(process.env.API_TOOL_PATH)
  : defaultTool;

export const LEGACY_EXISTS = fs.existsSync(API_TOOL_PATH);

/** Vault → Construction / PreConstruction apps (runtime env on Render; avoids rebuilding the client when URLs change). Falls back to VITE_* names for compatibility. */
function trimEnv(k) {
  const v = process.env[k];
  return typeof v === 'string' ? v.trim() : '';
}
export const EXECUTION_DASHBOARD_URL =
  trimEnv('EXECUTION_DASHBOARD_URL') ||
  trimEnv('VITE_EXECUTION_DASHBOARD_URL');
export const PRECONSTRUCTION_APP_URL =
  trimEnv('PRECONSTRUCTION_APP_URL') ||
  trimEnv('PRECONSTRUCTION_URL') ||
  trimEnv('VITE_PRECONSTRUCTION_URL');

/** Simple shared passcode gate for V2/V3 planner pages. */
export const V2V3_ACCESS_CODE =
  trimEnv('V2V3_ACCESS_CODE') ||
  trimEnv('PLANNER_ACCESS_CODE');

/** One-shot Cashflow V1 sold-unit restore on boot (see v1CashflowAutoRestore.js). */
export const V1_AUTO_RESTORE_BEFORE =
  trimEnv('V1_AUTO_RESTORE_BEFORE') ||
  (process.env.NODE_ENV === 'production' ? '2026-06-11T17:27:00+05:30' : '');
export const V1_AUTO_RESTORE_FORCE_RUN_DEFAULT =
  process.env.NODE_ENV === 'production' ? '2026-06-11-morning' : '';
export const V1_AUTO_RESTORE_IF_CURRENT_UNITS_BELOW = Math.max(
  0,
  Number(process.env.V1_AUTO_RESTORE_IF_CURRENT_UNITS_BELOW) || 5
);
/** When set (e.g. run id), always restore richest pre-cutoff snapshot once — even if units already exist. */
export const V1_AUTO_RESTORE_FORCE_RUN = trimEnv('V1_AUTO_RESTORE_FORCE_RUN');

/** Max string entries in one workspace PUT (planner localStorage keys). */
export const WORKSPACE_MAX_KEYS = 250;
/** Per-key value max length (chars) — keeps documents under MongoDB limits. */
export const WORKSPACE_MAX_VALUE_CHARS = 14_000_000;

