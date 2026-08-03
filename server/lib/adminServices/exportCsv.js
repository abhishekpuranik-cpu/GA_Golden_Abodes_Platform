/** Shared CSV generator — consistent header/escaping for Admin Services exports. */

function escapeCell(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {string[]} headers
 * @param {Array<Array<any>|Record<string, any>>} rows
 * @param {{ headerKeys?: string[] }} [opts] — if rows are objects, use headerKeys
 */
export function toCsv(headers, rows, opts = {}) {
  const lines = [headers.map(escapeCell).join(',')];
  const keys = opts.headerKeys || null;
  for (const row of rows) {
    if (Array.isArray(row)) {
      lines.push(row.map(escapeCell).join(','));
    } else if (keys) {
      lines.push(keys.map((k) => escapeCell(row[k])).join(','));
    } else {
      lines.push(headers.map((h) => escapeCell(row[h])).join(','));
    }
  }
  return `${lines.join('\r\n')}\r\n`;
}

export function sendCsv(res, filename, csvBody) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvBody);
}
