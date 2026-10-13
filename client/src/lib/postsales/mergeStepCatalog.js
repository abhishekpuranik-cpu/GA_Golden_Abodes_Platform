import { STEPS } from '../../data/postsales/steps.js';

/** Merge Mongo activity catalog SLA fields onto static SOP step defs (checklists, etc.). */
export function mergeStepsWithCatalog(catalogSteps = []) {
  if (!catalogSteps?.length) return STEPS;
  const byNum = Object.fromEntries(catalogSteps.map((a) => [a.number, a]));
  return STEPS.map((base) => {
    const a = byNum[base.number];
    if (!a) return base;
    return {
      ...base,
      ...a,
      number: base.number,
      blockedBy: a.blockedBy?.length ? a.blockedBy : base.blockedBy,
      checklist: a.checklist?.length ? a.checklist : base.checklist,
      homeLoanChecklist: a.homeLoanChecklist?.length ? a.homeLoanChecklist : base.homeLoanChecklist,
      selfFundedChecklist: a.selfFundedChecklist?.length ? a.selfFundedChecklist : base.selfFundedChecklist,
    };
  });
}

export function formatSlaSummary(step) {
  if (!step) return '—';
  if (step.slaDays != null && step.slaDays !== '') {
    return `${step.slaDays} ${step.slaUnit || 'days'}`;
  }
  if (step.slaAck != null) {
    return `Ack ${step.slaAck}d · Resolve ${step.slaResolution ?? '—'}d`;
  }
  return 'Per SOP';
}
