import { ensureMongo } from './mongo.js';
import { resolveSession, userHasApp, userHasPermission } from '../routes/auth.js';

/** RBAC app id may differ from Mongo app_states id (e.g. v3). */
export const APP_ID_ALIASES = {
  v3_org_planner: 'v3_project_acquisition',
  v3_project_acquisition: 'v3_project_acquisition'
};

export function normalizeRbacAppId(appId) {
  const id = String(appId || '').trim().toLowerCase();
  return APP_ID_ALIASES[id] || id;
}

const PUBLIC_PREFIXES = ['/api/auth', '/api/health', '/api/access', '/access'];

const STATIC_EXT = /\.(js|css|map|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot|json|txt|html)$/i;

/** Longest-prefix wins when matching protected routes. */
const ROUTE_APP_RULES = [
  { prefix: '/admin/security', appId: 'admin_security', permission: 'manage_security' },
  { prefix: '/app/resource-planner', appId: 'v2_resource_planner' },
  { prefix: '/app/org-planner', appId: 'v3_project_acquisition' },
  { prefix: '/app/dm-governance', appId: 'dm_spv_governance' },
  { prefix: '/app/post-sales', appId: 'post_sales' },
  { prefix: '/preconstruction', appId: 'preconstruction' },
  { prefix: '/legacy/GA_Cashflow_V1.html', appId: 'v1_cashflow' },
  { prefix: '/legacy/GA_ResourcePlanner_V2.html', appId: 'v2_resource_planner' },
  { prefix: '/legacy/GA_Portfolio_Enablement.html', appId: 'v2_resource_planner' },
  { prefix: '/legacy/GA_OrgResourcePlanner_V3.html', appId: 'v3_project_acquisition' },
  { prefix: '/legacy/ga_sales_dashboard.html', appId: 'sales_dashboard' },
  { prefix: '/legacy/GA_MarketingSales_KPI_Dashboard.html', appId: 'marketing_kpi' }
];

const AUTH_ONLY_PREFIXES = ['/', '/legacy/Golden_Abodes_App_Vault.html'];

function isPublicPath(pathname) {
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (pathname.startsWith('/assets/')) return true;
  if (/^\/api\/preconstruction\/attachments\/[^/]+\/wa-media$/.test(pathname)) return true;
  if (STATIC_EXT.test(pathname)) return true;
  return false;
}

function resolveRouteRule(pathname) {
  for (const rule of ROUTE_APP_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) return rule;
  }
  if (AUTH_ONLY_PREFIXES.some((p) => pathname === p || (p !== '/' && pathname.startsWith(`${p}/`)))) {
    return { authOnly: true };
  }
  if (pathname === '/') return { authOnly: true };
  return null;
}

function resolveApiRule(pathname) {
  if (pathname.startsWith('/api/apps/')) {
    const parts = pathname.split('/').filter(Boolean);
    const appId = parts[2];
    if (appId) return { appId: normalizeRbacAppId(appId) };
  }
  if (pathname === '/api/workspace-keys' || pathname.startsWith('/api/workspace-keys/')) {
    return { authOnly: true };
  }
  if (
    pathname === '/api/preconstruction-state' ||
    pathname.startsWith('/api/preconstruction-state/') ||
    pathname.startsWith('/api/preconstruction/')
  ) {
    return { appId: 'preconstruction' };
  }
  if (pathname === '/api/dm-governance' || pathname.startsWith('/api/dm-governance/')) {
    return { appId: 'dm_spv_governance' };
  }
  if (pathname === '/api/postsales' || pathname.startsWith('/api/postsales/')) {
    return { appId: 'post_sales' };
  }
  return null;
}

function wantsHtml(req) {
  const accept = String(req.headers.accept || '');
  return accept.includes('text/html') || accept.includes('*/*');
}

function redirectLogin(req, res) {
  const nextUrl = encodeURIComponent(`${req.path}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`);
  return res.redirect(`/access?next=${nextUrl}`);
}

function deny(req, res) {
  if (wantsHtml(req)) {
    return res.status(403).type('text/html').send('<!doctype html><html><body style="font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:40px"><h2>Access denied</h2><p>You do not have permission for this app.</p><p><a href="/" style="color:#93c5fd">Back to App Vault</a></p></body></html>');
  }
  return res.status(403).json({ error: 'Forbidden' });
}

export function createRbacMiddleware() {
  return async function rbacGate(req, res, next) {
    if (req.method === 'OPTIONS') return next();
    const pathname = req.path;

    if (isPublicPath(pathname)) return next();

    const apiRule = pathname.startsWith('/api/') ? resolveApiRule(pathname) : null;
    const routeRule = !apiRule ? resolveRouteRule(pathname) : null;
    const rule = apiRule || routeRule;

    if (!rule) return next();

    const db = await ensureMongo();
    if (!db) {
      if (pathname.startsWith('/api/')) {
        return res.status(503).json({ error: 'MongoDB unavailable' });
      }
      return next();
    }

    const sess = await resolveSession(db, req);
    if (!sess) {
      if (pathname.startsWith('/api/')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      return redirectLogin(req, res);
    }

    req.authUser = sess.user;

    if (rule.authOnly) return next();

    if (rule.permission && !userHasPermission(sess.user, rule.permission)) {
      return deny(req, res);
    }

    if (rule.appId && !userHasApp(sess.user, rule.appId)) {
      return deny(req, res);
    }

    return next();
  };
}
