import { userHasApp, userHasPermission } from '../../routes/auth.js';
import { APP_ID, PERMS, TRAVEL_ANY } from './constants.js';

export function hasAdminServicesApp(user) {
  if (!user) return false;
  if (userHasPermission(user, 'manage_security')) return true;
  return userHasApp(user, APP_ID);
}

export function userPermissions(user) {
  return new Set((user?.permissions || []).map(String));
}

export function hasPerm(user, perm) {
  if (!user) return false;
  if (userHasPermission(user, 'manage_security')) return true;
  const roles = new Set((user.roleIds || []).map(String));
  if (roles.has('admin')) return true;
  return userPermissions(user).has(perm);
}

export function hasAnyTravelPerm(user) {
  if (!user) return false;
  if (userHasPermission(user, 'manage_security')) return true;
  const roles = new Set((user.roleIds || []).map(String));
  if (roles.has('admin')) return true;
  const set = userPermissions(user);
  return TRAVEL_ANY.some((p) => set.has(p));
}

/** VIEW is implied by any travel action permission. */
export function canViewTravel(user) {
  return hasAnyTravelPerm(user) || hasPerm(user, PERMS.TRAVEL_VIEW);
}

export function canClaim(user) {
  return hasPerm(user, PERMS.TRAVEL_CLAIM);
}

export function canVerify(user) {
  return hasPerm(user, PERMS.TRAVEL_VERIFY);
}

export function canApprove(user) {
  return hasPerm(user, PERMS.TRAVEL_APPROVE);
}

export function canTravelAdmin(user) {
  return hasPerm(user, PERMS.TRAVEL_ADMIN);
}

export function canSettle(user) {
  return hasPerm(user, PERMS.TRAVEL_SETTLE);
}

export function requirePerm(checker, message) {
  return (req, res, next) => {
    const user = req.authUser || req.asUser;
    if (!checker(user)) {
      return res.status(403).json({ error: message || 'Forbidden' });
    }
    return next();
  };
}

export function tabPermissionForKey(key) {
  const k = String(key || '').toUpperCase();
  return `ADMIN_SERVICES.${k}.VIEW`;
}

/** User can open a tab if they have the tab's VIEW permission or any TRAVEL_* for travel. */
export function canOpenTab(user, tab) {
  if (!user || !tab) return false;
  if (userHasPermission(user, 'manage_security')) return true;
  const roles = new Set((user.roleIds || []).map(String));
  if (roles.has('admin')) return true;
  if (tab.key === 'travel') return canViewTravel(user);
  return hasPerm(user, tab.requiredPermission || tabPermissionForKey(tab.key));
}
