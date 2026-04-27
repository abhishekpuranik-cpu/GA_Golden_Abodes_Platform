/**
 * Build GA_Cashflow_V1_React with base /v1/ and copy into client/public/v1
 * so the App Vault can iframe /v1/index.html (same origin as the shell).
 *
 * Prerequisite: sibling folder ../GA_Cashflow_V1_React
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const platformRoot = path.join(__dirname, '..');
const v1Project = path.join(platformRoot, '..', 'GA_Cashflow_V1_React');
const v1Dist = path.join(v1Project, 'dist');
const out = path.join(platformRoot, 'client', 'public', 'v1');

if (!fs.existsSync(path.join(v1Project, 'package.json'))) {
  console.error('sync-v1-cashflow: expected GA_Cashflow_V1_React at', v1Project);
  process.exit(1);
}

console.log('Building V1 (base /v1/)…');
execSync('npm run build:vault', { cwd: v1Project, stdio: 'inherit', shell: true });

if (!fs.existsSync(path.join(v1Dist, 'index.html'))) {
  console.error('sync-v1-cashflow: no dist/index.html after build');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.cpSync(v1Dist, out, { recursive: true });
console.log('Copied V1 dist →', out);
