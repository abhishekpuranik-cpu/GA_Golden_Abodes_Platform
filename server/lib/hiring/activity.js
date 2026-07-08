import HiringActivityLog from '../../models/hiring/ActivityLog.js';
import { ensureMongo } from '../mongo.js';
import { resolveSession } from '../../routes/auth.js';
import { isDevAuthBypass, devBypassUser } from '../devAuthBypass.js';

export async function attachHiringUser(req, _res, next) {
  if (isDevAuthBypass()) {
    req.hiringUser = devBypassUser();
    return next();
  }
  try {
    const db = await ensureMongo();
    const sess = await resolveSession(db, req);
    req.hiringUser = sess?.user || null;
  } catch {
    req.hiringUser = null;
  }
  next();
}

export function actorId(req) {
  return req.hiringUser?.id || null;
}

export async function logHiringActivity({ refType, refId, action, detail, by }) {
  await HiringActivityLog.create({
    refType,
    refId,
    action,
    detail: detail || '',
    by: by || null,
    at: new Date()
  });
}
