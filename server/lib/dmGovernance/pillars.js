/** Six business-health pillars — maps control-tower categories to executive view. */

export const PILLAR_DEFS = [
  { key: 'commercial', label: 'Commercial', hint: 'GDV, collections, bookings' },
  { key: 'delivery', label: 'Delivery', hint: 'Construction %, milestones, SPI' },
  { key: 'financial', label: 'Financial', hint: 'Cash, DM recovery, receivables' },
  { key: 'people_cost', label: 'People & cost', hint: 'Allocation, loaded cost' },
  { key: 'governance', label: 'Governance', hint: 'SPV, DMA, invoices, cap' },
  { key: 'customer', label: 'Customer', hint: 'Post-sales, demands, loans' }
];

export const CATEGORY_TO_PILLAR = {
  sales: 'commercial',
  collections: 'commercial',
  planning: 'commercial',
  construction: 'delivery',
  integration: 'delivery',
  billing: 'financial',
  resources: 'people_cost',
  governance: 'governance',
  compliance: 'governance',
  customer: 'customer'
};

export const APP_HUMAN_LABELS = {
  v1_cashflow: 'Cashflow V1',
  v2_resource_planner: 'Resource Planner V2',
  v3_org_planner: 'V3 Acquisition',
  preconstruction: 'PreConstruction',
  ga_execution_dashboard: 'Construction Execution',
  sales_dashboard: 'Sales Dashboard',
  marketing_kpi: 'Marketing KPI',
  finance_kpi: 'Finance KPI',
  post_sales: 'Post Sales'
};

function statusFromScore(score) {
  if (score >= 80) return 'green';
  if (score >= 55) return 'amber';
  return 'red';
}

/**
 * Roll domain penalties + issues into 6 pillar scores.
 * @param {Record<string, number>} domainPenalty
 * @param {object[]} issues
 */
export function rollupPillars(domainPenalty, issues = []) {
  const penalty = {};
  PILLAR_DEFS.forEach((p) => {
    penalty[p.key] = 0;
  });

  Object.entries(domainPenalty || {}).forEach(([cat, pen]) => {
    const pillar = CATEGORY_TO_PILLAR[cat];
    if (pillar) penalty[pillar] = (penalty[pillar] || 0) + (pen || 0);
  });

  const pillars = {};
  PILLAR_DEFS.forEach(({ key, label, hint }) => {
    const p = Math.min(80, penalty[key] || 0);
    const score = Math.max(0, 100 - p);
    pillars[key] = {
      key,
      label,
      hint,
      score,
      status: statusFromScore(score),
      issueCount: issues.filter((i) => CATEGORY_TO_PILLAR[i.category] === key).length
    };
  });
  return pillars;
}

/**
 * Per-project pillar strip from filtered issues.
 * @param {string} projectId
 * @param {object[]} issues
 */
export function rollupProjectPillars(projectId, issues = []) {
  const projectIssues = issues.filter((i) => i.projectId === projectId);
  const penalty = {};
  PILLAR_DEFS.forEach((p) => {
    penalty[p.key] = 0;
  });

  const weights = { critical: 40, high: 25, medium: 12, low: 5 };
  projectIssues.forEach((i) => {
    const pillar = CATEGORY_TO_PILLAR[i.category];
    if (pillar) penalty[pillar] = (penalty[pillar] || 0) + (weights[i.severity] || 10);
  });

  return rollupPillars(penalty, projectIssues);
}

/**
 * Sync freshness from dm_projects.integrationSnapshot.
 * @param {object} project
 */
export function buildSyncFreshness(project) {
  const snap = project?.integrationSnapshot || {};
  const apps = [
    { key: 'v1_cashflow', label: 'Cashflow V1', at: snap.cashflow?.syncedAt },
    { key: 'v2_resource_planner', label: 'Resource V2', at: snap.resourceV2?.syncedAt },
    { key: 'ga_execution_dashboard', label: 'Execution', at: snap.execution?.syncedAt },
    { key: 'preconstruction', label: 'PreConstruction', at: snap.preconstruction?.syncedAt },
    { key: 'post_sales', label: 'Post Sales', at: snap.postSales?.syncedAt }
  ];
  const now = Date.now();
  return apps.map((a) => {
    const t = a.at ? new Date(a.at).getTime() : NaN;
    const days = Number.isFinite(t) ? Math.floor((now - t) / (24 * 3600 * 1000)) : null;
    let status = 'unknown';
    if (days === null) status = 'never';
    else if (days <= 7) status = 'fresh';
    else if (days <= 14) status = 'stale';
    else status = 'old';
    return { ...a, syncedAt: a.at || null, daysAgo: days, status };
  });
}
