/** Shared Excel (XLSX) + simple text PDF exports for Admin Services. */
import XLSX from 'xlsx';

export function sendXlsx(res, filename, sheets) {
  const wb = XLSX.utils.book_new();
  (sheets || []).forEach((sheet) => {
    const name = String(sheet.name || 'Sheet1').slice(0, 31);
    const aoa = sheet.aoa || [];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name || 'Sheet1');
  });
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const safe = String(filename || 'export.xlsx').replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  res.send(buf);
}

function pdfEscape(text) {
  return String(text ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Minimal multi-page text PDF (no external PDF deps).
 * @param {{ title?: string, lines?: string[], filename?: string }} opts
 */
export function sendSimplePdf(res, opts = {}) {
  const title = String(opts.title || 'Travel Expenses export');
  const lines = Array.isArray(opts.lines) ? opts.lines.map((l) => String(l ?? '')) : [];
  const maxWidth = 90;
  const wrapped = [];
  lines.forEach((line) => {
    if (line.length <= maxWidth) {
      wrapped.push(line);
      return;
    }
    let rest = line;
    while (rest.length > maxWidth) {
      wrapped.push(rest.slice(0, maxWidth));
      rest = rest.slice(maxWidth);
    }
    if (rest) wrapped.push(rest);
  });

  const pageSize = 54;
  const pages = [];
  for (let i = 0; i < Math.max(1, wrapped.length); i += pageSize) {
    pages.push(wrapped.slice(i, i + pageSize));
  }
  if (!pages.length) pages.push([]);

  const objects = [];
  const add = (s) => {
    objects.push(s);
    return objects.length;
  };

  add('<< /Type /Catalog /Pages 2 0 R >>');
  const kids = [];
  const pageIds = [];
  const contentIds = [];

  pages.forEach((pageLines, pi) => {
    const contentId = 3 + pi * 2 + 1;
    const pageId = 3 + pi * 2;
    pageIds.push(pageId);
    contentIds.push(contentId);
    kids.push(`${pageId} 0 R`);
  });

  // Rebuild with correct object numbering: 1=catalog, 2=pages, then pairs page/content
  objects.length = 0;
  add('<< /Type /Catalog /Pages 2 0 R >>');
  const pageObjNums = [];
  const contentObjNums = [];
  for (let i = 0; i < pages.length; i++) {
    pageObjNums.push(3 + i * 2);
    contentObjNums.push(4 + i * 2);
  }
  add(`<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>`);

  pages.forEach((pageLines, i) => {
    const contentNum = contentObjNums[i];
    const pageNum = pageObjNums[i];
    void pageNum;
    const yStart = 800;
    const header = `BT /F1 11 Tf 40 ${yStart} Td (${pdfEscape(title)} — page ${i + 1}/${pages.length}) Tj ET`;
    const body = pageLines
      .map((line, li) => {
        const y = yStart - 28 - li * 14;
        return `BT /F1 9 Tf 40 ${y} Td (${pdfEscape(line)}) Tj ET`;
      })
      .join('\n');
    const stream = `${header}\n${body}`;
    add(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents ${contentNum} 0 R /Resources << /Font << /F1 ${2 + pages.length * 2 + 1} 0 R >> >> >>`
    );
    add(`<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`);
  });

  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  // Fix page Resources font refs to fontId
  for (let i = 0; i < pages.length; i++) {
    const idx = pageObjNums[i] - 1;
    objects[idx] = objects[idx].replace(
      /\/F1 \d+ 0 R/,
      `/F1 ${fontId} 0 R`
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const safe = String(opts.filename || 'export.pdf').replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  res.send(Buffer.from(pdf, 'utf8'));
}

export function rowsToAoa(headers, rows) {
  return [headers, ...(rows || []).map((r) => headers.map((h) => (r[h] != null ? r[h] : '')))];
}

export function aoaToPdfLines(aoa, maxCols = 8) {
  const lines = [];
  (aoa || []).forEach((row, i) => {
    const cells = (row || []).slice(0, maxCols).map((c) => String(c ?? '').slice(0, 28));
    lines.push(cells.join(' | '));
    if (i === 0) lines.push('-'.repeat(Math.min(100, lines[0].length)));
  });
  return lines;
}
