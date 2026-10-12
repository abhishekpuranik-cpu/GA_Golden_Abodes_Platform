import { userHasPermission } from '../../../routes/auth.js';

export const TRACKER_PERMS = {
  HR: 'HIRING.TRACKER.HR',
  MGMT: 'HIRING.TRACKER.MGMT',
  DECIDE: 'HIRING.TRACKER.DECIDE',
  ADMIN: 'HIRING.TRACKER.ADMIN'
};

/**
 * Every capability is an explicit grant (or vault admin via manage_security).
 * Hiring-app access alone does not open the tracker, and management content
 * is never implied by HR or questionnaire-admin grants.
 */
export function trackerCaps(user) {
  const none = { view: false, hr: false, mgmt: false, decide: false, admin: false, override: false, editHrTemplates: false, editMgmtTemplates: false };
  if (!user) return none;
  const superAdmin = userHasPermission(user, 'manage_security');
  const has = (p) => superAdmin || userHasPermission(user, p);
  const decide = has(TRACKER_PERMS.DECIDE);
  const mgmt = decide || has(TRACKER_PERMS.MGMT);
  const hr = mgmt || has(TRACKER_PERMS.HR);
  const admin = has(TRACKER_PERMS.ADMIN);
  return {
    view: hr,
    hr,
    mgmt,
    decide,
    admin,
    override: decide,
    editHrTemplates: admin || decide,
    editMgmtTemplates: mgmt && (admin || decide)
  };
}

export function attachTrackerCaps(req, res, next) {
  req.trk = trackerCaps(req.hiringUser);
  if (!req.trk.view) {
    return res.status(403).json({ error: 'Hiring Tracker access has not been granted — ask an admin for an HR, Interviewer or Decision-maker role' });
  }
  return next();
}

export function requireCap(cap, message) {
  return (req, res, next) => {
    if (!req.trk?.[cap]) return res.status(403).json({ error: message || 'Not permitted' });
    return next();
  };
}

export const requireMgmt = requireCap('mgmt', 'Not permitted');
export const requireDecide = requireCap('decide', 'Only authorised decision-makers can record the final decision');
export const requireTemplateEditor = requireCap('editHrTemplates', 'Questionnaire edit access required');
