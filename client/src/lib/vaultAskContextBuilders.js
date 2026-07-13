import { hiringApi } from './hiringApi.js';
import { postSalesApi } from './postSalesApi.js';
import { dmGovernanceApi } from './dmGovernanceApi.js';

function snip(s, n = 120) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export async function buildHiringAskContext() {
  const [reqs, health] = await Promise.all([
    hiringApi.listRequisitions().catch(() => []),
    hiringApi.health().catch(() => ({})),
  ]);
  const list = Array.isArray(reqs) ? reqs : reqs?.items || reqs?.requisitions || [];
  const byStatus = {};
  const hotItems = [];
  for (const r of list) {
    const st = String(r.status || r.stage || 'unknown');
    byStatus[st] = (byStatus[st] || 0) + 1;
    if (/open|active|sourcing|interview|offer|hold|stuck|draft/i.test(st) || r.blocked) {
      hotItems.push({
        id: r.id || r._id,
        title: r.title || r.role || r.position || 'Requisition',
        status: st,
        detail: snip(r.department || r.location || r.notes || ''),
        href: r.id || r._id ? `/app/hiring/req/${r.id || r._id}` : '/app/hiring',
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    app: 'hiring',
    totals: { requisitions: list.length, byStatus, sourcingMode: health?.sourcingMode || 'unknown' },
    hotItems: hotItems.slice(0, 25),
  };
}

export async function buildPostSalesAskContext() {
  let dash = null;
  try {
    dash = await postSalesApi.dashboard({});
  } catch {
    dash = null;
  }
  const totals = dash?.totals || dash?.summary || dash || {};
  const hotItems = [];
  const pools = [
    ...(dash?.blockedUnits || []),
    ...(dash?.overdueSteps || []),
    ...(dash?.attention || []),
    ...(dash?.unitsAtRisk || []),
  ];
  for (const u of pools.slice(0, 30)) {
    hotItems.push({
      id: u.id || u._id || u.unitId,
      title: u.unitNo || u.unit || u.name || 'Unit',
      detail: snip(u.step || u.status || u.reason || u.projectName || ''),
      href: u.id || u._id ? `/app/post-sales/units/${u.id || u._id}` : '/app/post-sales',
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    app: 'post_sales',
    totals: typeof totals === 'object' ? totals : { raw: totals },
    hotItems,
    dashboardKeys: dash ? Object.keys(dash).slice(0, 40) : [],
  };
}

export async function buildDmAskContext() {
  const meta = await dmGovernanceApi.meta().catch(() => null);
  const hotItems = [];
  // Pull a few list endpoints when available — ignore failures.
  const tries = await Promise.allSettled([
    dmGovernanceApi.listAlerts?.().catch(() => null),
    dmGovernanceApi.listRisks?.().catch(() => null),
    dmGovernanceApi.listInvoices?.({ status: 'pending' }).catch(() => null),
  ]);
  for (const t of tries) {
    if (t.status !== 'fulfilled' || !t.value) continue;
    const arr = Array.isArray(t.value) ? t.value : t.value?.items || t.value?.rows || [];
    for (const e of arr.slice(0, 10)) {
      hotItems.push({
        title: e.title || e.name || e.number || e.code || 'Item',
        detail: snip(e.detail || e.message || e.status || e.pillar || ''),
        href: '/app/dm-governance',
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    app: 'dm_spv_governance',
    totals: { tabs: meta?.tabs?.length || 0, hotCount: hotItems.length },
    hotItems: hotItems.slice(0, 25),
    meta: meta ? { tabs: meta.tabs } : null,
  };
}

export function buildPlannerAskContext(appId, title) {
  const keys =
    appId === 'v2_resource_planner'
      ? ['ga_rp_state_v1', 'ga_rp_projects', 'ga_jd_data']
      : ['ga_planner_state_v1', 'ga_rp_projects', 'ga_v3_cf_sync'];
  const bag = {};
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      bag[k] = summarizeUnknown(parsed);
    } catch {
      bag[k] = { present: true, parseError: true };
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    app: appId,
    label: title,
    totals: { keysLoaded: Object.keys(bag).length },
    storage: bag,
    hotItems: Object.keys(bag).map((k) => ({ title: k, detail: 'Planner localStorage snapshot summarized' })),
  };
}

function summarizeUnknown(v, depth = 0) {
  if (v == null) return v;
  if (typeof v !== 'object') return v;
  if (depth > 2) return Array.isArray(v) ? `[${v.length} items]` : '{…}';
  if (Array.isArray(v)) {
    return {
      count: v.length,
      sample: v.slice(0, 5).map((x) => summarizeUnknown(x, depth + 1)),
    };
  }
  const out = {};
  for (const [k, val] of Object.entries(v).slice(0, 40)) {
    if (Array.isArray(val)) out[k] = { count: val.length };
    else if (val && typeof val === 'object') out[k] = summarizeUnknown(val, depth + 1);
    else out[k] = val;
  }
  return out;
}

export async function buildVaultHubAskContext(allowedApps = []) {
  return {
    generatedAt: new Date().toISOString(),
    app: 'vault',
    totals: { allowedApps: allowedApps.length },
    allowedApps,
    hotItems: allowedApps.map((id) => ({
      title: id,
      detail: 'User has access — open app Ask AI for deeper context',
      href: id === 'hiring' ? '/app/hiring' : id === 'post_sales' ? '/app/post-sales' : id === 'dm_spv_governance' ? '/app/dm-governance' : '/',
    })),
    note: 'Cross-app hub context. For deep analytics open Ask AI inside each app.',
  };
}
