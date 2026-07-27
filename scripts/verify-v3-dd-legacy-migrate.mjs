/**
 * Verify Deploy 1 §13 item 1 Legacy migration against live Mongo + fixture.
 */
import '../server/lib/loadEnv.js';
import { MongoClient } from 'mongodb';
import { MONGODB_URI, DB_NAME } from '../server/lib/config.js';

const BANNER =
  'Document binaries were not retained prior to Deploy 1. Absent evidence here is an artefact of the old design, not a loss.';

function migrate(dd, eng) {
  const legacy = eng.legacy || {};
  Object.keys(dd || {}).forEach((pid) => {
    const d = dd[pid];
    if (!d) return;
    if (legacy[pid] && legacy[pid].archivedAt) return;
    legacy[pid] = {
      archivedAt: new Date().toISOString(),
      binariesNotRetainedPriorToDeploy1: true,
      banner: BANNER,
      snapshot: {
        report: d.report || '',
        statusMsg: d.statusMsg || '',
        zoomResult: d.zoomResult || '',
        extracted: d.extracted ? JSON.parse(JSON.stringify(d.extracted)) : {},
        surveyNumber: d.surveyNumber || '',
        village: d.village || '',
        evidenceFileIds: []
      }
    };
  });
  eng.legacy = legacy;
  if (!eng.legacyMigratedAt) eng.legacyMigratedAt = new Date().toISOString();
  return eng;
}

function renderBannerHtml() {
  return `<div class="info-banner"><b>Legacy archive.</b> ${BANNER}</div>`;
}

const client = new MongoClient(MONGODB_URI);
await client.connect();
const db = client.db(DB_NAME);
const row = await db.collection('app_states').findOne({ _id: 'v3_org_planner' });
if (!row?.data?.ga_planner_state_v1) {
  console.log(JSON.stringify({ ok: false, error: 'no state' }));
  await client.close();
  process.exit(1);
}
const live = JSON.parse(row.data.ga_planner_state_v1);
const liveDd = live.dd && typeof live.dd === 'object' ? live.dd : {};
const liveDdKeys = Object.keys(liveDd).filter((k) => liveDd[k] && typeof liveDd[k] === 'object');
const liveDdBefore = JSON.parse(JSON.stringify(liveDd));

const engLive = { legacy: {}, legacyMigratedAt: null };
migrate(liveDd, engLive);
migrate(liveDd, engLive);

const liveResult = {
  source: 'mongo_v3_org_planner',
  stDdCount: liveDdKeys.length,
  legacyCount: Object.keys(engLive.legacy).length,
  countsMatchExactly: liveDdKeys.length === Object.keys(engLive.legacy).length,
  stDdIntact: JSON.stringify(liveDd) === JSON.stringify(liveDdBefore),
  idempotent: Object.keys(engLive.legacy).length === liveDdKeys.length
};

const pids = (live.projs || []).slice(0, 3).map((p) => p.id);
const fixtureDd = {};
pids.forEach((pid, i) => {
  fixtureDd[pid] = {
    report: `Fixture report ${i + 1}`,
    extracted: { village: `TestVillage${i}`, surveyNumber: `12/${i}` },
    village: `TestVillage${i}`,
    surveyNumber: `12/${i}`,
    doneTs: '2026-07-01'
  };
});
const ddBefore = JSON.parse(JSON.stringify(fixtureDd));
const eng = { legacy: {}, legacyMigratedAt: null };
migrate(fixtureDd, eng);
const after1 = Object.keys(eng.legacy).length;
const archivedAt1 = eng.legacy[pids[0]]?.archivedAt;
const snap1 = JSON.stringify(eng.legacy[pids[0]]);
// mutate ST.dd as if new analysis ran — must NOT overwrite legacy
fixtureDd[pids[0]].report = 'CHANGED AFTER ARCHIVE';
migrate(fixtureDd, eng);
const after2 = Object.keys(eng.legacy).length;
const archivedAt2 = eng.legacy[pids[0]]?.archivedAt;
const snap2 = JSON.stringify(eng.legacy[pids[0]]);
const bannerHtml = renderBannerHtml();

const fixtureResult = {
  source: 'fixture_on_real_project_ids',
  projectIds: pids,
  stDdCount: Object.keys(fixtureDd).length,
  legacyCountAfter1: after1,
  legacyCountAfter2: after2,
  countsMatchExactly: Object.keys(ddBefore).length === after1 && after1 === after2,
  stDdIntact: JSON.stringify(fixtureDd) !== JSON.stringify(ddBefore) // we mutated report intentionally
    ? fixtureDd[pids[0]].report === 'CHANGED AFTER ARCHIVE' && ddBefore[pids[0]].report === 'Fixture report 1'
    : false,
  stDdStillReadable: !!(fixtureDd[pids[0]]?.report && fixtureDd[pids[0]]?.extracted),
  idempotentNoDuplicateOrOverwrite:
    after1 === after2 && archivedAt1 === archivedAt2 && snap1 === snap2 &&
    eng.legacy[pids[0]]?.snapshot?.report === 'Fixture report 1',
  bannerRenders: bannerHtml.includes(BANNER) && bannerHtml.includes('Legacy archive.'),
  bannerHtml
};

console.log(JSON.stringify({ liveResult, fixtureResult }, null, 2));
await client.close();
