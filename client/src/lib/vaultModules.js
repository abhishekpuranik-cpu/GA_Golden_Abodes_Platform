import { APP_IDS } from '../appRegistry.js';
import { VAULT_PLATFORM_APPS } from './vaultCatalog.js';

/** Canonical vault launcher catalog for cards + Cmd-K (ACL applied by callers). */
export const VAULT_MODULE_CATALOG = [
  ...VAULT_PLATFORM_APPS.map((app) => ({
    id: app.appId,
    title: app.title,
    purpose: app.description,
    path: app.path,
    glyph: app.appId === APP_IDS.HIRING ? 'HR' : app.appId === APP_IDS.POST_SALES ? 'PS' : 'BH',
    group: 'platform',
    featured: !!app.featured,
    status: 'LIVE',
  })),
  {
    id: 'v3_project_acquisition',
    title: 'Project Acquisition',
    purpose: 'Org resource planner — opens in a synced frame.',
    path: '/app/org-planner',
    glyph: 'V3',
    group: 'planner',
    status: 'LIVE',
  },
  {
    id: 'v2_resource_planner',
    title: 'Resource Planner',
    purpose: 'Capacity, allocations, and V3 project links.',
    path: '/app/resource-planner',
    glyph: 'V2',
    group: 'planner',
    status: 'LIVE',
  },
  {
    id: 'v1_cashflow',
    title: 'Cashflow Tracker',
    purpose: 'Project cashflow, Tally sync, and investor views.',
    path: '/legacy/GA_Cashflow_V1.html',
    glyph: 'V1',
    group: 'planner',
    status: 'LIVE',
    external: true,
  },
  {
    id: 'finance_kpi',
    title: 'Finance KPI & Governance',
    purpose: 'Accounting KPIs, compliance calendar, and scoring.',
    path: '/legacy/GA_Finance_KPI.html',
    glyph: 'FA',
    group: 'planner',
    status: 'LIVE',
    external: true,
  },
  {
    id: 'sales_dashboard',
    title: 'Sales dashboard',
    purpose: 'Inventory, bookings, and CRM post-sales import.',
    path: '/legacy/ga_sales_dashboard.html',
    glyph: 'SL',
    group: 'sales',
    status: 'LIVE',
    external: true,
  },
  {
    id: 'marketing_kpi',
    title: 'Marketing KPIs',
    purpose: 'Marketing and sales KPI dashboard.',
    path: '/legacy/GA_MarketingSales_KPI_Dashboard.html',
    glyph: 'MK',
    group: 'sales',
    status: 'LIVE',
    external: true,
  },
  {
    id: 'execution',
    title: 'Construction Execution Dashboard',
    purpose: 'Live construction execution dashboard.',
    path: '',
    glyph: 'EX',
    group: 'construction',
    status: 'LIVE',
    external: true,
  },
  {
    id: 'preconstruction',
    title: 'PreConstruction',
    purpose: 'Pre-construction tasks, comments, and assignees.',
    path: '/preconstruction/',
    glyph: 'PC',
    group: 'construction',
    status: 'LIVE',
    external: true,
  },
  {
    id: 'admin_security',
    title: 'Admin Security',
    purpose: 'Users, roles, apps, and project access.',
    path: '/admin/security',
    glyph: 'AD',
    group: 'admin',
    status: 'LIVE',
  },
];

export function greetingForNow(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function firstNameFromUser(user) {
  const raw = String(user?.name || '').trim() || String(user?.email || '').split('@')[0] || 'there';
  return raw.split(/\s+/)[0];
}

export function userCanOpenModule(user, moduleId) {
  const allowed = new Set((user?.allowedApps || []).map((x) => String(x)));
  const perms = user?.permissions || [];
  if (moduleId === 'admin_security') {
    return allowed.has('admin_security') || perms.includes('manage_security');
  }
  if (moduleId === 'finance_kpi') {
    return allowed.has('finance_kpi') || allowed.has('finance_kpi_admin') || allowed.has('admin_security') || perms.includes('manage_security');
  }
  if (moduleId === 'v3_project_acquisition') {
    return allowed.has('v3_project_acquisition') || allowed.has('v3_org_planner');
  }
  return allowed.has(moduleId);
}

export function platformEnvTag() {
  const raw = String(import.meta.env.VITE_GA_ENV || import.meta.env.MODE || 'production').toLowerCase();
  if (raw.includes('stag')) return 'STAGING';
  if (raw.includes('dev')) return 'DEV';
  return 'PROD';
}
