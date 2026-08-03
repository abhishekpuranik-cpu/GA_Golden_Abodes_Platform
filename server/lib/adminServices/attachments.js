/**
 * Thin attachment service for Admin Services.
 * No Google Drive SDK in platform yet — accepts a Drive file id string (or interim local meta).
 * Do not invent a second upload path; callers pass receiptDriveFileId from the vault Drive flow when available.
 */

export function assertReceiptId(fileId, { required = false } = {}) {
  const id = fileId == null ? '' : String(fileId).trim();
  if (!id) {
    if (required) {
      const err = new Error('receiptDriveFileId is required');
      err.status = 400;
      throw err;
    }
    return null;
  }
  return id;
}

/**
 * Validate ancillary line against policy receipt threshold.
 */
export function validateAncillaryReceipts(ancillary, requireAbovePaise) {
  const threshold = Number(requireAbovePaise) || 0;
  const list = Array.isArray(ancillary) ? ancillary : [];
  for (const row of list) {
    const amt = Number(row.amountPaise) || 0;
    if (amt > threshold && !String(row.receiptDriveFileId || '').trim()) {
      const err = new Error(
        `Ancillary ${row.type || 'item'} of ${amt} paise requires receiptDriveFileId (threshold ${threshold})`
      );
      err.status = 400;
      err.code = 'RECEIPT_REQUIRED';
      throw err;
    }
  }
  return list;
}
