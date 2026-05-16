/**
 * Build GA_PreConstruction_React for same-origin hosting at /preconstruction/
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.join(__dirname, '..');
const preconRoot = [
  path.join(platformRoot, 'preconstruction-app'),
  path.join(platformRoot, '..', 'GA_PreConstruction_React')
].find((p) => fs.existsSync(path.join(p, 'package.json')));
const outDir = path.join(platformRoot, 'client', 'public', 'preconstruction');

if (!preconRoot) {
  const cached = path.join(platformRoot, 'client', 'public', 'preconstruction', 'index.html');
  if (fs.existsSync(cached)) {
    console.warn('build-preconstruction: source not found — using committed client/public/preconstruction');
    process.exit(0);
  }
  console.warn('build-preconstruction: GA_PreConstruction_React not found — skip');
  process.exit(0);
}

const apiBase = (process.env.VITE_API_BASE || '').replace(/\/$/, '');
const env = {
  ...process.env,
  VITE_BASE: '/preconstruction/',
  VITE_API_BASE: apiBase
};

console.log('build-preconstruction: building with base /preconstruction/', apiBase ? `api ${apiBase}` : 'api same-origin');

const hasModules = fs.existsSync(path.join(preconRoot, 'node_modules', 'vite'));
if (hasModules) {
  execSync('npm run build', { cwd: preconRoot, stdio: 'inherit', env });
} else {
  execSync('npm ci', { cwd: preconRoot, stdio: 'inherit', env });
  execSync('npm run build', { cwd: preconRoot, stdio: 'inherit', env });
}

const dist = path.join(preconRoot, 'dist');
if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('build-preconstruction: dist/index.html missing');
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(dist, outDir, { recursive: true });
console.log(`build-preconstruction: copied to ${outDir}`);
