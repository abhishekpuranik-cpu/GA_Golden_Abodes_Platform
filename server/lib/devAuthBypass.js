/** Dev-only login bypass — never active when NODE_ENV=production. */
function trimEnv(k) {
  const v = process.env[k];
  return typeof v === 'string' ? v.trim() : '';
}

export const DEV_BYPASS_USER_ID = '507f1f77bcf86cd799439011';

const ALL_VAULT_APPS = [
  'v1_cashflow',
  'v2_resource_planner',
  'v3_project_acquisition',
  'sales_dashboard',
  'marketing_kpi',
  'preconstruction',
  'execution',
  'finance_kpi',
  'finance_kpi_admin',
  'dm_spv_governance',
  'post_sales',
  'hiring',
  'admin_services',
  'admin_security'
];

export function isDevAuthBypass() {
  if (process.env.NODE_ENV === 'production') return false;
  const flag = trimEnv('DEV_BYPASS_AUTH').toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

export function devBypassUser() {
  return {
    id: DEV_BYPASS_USER_ID,
    email: 'dev@localhost',
    name: 'Dev User (auth bypass)',
    roleIds: ['admin', 'hiring_manager'],
    allowedApps: ALL_VAULT_APPS,
    allowedProjects: [],
    allowedTabs: [],
    permissions: [
      'manage_security',
      'ADMIN_SERVICES.TRAVEL.VIEW',
      'ADMIN_SERVICES.TRAVEL.CLAIM',
      'ADMIN_SERVICES.TRAVEL.VERIFY',
      'ADMIN_SERVICES.TRAVEL.APPROVE',
      'ADMIN_SERVICES.TRAVEL.ADMIN',
      'ADMIN_SERVICES.TRAVEL.SETTLE'
    ]
  };
}

export function devBypassSession() {
  return { sid: 'dev-bypass', user: devBypassUser() };
}
