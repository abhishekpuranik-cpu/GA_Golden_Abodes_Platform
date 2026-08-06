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

/** Abhishek (admin / manage_security) and HR (hiring_manager) — full travel ops. */
export function isTravelOpsStaff(user) {
  if (!user) return false;
  if (userHasPermission(user, 'manage_security')) return true;
  const roles = new Set((user.roleIds || []).map(String));
  if (roles.has('admin') || roles.has('hiring_manager')) return true;
  const set = userPermissions(user);
  return [
    PERMS.TRAVEL_VERIFY,
    PERMS.TRAVEL_APPROVE,
    PERMS.TRAVEL_ADMIN,
    PERMS.TRAVEL_SETTLE
  ].some((p) => set.has(p));
}

export function hasPerm(user, perm) {
  if (!user) return false;
  if (userHasPermission(user, 'manage_security')) return true;
  const roles = new Set((user.roleIds || []).map(String));
  if (roles.has('admin')) return true;
  // HR gets full Travel capability set without listing every string in Admin Security
  if (roles.has('hiring_manager') && String(perm || '').startsWith('ADMIN_SERVICES.TRAVEL.')) {
    return true;
  }
  // App entitlement: anyone with Travel Expenses assigned can claim (VIEW + CLAIM).
  if (
    hasAdminServicesApp(user) &&
    (perm === PERMS.TRAVEL_VIEW || perm === PERMS.TRAVEL_CLAIM)
  ) {
    return true;
  }
  return userPermissions(user).has(perm);
}

export function hasAnyTravelPerm(user) {
  if (!user) return false;
  if (isTravelOpsStaff(user)) return true;
  if (hasAdminServicesApp(user)) return true;
  const set = userPermissions(user);
  return TRAVEL_ANY.some((p) => set.has(p));
}

export function canViewTravel(user) {
  return hasAnyTravelPerm(user) || hasPerm(user, PERMS.TRAVEL_VIEW);
}

export function canClaim(user) {
  return hasPerm(user, PERMS.TRAVEL_CLAIM) || isTravelOpsStaff(user) || hasAdminServicesApp(user);
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

export function canOpenTab(user, tab) {
  if (!user || !tab) return false;
  if (isTravelOpsStaff(user) && tab.key === 'travel') return true;
  if (userHasPermission(user, 'manage_security')) return true;
  const roles = new Set((user.roleIds || []).map(String));
  if (roles.has('admin')) return true;
  if (tab.key === 'travel') return canViewTravel(user);
  return hasPerm(user, tab.requiredPermission || tabPermissionForKey(tab.key));
}
