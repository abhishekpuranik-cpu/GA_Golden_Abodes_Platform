import { repairV1CashflowForRead } from '../../v1CashflowMongoPack.js';
import { MongoClient } from 'mongodb';
import { MONGODB_URI } from '../../config.js';

const EXEC_DB = process.env.EXECUTION_MONGODB_DB_NAME || 'ga_execution_dashboard';

export function slugName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function parseJsonField(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export async function loadCashflowEnvelope(db) {
  const doc = await db.collection('app_states').findOne({ _id: 'v1_cashflow' });
  if (!doc?.data) return null;
  try {
    if (doc.data._cfMongoPack || doc.data.ga_cf_v1) {
      return await repairV1CashflowForRead(db, doc.data);
    }
    const raw = doc.data.ga_cf_v1;
    if (typeof raw === 'string') return JSON.parse(raw);
  } catch {
    return null;
  }
  return null;
}

export async function loadV2PlannerState(db) {
  const doc = await db.collection('app_states').findOne({ _id: 'v2_resource_planner' });
  if (!doc?.data) return null;
  const blob = parseJsonField(doc.data.ga_rp_state_v1);
  const projects = parseJsonField(doc.data.ga_rp_projects);
  return { blob, projects: Array.isArray(projects) ? projects : [], updatedAt: doc.updatedAt };
}

export async function loadV3PlannerState(db) {
  const doc = await db.collection('app_states').findOne({ _id: 'v3_org_planner' });
  if (!doc?.data) return null;
  const blob = parseJsonField(doc.data.ga_planner_state_v1);
  const projects = parseJsonField(doc.data.ga_rp_projects);
  const cfSync = parseJsonField(doc.data.ga_v3_cf_sync);
  return {
    blob,
    projects: Array.isArray(projects) ? projects : [],
    cfSync: cfSync && typeof cfSync === 'object' ? cfSync : {},
    updatedAt: doc.updatedAt
  };
}

export async function loadPreconState(db) {
  const doc = await db.collection('app_states').findOne({ _id: 'preconstruction' });
  if (!doc?.data?.projects) return null;
  return { projects: doc.data.projects || [], updatedAt: doc.updatedAt };
}

function parseStateBlob(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export async function loadFinanceKpiState(db) {
  const doc = await db.collection('app_states').findOne({ _id: 'finance_kpi' });
  if (!doc?.data) return null;
  const blob = parseStateBlob(doc.data.ga_finkpi_state_v2);
  return { blob, updatedAt: doc.updatedAt };
}

export async function loadMarketingKpiState(db) {
  const doc = await db.collection('app_states').findOne({ _id: 'marketing_kpi' });
  if (!doc?.data) return null;
  const blob = parseStateBlob(doc.data.ga_mkt_kpi_state_v1);
  return { blob, updatedAt: doc.updatedAt };
}

let execCache = null;
let execCacheAt = 0;

export async function loadExecutionPayload() {
  const now = Date.now();
  if (execCache && now - execCacheAt < 60000) return execCache;
  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const doc = await client.db(EXEC_DB).collection('ga_v4_import').findOne({ _id: 'main' });
    execCache = doc?.payload || null;
    execCacheAt = now;
    return execCache;
  } catch {
    return null;
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

export function matchProjectByName(name, candidates, nameKey = 'name') {
  const target = slugName(name);
  if (!target) return null;
  for (const c of candidates || []) {
    const slug = slugName(c[nameKey] || c.projName);
    if (slug === target || slug.includes(target) || target.includes(slug)) return c;
  }
  return null;
}

export function daysBetween(a, b) {
  const t1 = new Date(a).getTime();
  const t2 = new Date(b).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
  return Math.round((t2 - t1) / (24 * 3600 * 1000));
}
