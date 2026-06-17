/** Document types expected per pipeline step — shared by pipeline upload and Documents vault. */
export const DOC_GROUPS = [
  { label: 'Booking (Step 1)', step: 1, types: ['booking_form', 'cost_sheet', 'payment_receipt'] },
  { label: 'KYC (Steps 1, 5)', step: 5, types: ['pan_card', 'aadhaar_card', 'photograph', 'address_proof', 'marital_proof'] },
  { label: 'Loan (Step 4)', step: 4, types: ['loan_application', 'approved_plan', 'rera_certificate', 'loan_sanction_letter', 'allotment_letter'] },
  { label: 'Agreement (Steps 6, 8)', step: 6, types: ['agreement_draft', 'registered_agreement', 'self_declaration'] },
  { label: 'TDS (Step 9)', step: 9, types: ['form_26QB', 'form_16B', 'tds_challan'] },
  { label: 'Disbursement (Steps 10, 11)', step: 10, types: ['noc', 'handover_letter'] },
  { label: 'Demand (Step 12)', step: 12, types: ['demand_letter_clp', 'architect_certificate'] },
  { label: 'Possession (Steps 14, 15)', step: 14, types: ['oc_cc', 'possession_checklist', 'possession_letter', 'possession_acknowledgement', 'index_ii'] },
  { label: 'CHS (Steps 16–18)', step: 16, types: ['chs_application', 'chs_registration_cert', 'society_bank_account_details', 'maintenance_reconciliation_stmt'] },
];

export const TYPE_LABELS = Object.fromEntries(
  DOC_GROUPS.flatMap((g) => g.types.map((t) => [t, t.replace(/_/g, ' ')]))
);

/** Map step number → document types expected at that step (may span adjacent steps). */
export const STEP_DOC_TYPES = DOC_GROUPS.reduce((acc, g) => {
  for (const t of g.types) {
    if (!acc[g.step]) acc[g.step] = [];
    if (!acc[g.step].includes(t)) acc[g.step].push(t);
  }
  return acc;
}, {});

export function docTypesForStep(stepNumber) {
  const n = Number(stepNumber);
  const types = [];
  for (const g of DOC_GROUPS) {
    if (g.step === n) types.push(...g.types);
  }
  return [...new Set(types)];
}

export function primaryStepForDocType(docType) {
  const group = DOC_GROUPS.find((g) => g.types.includes(docType));
  return group?.step;
}
