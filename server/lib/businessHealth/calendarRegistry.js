import { APP_HUMAN_LABELS } from '../dmGovernance/pillars.js';

/** One distinct brand color per vault / platform app (calendar + filters). */
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
  sales_dashboard: '#14b8a6'
};

/** Registry of calendar sources — extend when new apps ship date-based workflows. */
export const CALENDAR_SOURCE_DEFS = [
  {
    key: 'dm_spv_governance',
    label: 'DM & Billing',
    pillar: 'governance',
    color: APP_CALENDAR_COLORS.dm_spv_governance,
    types: ['invoice_due', 'billing_cycle', 'project_date']
  },
  {
    key: 'post_sales',
    label: 'Post Sales',
    pillar: 'customer',
    color: APP_CALENDAR_COLORS.post_sales,
    types: ['task_due', 'task_followup', 'demand_due', 'clp_letter']
  },
  {
    key: 'v1_cashflow',
    label: 'Cashflow V1',
    pillar: 'delivery',
    color: APP_CALENDAR_COLORS.v1_cashflow,
    types: ['construction_milestone']
  },
  {
    key: 'v2_resource_planner',
    label: 'Resource V2',
    pillar: 'people_cost',
    color: APP_CALENDAR_COLORS.v2_resource_planner,
    types: []
  },
  {
    key: 'v3_org_planner',
    label: 'V3 Acquisition',
    pillar: 'commercial',
    color: APP_CALENDAR_COLORS.v3_org_planner,
    types: []
  },
  {
    key: 'preconstruction',
    label: 'PreConstruction',
    pillar: 'delivery',
    color: APP_CALENDAR_COLORS.preconstruction,
    types: ['approval_task']
  },
  {
    key: 'finance_kpi',
    label: 'Finance KPI',
    pillar: 'governance',
    color: APP_CALENDAR_COLORS.finance_kpi,
    types: ['compliance_filing', 'vendor_payment']
  },
  {
    key: 'marketing_kpi',
    label: 'Marketing KPI',
    pillar: 'commercial',
    color: APP_CALENDAR_COLORS.marketing_kpi,
    types: ['lead_followup', 'site_visit']
  },
  {
    key: 'hiring',
    label: 'Hiring',
    pillar: 'people_cost',
    color: APP_CALENDAR_COLORS.hiring,
    types: ['interview']
  },
  {
    key: 'ga_execution_dashboard',
    label: 'Execution',
    pillar: 'delivery',
    color: APP_CALENDAR_COLORS.ga_execution_dashboard,
    types: ['roadmap_milestone']
  },
  {
    key: 'sales_dashboard',
    label: 'Sales Dashboard',
    pillar: 'commercial',
    color: APP_CALENDAR_COLORS.sales_dashboard,
    types: []
  }
];

export const CALENDAR_TYPE_LABELS = {
  invoice_due: 'Invoice due',
  billing_cycle: 'Billing cycle',
  project_date: 'Project milestone',
  task_due: 'CX/Backend task',
  task_followup: 'Task follow-up',
  demand_due: 'Demand due',
  clp_letter: 'CLP letter',
  construction_milestone: 'Construction milestone',
  approval_task: 'PreCon approval',
  compliance_filing: 'Statutory filing',
  vendor_payment: 'Vendor payment',
  lead_followup: 'Lead follow-up',
  site_visit: 'Site visit',
  interview: 'Interview',
  roadmap_milestone: 'Execution roadmap'
};

export function sourceDef(key) {
  return (
    CALENDAR_SOURCE_DEFS.find((s) => s.key === key) || {
      key,
      label: APP_HUMAN_LABELS[key] || key,
      pillar: 'governance',
      color: APP_CALENDAR_COLORS[key] || '#64748b',
      types: []
    }
  );
}

export function sourceColor(key) {
  return sourceDef(key).color;
}
