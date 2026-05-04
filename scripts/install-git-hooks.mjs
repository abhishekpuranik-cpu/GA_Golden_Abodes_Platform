/**
 * Points this repo at .githooks so pre-commit runs on every `git commit`.
 * Called from npm `prepare` after npm install / clone.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Render/npm ci runs prepare — no need to configure hooks on the build machine */
if (process.env.CI || process.env.RENDER || process.env.CONTINUOUS_INTEGRATION) {
  process.exit(0);
}

try {
  execSync('git rev-parse --git-dir', { cwd: repoRoot, stdio: 'pipe' });
} catch {
  process.exit(0);
}

try {
  execSync('git config core.hooksPath .githooks', { cwd: repoRoot, stdio: 'pipe' });
  // eslint-disable-next-line no-console
  console.log('[prepare] Git hooks path set to .githooks (tracks appStates imports on commit)');
} catch (e) {
  // eslint-disable-next-line no-console
  console.warn('[prepare] Could not set core.hooksPath:', e?.message || e);
}

const hookDir = path.join(repoRoot, '.githooks');
if (!fs.existsSync(path.join(hookDir, 'pre-commit'))) {
  // eslint-disable-next-line no-console
  console.warn('[prepare] Missing .githooks/pre-commit — commit hooks may not run.');
}
