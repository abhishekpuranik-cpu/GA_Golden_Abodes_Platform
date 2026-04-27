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

/** Max string entries in one workspace PUT (planner localStorage keys). */
export const WORKSPACE_MAX_KEYS = 250;
/** Per-key value max length (chars) — keeps documents under MongoDB limits. */
export const WORKSPACE_MAX_VALUE_CHARS = 14_000_000;

