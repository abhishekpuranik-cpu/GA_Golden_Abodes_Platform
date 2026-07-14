/** Client mirror of server APP_CALENDAR_COLORS — one hue per app. */
export const APP_CALENDAR_COLORS = {
  dm_spv_governance: '#0f766e',
  post_sales: '#1d4ed8',
  v1_cashflow: '#15803d',
  v2_resource_planner: '#6366f1',
  v3_org_planner: '#4338ca',
  preconstruction: '#ea580c',
  finance_kpi: '#0284c7',
  marketing_kpi: '#db2777',
  hiring: '#9333ea',
  ga_execution_dashboard: '#ca8a04',
  sales_dashboard: '#14b8a6',
  execution: '#ca8a04'
};

export function appCalendarColor(appKey) {
  return APP_CALENDAR_COLORS[appKey] || '#64748b';
}
