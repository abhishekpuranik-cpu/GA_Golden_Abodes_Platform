import { ensureMongo } from '../../lib/mongo.js';
import { resolveSession } from '../../routes/auth.js';

export async function attachPostSalesUser(req, _res, next) {
  try {
    const db = await ensureMongo();
    const sess = await resolveSession(db, req);
    req.psUser = sess?.user || null;
  } catch {
    req.psUser = null;
  }
  next();
}

export function actorLabel(req, body = {}) {
  return body.by || body.completedBy || body.uploadedBy || req.psUser?.name || req.psUser?.email || '';
}

export function pushActivity(step, action, by, detail) {
  if (!step.activityLog) step.activityLog = [];
  step.activityLog.push({ action, at: new Date(), by: by || '', detail: detail || '' });
}
