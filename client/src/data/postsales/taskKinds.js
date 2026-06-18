/** Pipeline step workstream — customer-facing (CX) vs internal coordination (backend). */
export const TASK_KINDS = {
  cx: {
    id: 'cx',
    label: 'Customer interaction (CX)',
    shortLabel: 'CX',
    color: '#993556',
    roleHint: 'CX Executive (A2)',
  },
  backend: {
    id: 'backend',
    label: 'Backend / coordination',
    shortLabel: 'Backend',
    color: '#534AB7',
    roleHint: 'Backend CRM ops',
  },
};

/** Step number → task kind (aligned with GA Post-Sales SOP / A2 kit). */
export const STEP_TASK_KIND = {
  1: 'backend',  // Sales → CRM handoff
  2: 'backend',  // CRM data entry
  3: 'cx',       // Welcome call / email
  4: 'cx',       // Loan / self-funded — customer POC
  5: 'cx',       // KYC collection from customer
  6: 'backend',  // Agreement draft — advocate / internal
  7: 'cx',       // Own contribution comms to customer
  8: 'cx',       // Agreement execution with customer
  9: 'cx',       // Registered copy + TDS guidance
  10: 'backend', // Disbursement package to bank
  11: 'cx',      // Disbursement follow-up + customer queries
  12: 'backend', // CLP demand (CRM-led)
  13: 'cx',      // Queries & grievances
  14: 'cx',      // Possession handover
  15: 'cx',      // Property tax assistance
  16: 'backend', // CHS formation
  17: 'backend', // CHS registration
  18: 'backend', // Maintenance transfer
  19: 'backend', // Helpdesk setup
  20: 'cx',      // DLP / defects
};

export function getStepTaskKind(stepNumber) {
  return STEP_TASK_KIND[Number(stepNumber)] || 'cx';
}

export function defaultAssigneeForKind(unit, taskKind) {
  if (!unit) return '';
  if (taskKind === 'backend') return unit.backendExecutive || unit.crmExecutive || '';
  return unit.cxExecutive || unit.crmExecutive || '';
}
