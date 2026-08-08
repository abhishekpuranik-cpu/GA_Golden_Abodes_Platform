/**
 * Golden Abodes Platform — API gateway, MongoDB persistence, legacy static (API_Tool).
 */
import './lib/loadEnv.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PORT, API_TOOL_PATH, LEGACY_EXISTS, VERSION, V2V3_ACCESS_CODE } from './lib/config.js';
import { closeMongo } from './lib/mongo.js';
import { healthRouter } from './routes/health.js';
import { workspaceRouter } from './routes/workspace.js';
import { preconstructionRouter } from './routes/preconstruction.js';
import { vaultAnalyticsRouter } from './routes/vaultAnalytics.js';
import { appStatesRouter } from './routes/appStates.js';
import { authRouter } from './routes/auth.js';
import { dmGovernanceRouter } from './routes/dmGovernance.js';
import postSalesRouter from './routes/postsales/index.js';
import hiringRouter from './routes/hiring/index.js';
import adminServicesRouter from './routes/adminServices/index.js';
import { vaultAttentionRouter } from './routes/vaultAttention.js';
import { v3DdRouter } from './routes/v3Dd.js';
import { startSlaMonitor } from './jobs/slaMonitor.js';
import { startHiringMetaviewRetry } from './jobs/hiringMetaviewRetry.js';
import { seedPostSalesIfEmpty } from './lib/postsales/seedIfEmpty.js';
import { seedHiringIfEmpty } from './lib/hiring/seedIfEmpty.js';
import { ensureHiringIndexes } from './lib/hiring/ensureIndexes.js';
import { seedAdminServicesIfNeeded, ensureAdminServicesIndexes } from './lib/adminServices/migrate.js';
import { isDevAuthBypass } from './lib/devAuthBypass.js';
import { maybePurgePostSalesOnStart } from './lib/postsales/purgeUnitData.js';
import { createRbacMiddleware } from './lib/rbac.js';
import { ensureMongo } from './lib/mongo.js';
import { warmPreconStateCache } from './lib/preconStateCache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));

const ACCESS_COOKIE = 'ga_v2v3_access';

function parseCookies(req) {
  const raw = String(req.headers.cookie || '');
  const out = {};
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = decodeURIComponent(part.slice(i + 1).trim());
    if (k) out[k] = v;
  });
  return out;
}

function isAccessAuthed(req) {
  if (!V2V3_ACCESS_CODE) return true;
  const c = parseCookies(req);
  return c[ACCESS_COOKIE] === '1';
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function setAccessCookie(res, on) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${on ? 43200 : 0}`];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  const v = on ? '1' : '';
  res.setHeader('Set-Cookie', `${ACCESS_COOKIE}=${encodeURIComponent(v)}; ${attrs.join('; ')}`);
}

app.get('/api/access/status', (req, res) => {
  res.json({ enabled: !!V2V3_ACCESS_CODE, authenticated: isAccessAuthed(req) });
});

app.post('/api/access/login', (req, res) => {
  if (!V2V3_ACCESS_CODE) return res.json({ ok: true, enabled: false, authenticated: true });
  const code = String(req.body?.code || '');
  if (!safeEqual(code, V2V3_ACCESS_CODE)) {
    return res.status(401).json({ error: 'Invalid access code', enabled: true, authenticated: false });
  }
  setAccessCookie(res, true);
  return res.json({ ok: true, enabled: true, authenticated: true });
});

app.post('/api/access/logout', (_req, res) => {
  setAccessCookie(res, false);
  res.json({ ok: true, authenticated: false });
});

app.use(createRbacMiddleware());

const preconPublicDir = path.join(rootDir, 'client', 'public', 'preconstruction');
const preconBundled = fs.existsSync(path.join(preconPublicDir, 'index.html'));
const PRECON_BOOT_VERSION = 'boot-16-20260727-unsaved-guard';

function sendPreconIndex(res) {
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  let html = fs.readFileSync(path.join(preconPublicDir, 'index.html'), 'utf8');
  // Mark boot version only — do NOT location.replace (that forced a double load and long "Loading workspace…").
  const boot = `<script>(function(){try{sessionStorage.setItem('ga_precon_boot',${JSON.stringify(PRECON_BOOT_VERSION)});}catch(e){}})();</script>`;
  if (html.includes('</head>')) html = html.replace('</head>', `${boot}</head>`);
  else html = boot + html;
  res.type('html').send(html);
}

if (preconBundled) {
  app.use('/preconstruction', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    next();
  });
  app.get(['/preconstruction', '/preconstruction/', '/preconstruction/index.html'], (_req, res) => {
    sendPreconIndex(res);
  });
  app.use('/preconstruction', express.static(preconPublicDir, { index: false, fallthrough: true }));
  app.get(['/preconstruction', '/preconstruction/*'], (req, res, next) => {
    if (/\.[a-z0-9]+$/i.test(req.path)) return next();
    sendPreconIndex(res);
  });
  console.log(`PreConstruction app mounted at /preconstruction from ${preconPublicDir}`);
}

if (LEGACY_EXISTS) {
  // Single-file HTML tools must not stick in browser/CDN cache after deploy (users kept seeing old UI).
  app.use('/legacy', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    next();
  });
  app.use('/legacy', express.static(API_TOOL_PATH));
  console.log(`Legacy apps mounted at /legacy from ${API_TOOL_PATH}`);
} else {
  console.warn(`API_TOOL_PATH not found (${API_TOOL_PATH}). Set API_TOOL_PATH in .env`);
  app.use('/legacy', (_req, res) => {
    res.status(404).type('text/plain').send('Legacy folder missing. Set API_TOOL_PATH to your API_Tool directory.');
  });
}

app.use('/api', healthRouter);
app.use('/api', workspaceRouter);
app.use('/api', preconstructionRouter);
app.use('/api', vaultAnalyticsRouter);
app.use('/api', appStatesRouter);
app.use('/api', v3DdRouter);
app.use('/api/dm-governance', dmGovernanceRouter);
app.use('/api/postsales', postSalesRouter);
app.use('/api/hiring', hiringRouter);
app.use('/api/admin-services', adminServicesRouter);
app.use('/api/vault', vaultAttentionRouter);
app.use('/api/auth', authRouter);

const clientDist = path.join(rootDir, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/legacy') || req.path.startsWith('/preconstruction')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, _req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  return next(err);
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found', path: req.path });
  }
  res.status(404).send('Not found');
});

startSlaMonitor();
startHiringMetaviewRetry();

async function boot() {
  await maybePurgePostSalesOnStart();
  if (process.env.NODE_ENV !== 'production') await seedPostSalesIfEmpty();
  await seedHiringIfEmpty();
  await ensureHiringIndexes();
  try {
    await seedAdminServicesIfNeeded();
    await ensureAdminServicesIndexes();
  } catch (err) {
    // Do not crash the whole process (e.g. Atlas free-tier write quota) — serve reads and retry later.
    console.error('[admin-services] boot seed/indexes failed (continuing):', err?.message || err);
  }

  const server = app.listen(PORT, () => {
    console.log(`GA Golden Abodes Platform v${VERSION} — http://127.0.0.1:${PORT}`);
    if (isDevAuthBypass()) {
      console.warn('[DEV] Auth bypass ON — login not required (DEV_BYPASS_AUTH). Disabled in production.');
    }
  });

  // Warm PreConstruction catalog/work companions so first user open is memory-fast.
  ensureMongo()
    .then((db) => (db ? warmPreconStateCache(db) : null))
    .catch((e) => console.warn('[precon-cache]', e?.message || e));

  function shutdown(signal) {
    console.log(`${signal} — closing…`);
    server.close(() => {
      closeMongo().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 12_000).unref();
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

boot().catch((err) => {
  console.error('Boot failed:', err);
  process.exit(1);
});
