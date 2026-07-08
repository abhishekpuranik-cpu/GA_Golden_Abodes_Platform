import { userHasPermission } from '../../routes/auth.js';

export function canWriteHiring(user) {
  if (!user) return false;
  if (userHasPermission(user, 'manage_security')) return true;
  const roles = new Set((user.roleIds || []).map(String));
  return roles.has('admin') || roles.has('hiring_manager');
}

export function requireHiringWrite(req, res, next) {
  if (!canWriteHiring(req.hiringUser)) {
    return res.status(403).json({ error: 'Hiring manager or admin role required' });
  }
  return next();
}
