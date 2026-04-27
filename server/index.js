/**
 * Golden Abodes Platform — API gateway, MongoDB persistence, legacy static (API_Tool).
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PORT, API_TOOL_PATH, LEGACY_EXISTS, VERSION } from './lib/config.js';
import { closeMongo } from './lib/mongo.js';
import { healthRouter } from './routes/health.js';
import { workspaceRouter } from './routes/workspace.js';
import { preconstructionRouter } from './routes/preconstruction.js';
import { appStatesRouter } from './routes/appStates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: true }));
app.use(express.json({ limit: '50mb' }));

if (LEGACY_EXISTS) {
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
app.use('/api', appStatesRouter);

const clientDist = path.join(rootDir, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/legacy')) return next();
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

const server = app.listen(PORT, () => {
  console.log(`GA Golden Abodes Platform v${VERSION} — http://127.0.0.1:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} — closing…`);
  server.close(() => {
    closeMongo().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 12_000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
