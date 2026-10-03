// Shared reading of payment rows (tasks with type 'reimbursement'), used by
// Admin's lists and its payment report.

// Who gets the money. A reimbursement names the person being paid back
// (assigned_to); there the vendor is only where it was bought. Otherwise the
// vendor is the payee, as on an invoice.
export function payeeName(r) {
  return r.recipient?.name || r.vendor?.name || r.creator?.name || null;
}

// Payments' Invoices tab titles its rows "Invoice: …"; everything else is a
// reimbursement (the Reimburse tab, the Tasks shopping list, older requests).
export function paymentKind(r) {
  return /^Invoice:/i.test(r.title || '') ? 'Invoice' : 'Reimbursement';
}

// The value of a "Label: value" line in the description, or null
export function descriptionLine(description, label) {
  const m = (description || '').match(new RegExp(`^${label}:\\s*(.+)$`, 'mi'));
  return m ? m[1].trim() : null;
}

// Date billed (invoices) or date of service/purchase (reimbursements), YYYY-MM-DD
export function serviceDate(r) {
  return descriptionLine(r.description, 'Date billed')
    || descriptionLine(r.description, 'Date of service or purchase');
}
