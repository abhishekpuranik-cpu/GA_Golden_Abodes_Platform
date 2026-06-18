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

export const STEP_TASK_KIND = {
  1: 'backend',
  2: 'backend',
  3: 'cx',
  4: 'cx',
  5: 'cx',
  6: 'backend',
  7: 'cx',
  8: 'cx',
  9: 'cx',
  10: 'backend',
  11: 'cx',
  12: 'backend',
  13: 'cx',
  14: 'cx',
  15: 'cx',
  16: 'backend',
  17: 'backend',
  18: 'backend',
  19: 'backend',
  20: 'cx',
};

export function getStepTaskKind(stepNumber) {
  return STEP_TASK_KIND[Number(stepNumber)] || 'cx';
}

export function defaultAssigneeForKind(unit, taskKind) {
  if (!unit) return '';
  if (taskKind === 'backend') return unit.backendExecutive || unit.crmExecutive || '';
  return unit.cxExecutive || unit.crmExecutive || '';
}
