/** Suggested vault doc type per CLP checklist line (Step 12). */
export function docTypeForChecklistItem(itemText = '', index = 0) {
  const s = String(itemText).toLowerCase();
  if (s.includes('demand letter')) return 'demand_letter_clp';
  if (s.includes('architect certificate')) return 'architect_certificate';
  if (s.includes('payment receipt') || s.includes('receipt')) return 'payment_receipt';
  return 'supporting_document';
}

export function docKey(doc) {
  return [
    doc._id,
    doc.docType,
    doc.clpLetterTaskId || '',
    doc.checklistIndex ?? '',
    doc.stepNumber ?? '',
  ].join('|');
}
