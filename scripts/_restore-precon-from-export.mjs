/**
 * Restore PreConstruction projects tombstoned after the 2026-07-18 export.
 * - Snapshots current live Mongo doc first
 * - Re-adds missing projects from the export
 * - Keeps live copies of projects that still exist (newer edits)
 * - Clears tombstones only for restored project ids
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import { mergeProjectDeep, mergeActivityLogs } from '../server/lib/preconProjectMerge.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPORT_PATH =
  process.argv[2] || path.join('C:\\Users\\HP\\Downloads\\GA_PreConstruction_2026-07-18.json');

function loadEnv() {
  const envText = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const env = {};
  for (const line of envText.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[k] = v;
  }
  return env;
}

const env = loadEnv();
const uri = env.MONGODB_URI;
const dbName = env.MONGODB_DB_NAME || 'golden_abodes';
if (!uri) throw new Error('MONGODB_URI missing');

const exportRaw = JSON.parse(fs.readFileSync(EXPORT_PATH, 'utf8'));
const exportData = exportRaw.data && exportRaw.projects == null ? exportRaw.data : exportRaw;
const exportProjects = Array.isArray(exportData.projects) ? exportData.projects : [];
const exportRemoved = new Set(
  (Array.isArray(exportData._removedProjectIds) ? exportData._removedProjectIds : []).map(String),
);

if (!exportProjects.length) throw new Error('Export has no projects');

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const states = db.collection('app_states');
const snaps = db.collection('app_state_snapshots');

const live = await states.findOne({ _id: 'preconstruction' });
if (!live) throw new Error('Live preconstruction doc missing');

const liveData = live.data && typeof live.data === 'object' ? live.data : {};
const liveProjects = Array.isArray(liveData.projects) ? liveData.projects : [];
const liveRemoved = new Set(
  (Array.isArray(liveData._removedProjectIds) ? liveData._removedProjectIds : []).map(String),
);

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(ROOT, `scripts/_precon-backup-before-restore-${stamp}.json`);
fs.writeFileSync(
  backupPath,
  JSON.stringify(
    {
      version: live.version,
      updatedAt: live.updatedAt,
      updatedBy: live.updatedBy,
      data: liveData,
    },
    null,
    2,
  ),
);

const snapId = new ObjectId();
await snaps.insertOne({
  _id: snapId,
  appId: 'preconstruction',
  createdAt: new Date(),
  createdBy: 'restore-script',
  note: `Auto backup before restoring projects from ${path.basename(EXPORT_PATH)}`,
  version: live.version,
  data: liveData,
});

const byId = new Map();
for (const p of liveProjects) {
  if (p?.id != null) byId.set(String(p.id), p);
}

const restoredIds = [];
for (const p of exportProjects) {
  if (p?.id == null) continue;
  const id = String(p.id);
  if (exportRemoved.has(id)) continue;
  if (byId.has(id)) {
    // Keep live project as base (newer edits), fold in export only where useful
    byId.set(id, mergeProjectDeep(p, byId.get(id)));
  } else {
    byId.set(id, p);
    restoredIds.push(id);
  }
  liveRemoved.delete(id);
}

// Keep intentional tombstones that were already gone in the July 18 export
for (const id of exportRemoved) liveRemoved.add(id);

const nextData = {
  ...liveData,
  ...exportData,
  projects: [...byId.values()],
  departments:
    Array.isArray(liveData.departments) && liveData.departments.length
      ? liveData.departments
      : exportData.departments || [],
  activityLog: mergeActivityLogs(liveData.activityLog, [
    {
      action: 'project.restore',
      at: new Date().toISOString(),
      actor: 'restore-script',
      summary: `Restored ${restoredIds.length} project(s) from ${path.basename(EXPORT_PATH)}`,
      meta: { restoredIds, exportFile: path.basename(EXPORT_PATH), backupSnapId: String(snapId) },
    },
  ]),
  _removedProjectIds: [...liveRemoved],
};

const nextVersion = Number(live.version || 0) + 1;
await states.updateOne(
  { _id: 'preconstruction' },
  {
    $set: {
      appId: 'preconstruction',
      data: nextData,
      version: nextVersion,
      updatedAt: new Date(),
      updatedBy: 'restore-script',
    },
  },
);

console.log(
  JSON.stringify(
    {
      ok: true,
      exportFile: EXPORT_PATH,
      backupFile: backupPath,
      snapshotId: String(snapId),
      beforeCount: liveProjects.length,
      afterCount: nextData.projects.length,
      restoredIds,
      restoredNames: restoredIds.map((id) => exportProjects.find((p) => String(p.id) === id)?.name),
      remainingTombstones: nextData._removedProjectIds,
      version: nextVersion,
      projectNames: nextData.projects.map((p) => ({ id: p.id, name: p.name })),
    },
    null,
    2,
  ),
);

await client.close();
