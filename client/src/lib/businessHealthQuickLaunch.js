import { APP_IDS } from '../appRegistry.js';
import { canOpenVaultApp } from './vaultCatalog.js';
import { APP_CALENDAR_COLORS } from './appCalendarColors.js';

/** Deep links to vault / platform apps — ACL matches VaultHome. */
export const QUICK_LAUNCH_APPS = [
  {
    appId: APP_IDS.V1_CASHFLOW,
    label: 'Cashflow V1',
    href: '/legacy/GA_Cashflow_V1.html',
    color: APP_CALENDAR_COLORS.v1_cashflow
  },
  {
    appId: APP_IDS.V2_RESOURCE_PLANNER,
    label: 'Resource V2',
    href: '/app/resource-planner',
    color: APP_CALENDAR_COLORS.v2_resource_planner
  },
  {
    appId: APP_IDS.V3_ORG_PLANNER,
    label: 'V3 Acquisition',
    href: '/app/org-planner',
    color: APP_CALENDAR_COLORS.v3_org_planner
  },
  {
    appId: APP_IDS.POST_SALES,
    label: 'Post Sales',
    href: '/app/post-sales',
    color: APP_CALENDAR_COLORS.post_sales
  },
  {
    appId: 'finance_kpi',
    label: 'Finance KPI',
    href: '/legacy/GA_Finance_KPI.html',
    color: APP_CALENDAR_COLORS.finance_kpi
  },
  {
    appId: 'marketing_kpi',
    label: 'Marketing KPI',
    href: '/legacy/GA_MarketingSales_KPI_Dashboard.html',
    color: APP_CALENDAR_COLORS.marketing_kpi
  },
  {
    appId: APP_IDS.PRECONSTRUCTION,
    label: 'PreConstruction',
    href: '/preconstruction/',
    color: APP_CALENDAR_COLORS.preconstruction
  },
  {
    appId: 'execution',
    label: 'Execution',
    href: '',
    color: APP_CALENDAR_COLORS.ga_execution_dashboard,
    lsKey: 'ga_execution_dashboard_url'
  }
];

function executionHref() {
  try {
    const ls = window.localStorage.getItem('ga_execution_dashboard_url');
    if (ls?.trim()) return ls.trim();
  } catch {
    /* ignore */
  }
  const env = import.meta.env.VITE_EXECUTION_DASHBOARD_URL;
  return typeof env === 'string' && env.trim() ? env.trim() : '';
}

export function quickLaunchForUser(user) {
  const allowed = new Set((user?.allowedApps || []).map((x) => String(x)));
  const isAdmin = (user?.permissions || []).includes('manage_security');

  return QUICK_LAUNCH_APPS.map((app) => {
    let href = app.href;
    if (app.lsKey) href = executionHref();
    const enabled =
      isAdmin || !allowed.size || canOpenVaultApp(app.appId, allowed) || allowed.has('admin_security');
    const missingUrl = app.appId === 'execution' && !href;
    return {
      ...app,
      href: href || '#',
      enabled: enabled && !missingUrl,
      locked: !enabled,
      missingUrl
    };
  });
}
