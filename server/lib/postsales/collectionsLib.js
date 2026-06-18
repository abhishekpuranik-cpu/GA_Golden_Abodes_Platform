/** Shared CLP / collections helpers — Post Sales master, Cashflow V1 consumer. */

export function installmentBaseLabel(label) {
  return String(label || '')
    .replace(/\s*\(due\)\s*$/i, '')
    .replace(/\s*\(received\)\s*$/i, '')
    .replace(/\s*\(pending\)\s*$/i, '')
    .trim();
}

export function groupUnitInstallments(unit) {
  const acc = {};
  for (const ins of unit?.installments || []) {
    const L = String(ins.label || '');
    const base = installmentBaseLabel(L);
    if (!base) continue;
    const typ = L.includes('(received)') ? 'r' : L.includes('(pending)') ? 'p' : L.includes('(due)') ? 'd' : 'u';
    if (!acc[base]) acc[base] = { base, due: 0, recv: 0, pendExplicit: false, pendSum: 0, dueIso: '' };
    const g = acc[base];
    const amt = Number(ins.amount) || 0;
    if (typ === 'd') {
      g.due += amt;
      if (ins.date) g.dueIso = String(ins.date).slice(0, 10);
    } else if (typ === 'r') {
      g.recv += amt;
      if (ins.date && !g.dueIso) g.dueIso = String(ins.date).slice(0, 10);
    } else if (typ === 'p') {
      g.pendExplicit = true;
      g.pendSum += amt;
    } else if (typ === 'u') {
      g.due += amt;
      if (ins.date) g.dueIso = String(ins.date).slice(0, 10);
    }
  }
  return Object.values(acc).map((g) => ({
    milestoneName: g.base,
    dueAmount: g.due,
    receivedAmount: g.recv,
    pendingAmount: g.pendExplicit ? g.pendSum : Math.max(0, g.due - g.recv),
    dueDate: g.dueIso || undefined,
  }));
}

export function demandToInstallments(demand) {
  const base = demand.milestoneName || 'CLP milestone';
  const due = Number(demand.demandAmount ?? demand.dueAmount ?? demand.totalAmount) || 0;
  const recv = Number(demand.paidAmount ?? demand.receivedAmount) || 0;
  const pend = Math.max(0, (Number(demand.totalAmount) || due) - recv);
  const dueDate = demand.dueDate ? String(demand.dueDate).slice(0, 10) : '';
  const paidDate = demand.paidDate ? String(demand.paidDate).slice(0, 10) : dueDate;
  const rows = [];
  if (due > 0 || demand.totalAmount) {
    rows.push({ label: `${base} (due)`, amount: Number(demand.totalAmount) || due, date: dueDate });
  }
  if (recv > 0) rows.push({ label: `${base} (received)`, amount: recv, date: paidDate });
  if (pend > 0) rows.push({ label: `${base} (pending)`, amount: pend, date: dueDate });
  return rows;
}

export function paymentStatusFromAmounts(totalAmount, paidAmount) {
  const total = Number(totalAmount) || 0;
  const paid = Number(paidAmount) || 0;
  if (total > 0 && paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  return 'pending';
}

export function normalizeImportRow(row) {
  const project = String(row.project || row.Project || '').trim();
  const unitNumber = String(row.unitNumber || row.unit || row.Unit || row['Unit No'] || '').trim();
  const milestoneName = String(row.milestoneName || row.milestone || row.Milestone || row['Milestone Name'] || 'Collections').trim();
  const dueAmount = Number(row.dueAmount ?? row.due ?? row.Due ?? row['Amount Due'] ?? row.totalAmount ?? 0);
  const receivedAmount = Number(row.receivedAmount ?? row.received ?? row.Received ?? row['Amount Received'] ?? row.paidAmount ?? 0);
  let pendingAmount = Number(row.pendingAmount ?? row.pending ?? row.Pending ?? row['Amount Pending']);
  if (!Number.isFinite(pendingAmount)) pendingAmount = Math.max(0, dueAmount - receivedAmount);
  const clpPercent = Number(row.clpPercent ?? row.clp ?? row['CLP %'] ?? row['CLP%']) || undefined;
  const dueDate = row.dueDate || row['Due Date'] || row.date || undefined;
  const gstAmount = Number(row.gstAmount ?? row.gst ?? 0);
  const totalAmount = Number(row.totalAmount ?? (dueAmount + (gstAmount || Math.round(dueAmount * 0.05))));
  return {
    project,
    unitNumber,
    milestoneName,
    dueAmount,
    receivedAmount,
    pendingAmount,
    clpPercent,
    dueDate,
    gstAmount: gstAmount || Math.round(dueAmount * 0.05),
    totalAmount,
  };
}
