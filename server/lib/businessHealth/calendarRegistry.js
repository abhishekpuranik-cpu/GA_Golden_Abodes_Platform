import { APP_HUMAN_LABELS } from '../dmGovernance/pillars.js';

/** Registry of calendar sources — extend when new apps ship date-based workflows. */
export const CALENDAR_SOURCE_DEFS = [
  { key: 'dm_spv_governance', label: 'DM & Billing', pillar: 'governance', color: '#0d9488', types: ['invoice_due', 'billing_cycle', 'project_date'] },
  { key: 'post_sales', label: 'Post Sales', pillar: 'customer', color: '#2563eb', types: ['task_due', 'task_followup', 'demand_due', 'clp_letter'] },
  { key: 'v1_cashflow', label: 'Cashflow V1', pillar: 'delivery', color: '#059669', types: ['construction_milestone'] },
  { key: 'preconstruction', label: 'PreConstruction', pillar: 'delivery', color: '#7c3aed', types: ['approval_task'] },
  { key: 'finance_kpi', label: 'Finance KPI', pillar: 'governance', color: '#0891b2', types: ['compliance_filing', 'vendor_payment'] },
  { key: 'marketing_kpi', label: 'Marketing KPI', pillar: 'commercial', color: '#ea580c', types: ['lead_followup', 'site_visit'] },
  { key: 'hiring', label: 'Hiring', pillar: 'people_cost', color: '#9333ea', types: ['interview'] },
  { key: 'ga_execution_dashboard', label: 'Execution', pillar: 'delivery', color: '#ca8a04', types: ['roadmap_milestone'] }
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
  return CALENDAR_SOURCE_DEFS.find((s) => s.key === key) || {
    key,
    label: APP_HUMAN_LABELS[key] || key,
    pillar: 'governance',
    color: '#64748b',
    types: []
  };
}

export function sourceColor(key) {
  return sourceDef(key).color;
}
