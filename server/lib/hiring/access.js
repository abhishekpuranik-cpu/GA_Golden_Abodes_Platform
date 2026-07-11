import { userHasApp, userHasPermission } from '../../routes/auth.js';

/** Anyone with Hiring app access can create/edit; admins always can. */
export function canWriteHiring(user) {
  if (!user) return false;
  if (userHasPermission(user, 'manage_security')) return true;
  const roles = new Set((user.roleIds || []).map(String));
  if (roles.has('admin') || roles.has('hiring_manager')) return true;
  return userHasApp(user, 'hiring');
}

export function requireHiringWrite(req, res, next) {
  if (!canWriteHiring(req.hiringUser)) {
    return res.status(403).json({
      error: 'Hiring write access required — ask an admin to grant the Hiring app (or Hiring Manager role)'
    });
  }
  return next();
}
