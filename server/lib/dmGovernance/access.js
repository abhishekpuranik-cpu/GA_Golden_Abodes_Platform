/** DM Governance permissions and tab-level access. */

export const DM_PERMISSIONS = {
  ADMIN: 'dm_admin',
  FINANCE: 'dm_finance',
  APPROVE: 'dm_approve',
  HR: 'dm_hr',
  SPV_REVIEW: 'dm_spv_review',
  VIEW: 'dm_view'
};

export const DM_TABS = {
  BUSINESS_HEALTH: 'dm_business_health',
  DASHBOARD: 'dm_dashboard',
  SPVS: 'dm_spvs',
  PROJECTS: 'dm_projects',
  BILLING: 'dm_billing',
  INVOICES: 'dm_invoices',
  COMPLIANCE: 'dm_compliance',
  REPORTS: 'dm_reports',
  CONSOLIDATED: 'dm_consolidated',
  EXECUTIVE: 'dm_executive',
  SCENARIOS: 'dm_scenarios',
  ALERTS: 'dm_alerts',
  SETTINGS: 'dm_settings'
};

/** Tabs hidden from SPV reviewers and viewers without consolidated permission. */
export const DM_SENSITIVE_TABS = new Set([DM_TABS.CONSOLIDATED, DM_TABS.SETTINGS]);

export function userHasDmPermission(user, permission) {
  const perms = new Set((user?.permissions || []).map((x) => String(x)));
  if (perms.has('manage_security') || perms.has(DM_PERMISSIONS.ADMIN)) return true;
  if (permission && perms.has(permission)) return true;
  return false;
}

export function userDmTabs(user) {
  const tabs = new Set((user?.allowedTabs || []).map((x) => String(x)));
  const perms = new Set((user?.permissions || []).map((x) => String(x)));

  if (perms.has('manage_security') || perms.has(DM_PERMISSIONS.ADMIN)) {
    return Object.values(DM_TABS);
  }

  if (tabs.size) {
    return Array.from(tabs).filter((t) => t.startsWith('dm_'));
  }

  if (perms.has(DM_PERMISSIONS.SPV_REVIEW)) {
    return [DM_TABS.DASHBOARD, DM_TABS.SPVS, DM_TABS.PROJECTS, DM_TABS.BILLING, DM_TABS.INVOICES, DM_TABS.COMPLIANCE];
  }

  if (perms.has(DM_PERMISSIONS.VIEW)) {
    return Object.values(DM_TABS).filter((t) => !DM_SENSITIVE_TABS.has(t));
  }

  return Object.values(DM_TABS).filter((t) => !DM_SENSITIVE_TABS.has(t));
}

export function userCanDmTab(user, tabId) {
  const allowed = new Set(userDmTabs(user));
  if (tabId === DM_TABS.BUSINESS_HEALTH) {
    return allowed.has(DM_TABS.BUSINESS_HEALTH) || allowed.has(DM_TABS.DASHBOARD);
  }
  return allowed.has(tabId);
}

/** Empty allowedProjects = all projects (leadership/finance). */
export function userProjectScope(user) {
  const list = (user?.allowedProjects || []).map((x) => String(x).trim()).filter(Boolean);
  return list.length ? list : null;
}

export function projectInScope(user, project) {
  const scope = userProjectScope(user);
  if (!scope) return true;
  const names = new Set(scope.map((s) => s.toLowerCase()));
  const ids = new Set(scope.map((s) => s.toUpperCase()));
  const name = String(project?.name || '').toLowerCase();
  const code = String(project?.projectCode || project?._id || '').toUpperCase();
  return names.has(name) || ids.has(code) || scope.includes(project?._id);
}

export function buildProjectFilter(user) {
  const scope = userProjectScope(user);
  if (!scope) return {};
  const or = [];
  scope.forEach((s) => {
    or.push({ name: s });
    or.push({ projectCode: s });
    or.push({ _id: s });
  });
  return { $or: or };
}

export function requireDmWrite(user) {
  return (
    userHasDmPermission(user, DM_PERMISSIONS.ADMIN) ||
    userHasDmPermission(user, DM_PERMISSIONS.FINANCE) ||
    (user?.permissions || []).includes('manage_security')
  );
}

export function requireDmApprove(user) {
  return (
    userHasDmPermission(user, DM_PERMISSIONS.APPROVE) ||
    userHasDmPermission(user, DM_PERMISSIONS.ADMIN) ||
    (user?.permissions || []).includes('manage_security')
  );
}
