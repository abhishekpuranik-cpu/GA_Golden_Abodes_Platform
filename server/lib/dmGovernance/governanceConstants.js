/** Default compliance documents per SPV/project. */
export const COMPLIANCE_DOC_TYPES = [
  { id: 'dma', name: 'Development Management Agreement', required: true },
  { id: 'ssa', name: 'Shared Services Agreement', required: true },
  { id: 'hr_support', name: 'HR Administration Support Agreement', required: true },
  { id: 'brand', name: 'Brand Usage Agreement', required: false },
  { id: 'authority_matrix', name: 'Authority Matrix', required: true },
  { id: 'delegation', name: 'Delegation of Powers', required: true },
  { id: 'payroll_matrix', name: 'Payroll Responsibility Matrix', required: true },
  { id: 'billing_policy', name: 'Billing and Reconciliation Policy', required: true },
  { id: 'cost_allocation', name: 'Cost Allocation Policy', required: true },
  { id: 'rp_approval', name: 'Related Party Transaction Approval', required: true },
  { id: 'board_note', name: 'Board / Partner Approval Note', required: true },
  { id: 'annual_recon', name: 'Annual Reconciliation Approval', required: false }
];

export const EXPENSE_CATEGORIES = [
  'direct_project',
  'consultant_coordination',
  'approval_support',
  'design_coordination',
  'project_travel',
  'site_administration',
  'sales_readiness',
  'marketing_readiness',
  'legal_compliance',
  'misc_governance',
  'third_party_ga_paid',
  'shared_service_allocation'
];

export const EXPENSE_STATUSES = ['draft', 'pending_approval', 'approved', 'rejected', 'billed'];

export const RECON_STATUSES = ['draft', 'pending_approval', 'locked'];

export const BILLING_TRIGGER_TYPES = [
  'collection_threshold',
  'revenue_status_change',
  'construction_milestone',
  'monthly_billing_due',
  'annual_recon_due',
  'compliance_gap',
  'cap_threshold'
];

export const RISK_SEVERITIES = ['low', 'medium', 'high', 'critical'];
