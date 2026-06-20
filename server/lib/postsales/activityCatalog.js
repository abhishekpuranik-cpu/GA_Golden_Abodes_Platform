import { STEPS } from './steps.js';
import { getStepTaskKind } from './taskKinds.js';

const CATALOG_ID = 'pipeline_activity_catalog';

let cachedKindMap = null;

function norm(s) {
  return String(s || '').trim();
}

export function activityFromStep(def) {
  return {
    number: def.number,
    name: def.name,
    phase: def.phase,
    assignedRole: def.assignedRole || '',
    taskKind: getStepTaskKind(def.number),
    slaDays: def.slaDays ?? null,
    slaUnit: def.slaUnit || '',
    slaAck: def.slaAck ?? null,
    slaResolution: def.slaResolution ?? null,
    triggerEvent: def.triggerEvent || '',
    escalation: def.escalation || '',
    checklist: [...(def.checklist || def.homeLoanChecklist || [])],
    blockedBy: [...(def.blockedBy || [])],
    fundingTypeSplit: !!def.fundingTypeSplit,
    homeLoanChecklist: [...(def.homeLoanChecklist || [])],
    selfFundedChecklist: [...(def.selfFundedChecklist || [])],
    active: true,
  };
}

export function ensureActivityShape(raw) {
  const number = Number(raw?.number);
  if (!number || number < 1) return null;
  const taskKind = raw.taskKind === 'backend' ? 'backend' : 'cx';
  return {
    number,
    name: norm(raw.name) || `Step ${number}`,
    phase: norm(raw.phase) || 'booking_handoff',
    assignedRole: norm(raw.assignedRole),
    taskKind,
    slaDays: raw.slaDays != null && raw.slaDays !== '' ? Number(raw.slaDays) : null,
    slaUnit: norm(raw.slaUnit),
    slaAck: raw.slaAck != null && raw.slaAck !== '' ? Number(raw.slaAck) : null,
    slaResolution: raw.slaResolution != null && raw.slaResolution !== '' ? Number(raw.slaResolution) : null,
    triggerEvent: norm(raw.triggerEvent),
    escalation: norm(raw.escalation),
    checklist: Array.isArray(raw.checklist) ? raw.checklist.map(norm).filter(Boolean) : [],
    blockedBy: Array.isArray(raw.blockedBy) ? raw.blockedBy.map(Number).filter(Boolean) : [],
    fundingTypeSplit: !!raw.fundingTypeSplit,
    homeLoanChecklist: Array.isArray(raw.homeLoanChecklist) ? raw.homeLoanChecklist.map(norm).filter(Boolean) : [],
    selfFundedChecklist: Array.isArray(raw.selfFundedChecklist) ? raw.selfFundedChecklist.map(norm).filter(Boolean) : [],
    active: raw.active !== false,
  };
}

export function stepTaskKindMap(activities = []) {
  const map = {};
  for (const a of activities) {
    if (a.number && (a.taskKind === 'cx' || a.taskKind === 'backend')) {
      map[a.number] = a.taskKind;
    }
  }
  return map;
}

export function resolveStepTaskKind(stepNumber, activities) {
  const n = Number(stepNumber);
  const fromList = activities?.find((a) => a.number === n && a.active !== false)?.taskKind;
  if (fromList === 'cx' || fromList === 'backend') return fromList;
  if (cachedKindMap?.[n]) return cachedKindMap[n];
  return getStepTaskKind(n);
}

export async function loadActivityCatalog(db) {
  const doc = await db.collection('post_sales_settings').findOne({ _id: CATALOG_ID });
  if (doc?.activities?.length) {
    const activities = doc.activities.map(ensureActivityShape).filter(Boolean).sort((a, b) => a.number - b.number);
    cachedKindMap = stepTaskKindMap(activities);
    return { activities, updatedAt: doc.updatedAt || null };
  }
  return seedActivityCatalog(db);
}

async function seedActivityCatalog(db) {
  const activities = STEPS.map(activityFromStep);
  const updatedAt = new Date();
  await db.collection('post_sales_settings').updateOne(
    { _id: CATALOG_ID },
    { $set: { activities, updatedAt } },
    { upsert: true }
  );
  cachedKindMap = stepTaskKindMap(activities);
  return { activities, updatedAt };
}

export async function saveActivityCatalog(db, activities) {
  const cleaned = activities.map(ensureActivityShape).filter(Boolean).sort((a, b) => a.number - b.number);
  const numbers = cleaned.map((a) => a.number);
  if (new Set(numbers).size !== numbers.length) {
    throw new Error('Duplicate step numbers in activity catalog');
  }
  const updatedAt = new Date();
  await db.collection('post_sales_settings').updateOne(
    { _id: CATALOG_ID },
    { $set: { activities: cleaned, updatedAt } },
    { upsert: true }
  );
  cachedKindMap = stepTaskKindMap(cleaned);
  return { activities: cleaned, updatedAt };
}

export function nextActivityNumber(activities) {
  const max = activities.reduce((m, a) => Math.max(m, a.number || 0), 0);
  return max + 1;
}
