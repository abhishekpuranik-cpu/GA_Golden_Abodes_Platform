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

export const DM_NAV = [
  { id: DM_TABS.BUSINESS_HEALTH, path: '/app/dm-governance', label: 'Business Health', end: true },
  { id: DM_TABS.EXECUTIVE, path: '/app/dm-governance/executive', label: 'Executive' },
  { id: DM_TABS.SPVS, path: '/app/dm-governance/spvs', label: 'SPV Master' },
  { id: DM_TABS.PROJECTS, path: '/app/dm-governance/projects', label: 'Projects' },
  { id: DM_TABS.BILLING, path: '/app/dm-governance/billing-workspace', label: 'Billing Workspace' },
  { id: 'dm_billing_config', path: '/app/dm-governance/billing', label: 'Billing Models' },
  { id: DM_TABS.INVOICES, path: '/app/dm-governance/invoices', label: 'Invoices' },
  { id: 'dm_approvals', path: '/app/dm-governance/approvals', label: 'Approvals' },
  { id: DM_TABS.COMPLIANCE, path: '/app/dm-governance/compliance', label: 'Compliance' },
  { id: 'dm_reconciliation', path: '/app/dm-governance/reconciliation', label: 'Annual Recon' },
  { id: 'dm_expenses', path: '/app/dm-governance/expenses', label: 'Expenses' },
  { id: 'dm_risks', path: '/app/dm-governance/risks', label: 'Risks' },
  { id: DM_TABS.SCENARIOS, path: '/app/dm-governance/scenarios', label: 'Scenarios' },
  { id: DM_TABS.ALERTS, path: '/app/dm-governance/alerts', label: 'Alerts' },
  { id: DM_TABS.REPORTS, path: '/app/dm-governance/reports', label: 'Reports' },
  { id: DM_TABS.SETTINGS, path: '/app/dm-governance/integrations', label: 'Integrations' }
];

export function userCanDmTab(user, tabId, metaTabs) {
  const tabs = metaTabs || user?.allowedTabs || [];
  const set = new Set(tabs.map((t) => String(t)));
  if (set.has('manage_security') || (user?.permissions || []).includes('manage_security')) return true;
  if (set.size === 0) return tabId !== DM_TABS.CONSOLIDATED && tabId !== DM_TABS.SETTINGS;
  if (tabId === DM_TABS.BUSINESS_HEALTH) return set.has(DM_TABS.BUSINESS_HEALTH) || set.has(DM_TABS.DASHBOARD);
  return set.has(tabId);
}
