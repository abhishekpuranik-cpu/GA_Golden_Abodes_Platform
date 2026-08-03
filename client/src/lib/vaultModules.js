import { APP_IDS } from '../appRegistry.js';

const DESK_DEFAULT_IDS = [
  APP_IDS.POST_SALES,
  'sales_dashboard',
  'execution',
  APP_IDS.HIRING,
];

const DESK_LS_KEY = 'ga_vault_desk_ids';

/** Canonical vault launcher catalog for cards + Cmd-K (ACL applied by callers). */
export const VAULT_MODULE_CATALOG = [
  {
    id: APP_IDS.POST_SALES,
    title: 'Post-Sales Console',
    purpose: 'Bookings, demands, collections & registrations.',
    path: '/app/post-sales',
    icon: '🏠',
    glyph: 'PS',
    group: 'platform',
    desk: true,
    featured: false,
    status: 'LIVE',
  },
  {
    id: APP_IDS.HIRING,
    title: 'Hiring · M8',
    purpose: 'Talent registry, pipeline and director gates.',
    path: '/app/hiring',
    icon: '💛',
    glyph: 'HR',
    group: 'platform',
    desk: true,
    featured: true,
    status: 'BETA',
  },
  {
    id: APP_IDS.ADMIN_SERVICES,
    title: 'Admin Services · M9',
    purpose: 'Travel & fuel claims, fleet, assets and office ops.',
    path: '/app/admin-services',
    icon: '🧳',
    glyph: 'AS',
    group: 'platform',
    desk: true,
    featured: true,
    status: 'BETA',
  },
  {
    id: APP_IDS.DM_SPV_GOVERNANCE,
    title: 'Board Room',
    purpose: 'DM fees, SPV equity and partner ledgers.',
    path: '/app/dm-governance',
    icon: '🗂️',
    glyph: 'BH',
    group: 'platform',
    desk: false,
    featured: false,
    status: 'DIRECTORS',
  },
  {
    id: 'v3_project_acquisition',
    title: 'Project Acquisition',
    purpose: 'Org resource planner and project pipeline.',
    path: '/app/org-planner',
    icon: '📐',
    glyph: 'V3',
    group: 'planner',
    status: 'LIVE',
  },
  {
    id: 'v2_resource_planner',
    title: 'Resource Planner',
    purpose: 'Capacity, allocations, and team bandwidth.',
    path: '/app/resource-planner',
    icon: '👥',
    glyph: 'V2',
    group: 'planner',
    status: 'LIVE',
  },
  {
    id: 'v1_cashflow',
    title: 'Cashflow',
    purpose: 'Entity-wise inflows, outflows and projections.',
    path: '/legacy/GA_Cashflow_V1.html',
    icon: '💰',
    glyph: 'CF',
    group: 'planner',
    status: 'LIVE',
    external: true,
  },
  {
    id: 'finance_kpi',
    title: 'Finance KPIs',
    purpose: 'Finance scorecards and review cycles.',
    path: '/legacy/GA_Finance_KPI.html',
    icon: '📄',
    glyph: 'FA',
    group: 'planner',
    status: 'LIVE',
    external: true,
  },
  {
    id: 'sales_dashboard',
    title: 'Sales Analytics',
    purpose: 'Funnel, sources and Rate per Sq. Ft. by project.',
    path: '/legacy/ga_sales_dashboard.html',
    icon: '📈',
    glyph: 'SL',
    group: 'sales',
    desk: true,
    status: 'LIVE',
    external: true,
  },
  {
    id: 'marketing_kpi',
    title: 'Marketing KPIs',
    purpose: 'Marketing and sales KPI dashboards.',
    path: '/legacy/GA_MarketingSales_KPI_Dashboard.html',
    icon: '🎯',
    glyph: 'MK',
    group: 'sales',
    status: 'LIVE',
    external: true,
  },
  {
    id: 'execution',
    title: 'Construction KPIs',
    purpose: 'Progress, quality and site cadence dashboards.',
    path: '',
    icon: '🏗️',
    glyph: 'EX',
    group: 'construction',
    desk: true,
    status: 'LIVE',
    external: true,
  },
  {
    id: 'preconstruction',
    title: 'Pre-Construction',
    purpose: 'Approvals, Gantt and PCMC regulatory tracker.',
    path: '/preconstruction/',
    icon: '📋',
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
    icon: '🔐',
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
    return (
      allowed.has('finance_kpi') ||
      allowed.has('finance_kpi_admin') ||
      allowed.has('admin_security') ||
      perms.includes('manage_security')
    );
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

/** Absolute URL so React routes also open in a new tab. */
export function toNewTabHref(href) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (typeof window === 'undefined') return raw;
  try {
    return new URL(raw, window.location.origin).href;
  } catch {
    return raw;
  }
}

/** Desk pins — local only (no schema). Defaults once; after save, empty desks stay empty. */
export function loadDeskIds() {
  try {
    const raw = window.localStorage.getItem(DESK_LS_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    }
  } catch {
    /* ignore */
  }
  return [...DESK_DEFAULT_IDS];
}

export function saveDeskIds(ids) {
  try {
    window.localStorage.setItem(DESK_LS_KEY, JSON.stringify(Array.isArray(ids) ? ids.map(String) : []));
  } catch {
    /* ignore */
  }
}

/** Resolve desk apps from an ordered id list (no auto-fill). */
export function pickDeskModules(modules, orderedIds) {
  const pinned = Array.isArray(orderedIds) ? orderedIds : loadDeskIds();
  const byId = new Map(modules.map((m) => [m.id, m]));
  const desk = [];
  for (const id of pinned) {
    const m = byId.get(id);
    if (m && !m.locked && m.href) desk.push(m);
  }
  return desk;
}
