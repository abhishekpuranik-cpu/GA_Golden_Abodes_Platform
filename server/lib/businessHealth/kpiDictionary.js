/** Canonical portfolio KPI definitions (~25 max). */

export const KPI_DICTIONARY = [
  {
    id: 'portfolio_health_score',
    pillar: 'governance',
    label: 'Business health score',
    formula: '100 − weighted exception penalty / projects',
    sourceApps: ['dm_spv_governance'],
    unit: 'score',
    drillDownHref: '/app/dm-governance'
  },
  {
    id: 'collections_rate',
    pillar: 'commercial',
    label: 'Collections rate',
    formula: 'Σ collections TTD ÷ Σ topline GDV',
    sourceApps: ['v1_cashflow', 'dm_spv_governance'],
    unit: 'pct',
    drillDownHref: '/legacy/GA_Cashflow_V1.html'
  },
  {
    id: 'dm_recovery_pct',
    pillar: 'financial',
    label: 'DM recovery %',
    formula: 'DM fees paid ÷ DM fees billed',
    sourceApps: ['dm_spv_governance'],
    unit: 'pct',
    drillDownHref: '/app/dm-governance/invoices'
  },
  {
    id: 'active_projects',
    pillar: 'governance',
    label: 'Active projects',
    formula: 'Count of dm_projects',
    sourceApps: ['dm_spv_governance'],
    unit: 'count',
    drillDownHref: '/app/dm-governance/projects'
  },
  {
    id: 'active_spvs',
    pillar: 'governance',
    label: 'Active SPVs',
    formula: 'Count of dm_spvs',
    sourceApps: ['dm_spv_governance'],
    unit: 'count',
    drillDownHref: '/app/dm-governance/spvs'
  },
  {
    id: 'portfolio_topline',
    pillar: 'commercial',
    label: 'Portfolio topline GDV',
    formula: 'Σ toplineGdv',
    sourceApps: ['dm_spv_governance', 'v3_org_planner'],
    unit: 'inr',
    drillDownHref: '/app/dm-governance/projects'
  },
  {
    id: 'portfolio_collections',
    pillar: 'commercial',
    label: 'Portfolio collections',
    formula: 'Σ collectionsTtd',
    sourceApps: ['v1_cashflow'],
    unit: 'inr',
    drillDownHref: '/legacy/GA_Cashflow_V1.html'
  },
  {
    id: 'dm_billed',
    pillar: 'financial',
    label: 'DM billed TTD',
    formula: 'Σ dmFeeBilledTtd',
    sourceApps: ['dm_spv_governance'],
    unit: 'inr',
    drillDownHref: '/app/dm-governance/invoices'
  },
  {
    id: 'dm_accrued',
    pillar: 'financial',
    label: 'DM accrued',
    formula: 'Billed − paid',
    sourceApps: ['dm_spv_governance'],
    unit: 'inr',
    drillDownHref: '/app/dm-governance/invoices'
  },
  {
    id: 'billing_exceptions',
    pillar: 'governance',
    label: 'Billing config gaps',
    formula: 'Projects without active billing model',
    sourceApps: ['dm_spv_governance'],
    unit: 'count',
    drillDownHref: '/app/dm-governance/billing'
  },
  {
    id: 'cross_app_exceptions',
    pillar: 'governance',
    label: 'Cross-app exceptions',
    formula: 'Count from deviation engine',
    sourceApps: ['dm_spv_governance'],
    unit: 'count',
    drillDownHref: '/app/dm-governance'
  },
  {
    id: 'post_sales_pipeline',
    pillar: 'customer',
    label: 'Post-sales active units',
    formula: 'Units in active pipeline',
    sourceApps: ['post_sales'],
    unit: 'count',
    drillDownHref: '/app/post-sales'
  }
];

export function kpiById(id) {
  return KPI_DICTIONARY.find((k) => k.id === id) || null;
}
