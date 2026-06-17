/**
 * Construction milestone sync — Cashflow V1 CLP roadmap (+ optional Execution overrides).
 */
import { MongoClient } from 'mongodb';
import { MONGODB_URI } from '../../config.js';
import { DM_COLLECTIONS } from '../collections.js';

const EXEC_DB = process.env.EXECUTION_MONGODB_DB_NAME || 'ga_execution_dashboard';

function parseCfEnvelope(doc) {
  if (!doc?.data) return null;
  let raw = doc.data.ga_cf_v1;
  if (!raw) return null;
  try {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (payload?.data && typeof payload.data === 'object') return payload;
  } catch {
    return null;
  }
  return null;
}

function slugName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function cumDuePct(defs, key) {
  let cum = 0;
  for (const d of defs || []) {
    cum += Number(d.pct) || 0;
    if (d.key === key) break;
  }
  return cum;
}

function buildMilestoneSteps(projectCfg, roadmapOverrides = {}) {
  const defs = (projectCfg?.milestoneDefs || []).filter(
    (d) => d.constLink === true || d.constLink === 'Y' || d.constLink === 'y'
  );
  const plan = projectCfg?.milestonesDates || {};
  const achieved = projectCfg?.milestonesAchievedDates || {};
  const steps = [];

  for (const d of defs) {
    const override = roadmapOverrides[d.key] || {};
    const targetIso = override.expectedEnd || plan[d.key] || null;
    const achievedIso = override.metDate || achieved[d.key] || null;
    steps.push({
      key: d.key,
      label: d.label || d.key,
      pct: Number(d.pct) || 0,
      cumDuePct: cumDuePct(defs, d.key),
      targetIso,
      achievedIso,
      done: Boolean(achievedIso)
    });
  }

  const latestAchieved = [...steps].reverse().find((s) => s.done) || null;
  const progressPct = latestAchieved?.cumDuePct ?? 0;

  return { steps, latestAchieved, progressPct, constructionLinkedCount: defs.length };
}

async function readExecutionRoadmap(project) {
  const engineKey = project.integrationSnapshot?.executionProjectKey;
  if (!engineKey) return null;

  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const doc = await client.db(EXEC_DB).collection('ga_v4_import').findOne({ _id: 'main' });
    const payload = doc?.payload;
    if (!payload) return null;

    const scope = engineKey === 'p1' ? payload.activeBuilding || 'e' : engineKey;
    const byScope = payload.roadmap?.byScope?.[scope] || {};
    return byScope;
  } catch {
    return null;
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

/**
 * Pull construction milestones from Cashflow V1 for a DM project.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */
export async function pullConstructionMilestones(db, projectId) {
  const stateDoc = await db.collection('app_states').findOne({ _id: 'v1_cashflow' });
  const envelope = parseCfEnvelope(stateDoc);
  if (!envelope) return { ok: false, error: 'v1_cashflow state not found' };

  const projectCfg = envelope.data?.[projectId];
  if (!projectCfg) return { ok: false, error: `Project ${projectId} not in cashflow workbook` };

  const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: projectId });
  const roadmapOverrides = project ? await readExecutionRoadmap(project) : null;

  const { steps, latestAchieved, progressPct } = buildMilestoneSteps(
    projectCfg,
    roadmapOverrides || {}
  );

  return {
    ok: true,
    projectId,
    steps,
    latestAchieved,
    progressPct,
    source: roadmapOverrides ? 'cashflow+execution' : 'cashflow',
    syncedAt: new Date().toISOString()
  };
}

/**
 * Apply milestone snapshot to dm_projects and return before/after for trigger detection.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */
export async function syncConstructionMilestones(db, projectId) {
  const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: projectId });
  if (!project) return { ok: false, error: 'Project not found' };

  const before = {
    latestKey: project.integrationSnapshot?.constructionMilestones?.latestAchieved?.key || null,
    progressPct: project.constructionProgressPct || 0
  };

  const snap = await pullConstructionMilestones(db, projectId);
  if (!snap.ok) return snap;

  await db.collection(DM_COLLECTIONS.projects).updateOne(
    { _id: projectId },
    {
      $set: {
        constructionProgressPct: snap.progressPct,
        'integrationSnapshot.constructionMilestones': snap,
        updatedAt: new Date()
      }
    }
  );

  const after = {
    latestKey: snap.latestAchieved?.key || null,
    progressPct: snap.progressPct,
    latestAchieved: snap.latestAchieved
  };

  return { ok: true, before, after, snapshot: snap };
}

/**
 * Resolve execution engine key from project name slug match in ga_v4_import.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 */
export async function syncExecutionDashboard(db, projectId) {
  const project = await db.collection(DM_COLLECTIONS.projects).findOne({ _id: projectId });
  if (!project) return { ok: false, error: 'Project not found' };

  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const doc = await client.db(EXEC_DB).collection('ga_v4_import').findOne({ _id: 'main' });
    const payload = doc?.payload;
    if (!payload?.PROJECTS) return { ok: false, error: 'Execution dashboard data not found' };

    const targetSlug = slugName(project.name);
    let engineKey = project.integrationSnapshot?.executionProjectKey || null;
    let completion = null;

    if (!engineKey) {
      for (const [key, meta] of Object.entries(payload.PROJECTS)) {
        const slug = slugName(meta?.name);
        if (slug === targetSlug || slug.includes(targetSlug) || targetSlug.includes(slug)) {
          engineKey = key;
          completion = Number(meta.completion) || 0;
          break;
        }
      }
    } else {
      completion = Number(payload.PROJECTS[engineKey]?.completion) || 0;
    }

    const milestoneResult = await syncConstructionMilestones(db, projectId);

    const patch = {
      updatedAt: new Date(),
      'integrationSnapshot.execution': {
        engineKey,
        completion,
        syncedAt: new Date().toISOString()
      }
    };
    if (engineKey) patch['integrationSnapshot.executionProjectKey'] = engineKey;

    await db.collection(DM_COLLECTIONS.projects).updateOne({ _id: projectId }, { $set: patch });

    return {
      ok: true,
      engineKey,
      completion,
      milestones: milestoneResult.snapshot,
      triggers: milestoneResult.after
    };
  } catch (e) {
    return { ok: false, error: e?.message || 'Execution sync failed' };
  } finally {
    if (client) await client.close().catch(() => {});
  }
}
