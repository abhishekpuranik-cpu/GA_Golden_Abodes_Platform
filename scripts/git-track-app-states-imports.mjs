/**
 * Ensures every *relative* module imported by server/routes/appStates.js exists on disk
 * and is staged in Git. Run automatically via .githooks/pre-commit (--fix).
 *
 * Usage: node scripts/git-track-app-states-imports.mjs [--fix]
 *   --fix   git add any imported server files that exist but are not tracked yet
 */
import fs from 'fs';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const appStatesPath = path.join(repoRoot, 'server', 'routes', 'appStates.js');
const fix = process.argv.includes('--fix');

function gitTracked(relPosix) {
  try {
    execSync(`git ls-files --error-unmatch -- "${relPosix}"`, {
      cwd: repoRoot,
      stdio: 'pipe'
    });
    return true;
  } catch {
    return false;
  }
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function collectRelativeImports(source, baseDir) {
  const set = new Set();
  const re = /from\s+['"]((?:\.\.\/|\.\/)[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const spec = m[1];
    if (!spec || spec.includes('*')) continue;
    const resolved = path.normalize(path.resolve(baseDir, spec));
    if (!resolved.startsWith(repoRoot)) continue;
    const ext = path.extname(resolved);
    const candidates =
      ext === '.js' ? [resolved] : [resolved, `${resolved}.js`, path.join(resolved, 'index.js')];
    let hit = null;
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        hit = c;
        break;
      }
    }
    if (!hit) {
      console.error(`git-track-app-states-imports: missing file for import "${spec}" (expected near ${toPosix(path.relative(repoRoot, resolved))})`);
      process.exit(1);
    }
    const rel = path.relative(repoRoot, hit);
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      set.add(toPosix(rel));
    }
  }
  return [...set];
}

function main() {
  if (!fs.existsSync(appStatesPath)) {
    console.error('git-track-app-states-imports: appStates.js not found');
    process.exit(1);
  }
  const src = fs.readFileSync(appStatesPath, 'utf8');
  const routesDir = path.dirname(appStatesPath);
  const imports = collectRelativeImports(src, routesDir);
  const underServer = imports.filter((p) => p.startsWith('server/'));

  const toAdd = [];
  for (const relPosix of underServer) {
    const abs = path.join(repoRoot, ...relPosix.split('/'));
    if (!fs.existsSync(abs)) continue;
    if (!gitTracked(relPosix)) {
      toAdd.push(relPosix);
    }
  }

  if (!toAdd.length) {
    process.exit(0);
  }

  console.log('git-track-app-states-imports: staging imported server files not yet in Git:');
  for (const f of toAdd) console.log(`  + ${f}`);

  if (!fix) {
    console.error('git-track-app-states-imports: run with --fix or git add these files manually.');
    process.exit(1);
  }

  const r = spawnSync('git', ['add', '--', ...toAdd], { cwd: repoRoot, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
}

main();
