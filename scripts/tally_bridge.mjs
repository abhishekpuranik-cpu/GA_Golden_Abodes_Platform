#!/usr/bin/env node
/**
 * Golden Abodes — Tally Prime local bridge
 *
 * Forwards XML to Tally (default http://127.0.0.1:9000) for Cashflow live sync.
 *
 * Payment + Receipt full history (v3.4 — Cashflow is date SSOT):
 *   Tally Day Book / SVFROMDATE is unreliable (often returns only one day, e.g. FY start).
 *   Bridge therefore:
 *     1) Pull Payment + Receipt by voucher TYPE (Collection, no date trust)
 *     2) Optionally widen with FY-bounded dated Collection
 *     3) Day-walk with exact-day keep
 *     4) ALWAYS filter the merge to the Cashflow From–To (app owns the range)
 *
 *   POST /tally/export
 *   { "preset":"payment_receipt", "fromDate":"20250401", "toDate":"20260808" }
 */

import http from 'http';
import { URL } from 'url';

const TALLY_URL = process.env.TALLY_URL || 'http://127.0.0.1:9000';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '34876', 10);
/** Large type-only collections need more than 20s on busy companies. */
const TALLY_TIMEOUT_MS = Math.max(15000, parseInt(process.env.TALLY_TIMEOUT_MS || '60000', 10) || 60000);
/** Max XML shapes tried per window before declaring empty (prevents multi-minute hangs). */
const MAX_PROBES_PER_WINDOW = Math.max(3, parseInt(process.env.TALLY_MAX_PROBES || '6', 10) || 6);
const BRIDGE_VERSION = 3.4;
/** Remember last winning export shape across windows/jobs. */
let lastWinningTag = '';

/** Node rejects non-ASCII / CR/LF in header values (Invalid character in header content). */
function headerSafeJson(obj, maxLen) {
  const raw = JSON.stringify(obj == null ? {} : obj);
  return String(raw)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .slice(0, Math.max(200, maxLen || 3500));
}

function send(res, status, body, contentType) {
  res.writeHead(status, {
    'Content-Type': contentType || 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function yyyymmddToTallyDMyyyy(yyyymmdd) {
  const s = String(yyyymmdd || '');
  if (!/^\d{8}$/.test(s)) return s;
  const y = parseInt(s.slice(0, 4), 10);
  const mo = parseInt(s.slice(4, 6), 10);
  const d = parseInt(s.slice(6, 8), 10);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (mo < 1 || mo > 12) return s;
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d) + '-' + mon[mo - 1] + '-' + y;
}

function responseHasVoucherXml(text) {
  return /<VOUCHER[\s/>]/i.test(String(text || ''));
}

function staticVarsBlock(fromDd, toDd, opts, mode) {
  opts = opts || {};
  const fmt = '      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>\n';
  const explode = '      <EXPLODEFLAG>Yes</EXPLODEFLAG>\n';
  let fromLine = '      <SVFROMDATE>' + fromDd + '</SVFROMDATE>\n';
  let toLine = '      <SVTODATE>' + toDd + '</SVTODATE>\n';
  if (mode === 'typedDmy') {
    fromLine =
      '      <SVFROMDATE Type="Date">' + yyyymmddToTallyDMyyyy(fromDd) + '</SVFROMDATE>\n';
    toLine = '      <SVTODATE Type="Date">' + yyyymmddToTallyDMyyyy(toDd) + '</SVTODATE>\n';
  } else if (mode === 'typed') {
    fromLine = '      <SVFROMDATE Type="Date">' + fromDd + '</SVFROMDATE>\n';
    toLine = '      <SVTODATE Type="Date">' + toDd + '</SVTODATE>\n';
  } else if (mode === 'dmyPlain') {
    fromLine = '      <SVFROMDATE>' + yyyymmddToTallyDMyyyy(fromDd) + '</SVFROMDATE>\n';
    toLine = '      <SVTODATE>' + yyyymmddToTallyDMyyyy(toDd) + '</SVTODATE>\n';
  }
  let vars =
    mode === 'datesFirst'
      ? fromLine + toLine + fmt + explode
      : fmt + fromLine + toLine + explode;

  if (opts.voucherTypeName) {
    const vt = escapeXml(String(opts.voucherTypeName).trim());
    vars +=
      '      <VOUCHERTYPENAME Type="String">' +
      vt +
      '</VOUCHERTYPENAME>\n' +
      '      <SVVOUCHERTYPENAME Type="String">' +
      vt +
      '</SVVOUCHERTYPENAME>\n';
  }

  if (
    opts.sendCompanyToTally === true &&
    opts.currentCompany &&
    String(opts.currentCompany).trim()
  ) {
    vars +=
      '      <SVCURRENTCOMPANY>' +
      escapeXml(String(opts.currentCompany).trim()) +
      '</SVCURRENTCOMPANY>\n';
  }
  return vars;
}

function staticVarsBlockLegacyIndent(fromDd, toDd, opts, mode) {
  return staticVarsBlock(fromDd, toDd, opts, mode).replace(/^      /gm, '        ');
}

function companyStaticBlock(opts) {
  if (
    opts &&
    opts.sendCompanyToTally === true &&
    opts.currentCompany &&
    String(opts.currentCompany).trim()
  ) {
    return (
      '        <SVCURRENTCOMPANY>' +
      escapeXml(String(opts.currentCompany).trim()) +
      '</SVCURRENTCOMPANY>\n'
    );
  }
  return '';
}

/**
 * Collection export with explicit date formula — most reliable range filter on Tally Prime.
 * Day Book SVFROMDATE/SVTODATE is frequently ignored (returns only the current day).
 */
function buildVoucherCollectionDated(fromDd, toDd, voucherType, opts) {
  opts = opts || {};
  const fromDmy = yyyymmddToTallyDMyyyy(fromDd);
  const toDmy = yyyymmddToTallyDMyyyy(toDd);
  const vt = String(voucherType || '').trim();
  let formula =
    '($Date >= $$DateValue:"' + fromDmy + '") AND ($Date <= $$DateValue:"' + toDmy + '")';
  if (vt) formula = '(' + formula + ') AND ($VoucherTypeName = "' + escapeXml(vt) + '")';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<ENVELOPE>\n' +
    ' <HEADER>\n' +
    '  <VERSION>1</VERSION>\n' +
    '  <TALLYREQUEST>Export</TALLYREQUEST>\n' +
    '  <TYPE>Collection</TYPE>\n' +
    '  <ID>GA Dated Vouchers</ID>\n' +
    ' </HEADER>\n' +
    ' <BODY>\n' +
    '  <DESC>\n' +
    '   <STATICVARIABLES>\n' +
    '    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>\n' +
    companyStaticBlock(opts) +
    '   </STATICVARIABLES>\n' +
    '   <TDL>\n' +
    '    <TDLMESSAGE>\n' +
    '     <COLLECTION NAME="GA Dated Vouchers" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">\n' +
    '      <TYPE>Voucher</TYPE>\n' +
    '      <FETCH>Date, VoucherNumber, VoucherTypeName, Narration, AllLedgerEntries.*</FETCH>\n' +
    '      <FILTER>GADatedVchFilter</FILTER>\n' +
    '     </COLLECTION>\n' +
    '     <SYSTEM TYPE="Formulae" NAME="GADatedVchFilter">' +
    formula +
    '</SYSTEM>\n' +
    '    </TDLMESSAGE>\n' +
    '   </TDL>\n' +
    '  </DESC>\n' +
    ' </BODY>\n' +
    '</ENVELOPE>'
  );
}

/**
 * Type-only Collection — no date filter.
 * Cashflow/bridge then filter to From–To (SSOT). Used when Tally ignores SVFROMDATE.
 */
function buildVoucherCollectionByType(voucherType, opts) {
  opts = opts || {};
  const vt = String(voucherType || '').trim();
  const formula = vt ? '$VoucherTypeName = "' + escapeXml(vt) + '"' : '1 = 1';
  const id = vt ? 'GA ' + vt + ' Vouchers' : 'GA All Vouchers';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<ENVELOPE>\n' +
    ' <HEADER>\n' +
    '  <VERSION>1</VERSION>\n' +
    '  <TALLYREQUEST>Export</TALLYREQUEST>\n' +
    '  <TYPE>Collection</TYPE>\n' +
    '  <ID>' +
    escapeXml(id) +
    '</ID>\n' +
    ' </HEADER>\n' +
    ' <BODY>\n' +
    '  <DESC>\n' +
    '   <STATICVARIABLES>\n' +
    '    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>\n' +
    companyStaticBlock(opts) +
    '   </STATICVARIABLES>\n' +
    '   <TDL>\n' +
    '    <TDLMESSAGE>\n' +
    '     <COLLECTION NAME="' +
    escapeXml(id) +
    '" ISMODIFY="No" ISFIXED="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">\n' +
    '      <TYPE>Voucher</TYPE>\n' +
    '      <FETCH>Date, VoucherNumber, VoucherTypeName, Narration, AllLedgerEntries.*</FETCH>\n' +
    '      <FILTER>GATypeOnlyFilter</FILTER>\n' +
    '     </COLLECTION>\n' +
    '     <SYSTEM TYPE="Formulae" NAME="GATypeOnlyFilter">' +
    formula +
    '</SYSTEM>\n' +
    '    </TDLMESSAGE>\n' +
    '   </TDL>\n' +
    '  </DESC>\n' +
    ' </BODY>\n' +
    '</ENVELOPE>'
  );
}

/** Indian FY (Apr–Mar) windows that cover [fromDd, toDd]. */
function indianFyChunksCovering(fromDd, toDd) {
  const a = String(fromDd || '');
  const b = String(toDd || '');
  if (!/^\d{8}$/.test(a) || !/^\d{8}$/.test(b) || a > b) return [[a, b]];
  function fyStartFor(dd) {
    const y = parseInt(dd.slice(0, 4), 10);
    const m = parseInt(dd.slice(4, 6), 10);
    return m >= 4 ? String(y) + '0401' : String(y - 1) + '0401';
  }
  function fyEndFor(dd) {
    const y = parseInt(dd.slice(0, 4), 10);
    const m = parseInt(dd.slice(4, 6), 10);
    return m >= 4 ? String(y + 1) + '0331' : String(y) + '0331';
  }
  const out = [];
  let cur = fyStartFor(a);
  const last = fyEndFor(b);
  while (cur <= last) {
    const end = fyEndFor(cur);
    const start = cur < a ? a : cur;
    const stop = end > b ? b : end;
    // Pull whole FY then filter — better chance Tally returns mid-year vouchers
    out.push([cur, end]);
    const nextY = parseInt(cur.slice(0, 4), 10) + 1;
    cur = String(nextY) + '0401';
    if (out.length > 20) break;
  }
  return out.length ? out : [[a, b]];
}

function buildExportData(reportId, fromDd, toDd, opts, mode) {
  opts = opts || {};
  const name = reportId || 'Voucher Register';
  const m =
    mode === 'typedDmy'
      ? 'typedDmy'
      : mode === 'typed'
        ? 'typed'
        : mode === 'dmyPlain'
          ? 'dmyPlain'
          : mode === 'datesFirst'
            ? 'datesFirst'
            : 'fmtFirst';
  const vars = staticVarsBlock(fromDd, toDd, opts, m);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<ENVELOPE>\n' +
    ' <HEADER>\n' +
    '  <VERSION>1</VERSION>\n' +
    '  <TALLYREQUEST>Export Data</TALLYREQUEST>\n' +
    ' </HEADER>\n' +
    ' <BODY>\n' +
    '  <EXPORTDATA>\n' +
    '   <REQUESTDESC>\n' +
    '    <REPORTNAME>' +
    escapeXml(name) +
    '</REPORTNAME>\n' +
    '    <STATICVARIABLES>\n' +
    vars +
    '    </STATICVARIABLES>\n' +
    '   </REQUESTDESC>\n' +
    '  </EXPORTDATA>\n' +
    ' </BODY>\n' +
    '</ENVELOPE>'
  );
}

function buildExportXmlLegacy(objectId, fromDd, toDd, opts, mode) {
  opts = opts || {};
  const id = objectId || 'Day Book';
  const m =
    mode === 'typedDmy'
      ? 'typedDmy'
      : mode === 'typed'
        ? 'typed'
        : mode === 'dmyPlain'
          ? 'dmyPlain'
          : mode === 'datesFirst'
            ? 'datesFirst'
            : 'fmtFirst';
  const vars = staticVarsBlockLegacyIndent(fromDd, toDd, opts, m);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<ENVELOPE>\n' +
    '  <HEADER>\n' +
    '    <VERSION>1</VERSION>\n' +
    '    <TALLYREQUEST>Export</TALLYREQUEST>\n' +
    '    <TYPE>Data</TYPE>\n' +
    '    <ID>' +
    escapeXml(id) +
    '</ID>\n' +
    '  </HEADER>\n' +
    '  <BODY>\n' +
    '    <DESC>\n' +
    '      <STATICVARIABLES>\n' +
    vars +
    '      </STATICVARIABLES>\n' +
    '    </DESC>\n' +
    '  </BODY>\n' +
    '</ENVELOPE>'
  );
}

/** Official-style Day Book + TDL voucher-type filter (TallyHelp sample pattern). */
function buildDayBookTdlFilter(fromDd, toDd, voucherType, opts, mode) {
  opts = opts || {};
  const m =
    mode === 'typedDmy'
      ? 'typedDmy'
      : mode === 'typed'
        ? 'typed'
        : mode === 'dmyPlain'
          ? 'dmyPlain'
          : mode === 'datesFirst'
            ? 'datesFirst'
            : 'fmtFirst';
  const vars = staticVarsBlockLegacyIndent(fromDd, toDd, { ...opts, voucherTypeName: undefined }, m);
  const vt = escapeXml(String(voucherType || 'Payment').trim());
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<ENVELOPE>\n' +
    '  <HEADER>\n' +
    '    <VERSION>1</VERSION>\n' +
    '    <TALLYREQUEST>Export</TALLYREQUEST>\n' +
    '    <TYPE>Data</TYPE>\n' +
    '    <ID>Day Book</ID>\n' +
    '  </HEADER>\n' +
    '  <BODY>\n' +
    '    <DESC>\n' +
    '      <STATICVARIABLES>\n' +
    vars +
    '      </STATICVARIABLES>\n' +
    '      <TDL>\n' +
    '        <TDLMESSAGE>\n' +
    '          <COLLECTION NAME="Default" ISMODIFY="Yes">\n' +
    '            <FILTER>GAVchTypeFilter</FILTER>\n' +
    '            <FETCH>VoucherTypeName</FETCH>\n' +
    '          </COLLECTION>\n' +
    '          <SYSTEM TYPE="Formulae" NAME="GAVchTypeFilter">$VoucherTypeName = "' +
    vt +
    '"</SYSTEM>\n' +
    '        </TDLMESSAGE>\n' +
    '      </TDL>\n' +
    '    </DESC>\n' +
    '  </BODY>\n' +
    '</ENVELOPE>'
  );
}

function isMultiDayRequest(fromDd, toDd) {
  return String(fromDd) < String(toDd);
}

function daysBetween(fromDd, toDd) {
  const a = String(fromDd || '');
  const b = String(toDd || '');
  if (!/^\d{8}$/.test(a) || !/^\d{8}$/.test(b) || a > b) return 0;
  return Math.round(
    (Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8)) -
      Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6, 8))) /
      86400000
  );
}

function extractVoucherBlocks(xml) {
  return String(xml || '').match(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi) || [];
}

function voucherDate(block) {
  const s = String(block || '');
  const tags = ['DATE', 'VCHENTRYDATE', 'EFFECTIVEDATE', 'ALTEREDON', 'REFERENCEDATE'];
  for (const tag of tags) {
    const re = new RegExp('<' + tag + '>(\\d{8})</' + tag + '>', 'i');
    const m = re.exec(s);
    if (m) return m[1];
  }
  const attr = /\bDATE\s*=\s*"(\d{8})"/i.exec(s);
  return attr ? attr[1] : '';
}

function voucherTypeOf(block) {
  const m = /<VOUCHERTYPENAME>([^<]*)<\/VOUCHERTYPENAME>/i.exec(block || '');
  return m ? String(m[1] || '').trim() : '';
}

function collectDates(xml) {
  const dates = new Set();
  const re = /<DATE>(\d{8})<\/DATE>/g;
  let m;
  const t = String(xml || '');
  while ((m = re.exec(t)) !== null) dates.add(m[1]);
  return dates;
}

/** Prefer responses whose voucher dates fall inside the requested window. */
function scoreExportBody(xml, fromDd, toDd) {
  const t = String(xml || '');
  if (!responseHasVoucherXml(t)) return -1;
  const blocks = extractVoucherBlocks(t);
  if (!blocks.length) return -1;
  let inRange = 0;
  let outRange = 0;
  const dates = new Set();
  for (const b of blocks) {
    const d = voucherDate(b);
    if (!d) continue;
    dates.add(d);
    if (fromDd && toDd && (d < fromDd || d > toDd)) outRange += 1;
    else inRange += 1;
  }
  if (inRange === 0 && outRange > 0) return -1000 - outRange;
  if (outRange > inRange && inRange < 3) return inRange - outRange;
  return dates.size * 100000 + inRange * 10 - outRange;
}

/** Tally returned vouchers, but none fall inside the requested From–To (dates ignored). */
function responseIgnoresDateWindow(xml, fromDd, toDd) {
  const blocks = extractVoucherBlocks(xml);
  if (!blocks.length) return false;
  let inR = 0;
  let outR = 0;
  for (const b of blocks) {
    const d = voucherDate(b);
    if (!d) continue;
    if (fromDd && toDd && (d < fromDd || d > toDd)) outR += 1;
    else inR += 1;
  }
  return outR > 0 && inR === 0;
}

/**
 * True when Tally returned some in-range vouchers but the date span looks cut short
 * (classic: only "today" for a multi-day window).
 */
function looksLikeTruncation(xml, fromDd, toDd) {
  if (!isMultiDayRequest(fromDd, toDd)) return false;
  if (!responseHasVoucherXml(xml)) return false;
  const dates = [...collectDates(xml)].filter((d) => !fromDd || !toDd || (d >= fromDd && d <= toDd));
  if (!dates.length) return false;
  const reqSpan = daysBetween(fromDd, toDd);
  if (dates.length <= 1) return reqSpan >= 1;
  dates.sort();
  const gotSpan = daysBetween(dates[0], dates[dates.length - 1]);
  if (reqSpan >= 7 && gotSpan <= 2) return true;
  if (reqSpan >= 28 && gotSpan < Math.min(7, Math.floor(reqSpan / 4))) return true;
  return false;
}

function isAcceptable(xml, fromDd, toDd) {
  const sc = scoreExportBody(xml, fromDd, toDd);
  if (sc <= 0) return false;
  if (responseIgnoresDateWindow(xml, fromDd, toDd)) return false;
  if (looksLikeTruncation(xml, fromDd, toDd)) return false;
  return true;
}

function monthChunks(fromDd, toDd) {
  const a = String(fromDd || '');
  const b = String(toDd || '');
  if (!/^\d{8}$/.test(a) || !/^\d{8}$/.test(b) || a > b) return [[a, b]];
  const out = [];
  let y = parseInt(a.slice(0, 4), 10);
  let m = parseInt(a.slice(4, 6), 10);
  const yEnd = parseInt(b.slice(0, 4), 10);
  const mEnd = parseInt(b.slice(4, 6), 10);
  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    const mm = String(m).padStart(2, '0');
    const start = y === parseInt(a.slice(0, 4), 10) && m === parseInt(a.slice(4, 6), 10) ? a : String(y) + mm + '01';
    const lastDay = new Date(y, m, 0).getDate();
    const endCand = String(y) + mm + String(lastDay).padStart(2, '0');
    const end = endCand > b ? b : endCand;
    if (start <= end) out.push([start, end]);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.length ? out : [[a, b]];
}

/** Inclusive day windows — Day Book reliably respects single-day SVFROMDATE=SVTODATE. */
function dayChunks(fromDd, toDd) {
  const a = String(fromDd || '');
  const b = String(toDd || '');
  if (!/^\d{8}$/.test(a) || !/^\d{8}$/.test(b) || a > b) return [[a, b]];
  const out = [];
  let y = parseInt(a.slice(0, 4), 10);
  let m = parseInt(a.slice(4, 6), 10);
  let d = parseInt(a.slice(6, 8), 10);
  const endY = parseInt(b.slice(0, 4), 10);
  const endM = parseInt(b.slice(4, 6), 10);
  const endD = parseInt(b.slice(6, 8), 10);
  while (
    y < endY ||
    (y === endY && m < endM) ||
    (y === endY && m === endM && d <= endD)
  ) {
    const key =
      String(y) + String(m).padStart(2, '0') + String(d).padStart(2, '0');
    out.push([key, key]);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
    d = dt.getUTCDate();
    if (out.length > 400) break;
  }
  return out.length ? out : [[a, b]];
}

function voucherDedupeKey(block) {
  const guid = /<GUID>([^<]*)<\/GUID>/i.exec(block);
  if (guid && guid[1].trim()) return 'g:' + guid[1].trim();
  const mid = /<MASTERID>([^<]*)<\/MASTERID>/i.exec(block);
  if (mid && mid[1].trim()) return 'm:' + mid[1].trim();
  const d = voucherDate(block);
  const vn = (/<VOUCHERNUMBER>([^<]*)<\/VOUCHERNUMBER>/i.exec(block) || [])[1] || '';
  const vt = voucherTypeOf(block);
  return 'k:' + d + '|' + vn + '|' + vt;
}

function filterAndMergeVouchers(xmlList, fromDd, toDd, voucherTypes) {
  const seen = new Set();
  const blocks = [];
  const typeSet = (voucherTypes || []).map((t) => String(t).toLowerCase()).filter(Boolean);
  for (const xml of xmlList || []) {
    for (const v of extractVoucherBlocks(xml)) {
      const d = voucherDate(v);
      if (d && fromDd && toDd && (d < fromDd || d > toDd)) continue;
      if (typeSet.length) {
        const vt = voucherTypeOf(v).toLowerCase();
        if (!vt || !typeSet.some((t) => vt === t || vt.includes(t))) continue;
      }
      const key = voucherDedupeKey(v);
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push(v);
    }
  }
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<ENVELOPE>\n' +
    ' <HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER>\n' +
    ' <BODY>\n' +
    '  <IMPORTDATA>\n' +
    '   <REQUESTDATA>\n' +
    blocks.join('\n') +
    '\n   </REQUESTDATA>\n' +
    '  </IMPORTDATA>\n' +
    ' </BODY>\n' +
    '</ENVELOPE>'
  );
}

function resolveJobs(body) {
  const preset = String(body.preset || '').trim().toLowerCase();
  if (preset === 'payment_receipt' || preset === 'payment_receipts') {
    return [
      {
        label: 'Payment',
        voucherType: 'Payment',
        reportIds: ['Day Book', 'Voucher Register'],
      },
      {
        label: 'Receipt',
        voucherType: 'Receipt',
        reportIds: ['Day Book', 'Voucher Register'],
      },
    ];
  }
  if (Array.isArray(body.reportIds) && body.reportIds.length) {
    return body.reportIds.map((rid) => ({
      label: String(rid),
      voucherType: body.voucherTypeName || null,
      reportIds: [String(rid).trim()],
    }));
  }
  return [
    {
      label: String(body.reportId || 'Voucher Register'),
      voucherType: body.voucherTypeName || null,
      reportIds: [String(body.reportId || 'Voucher Register').trim() || 'Voucher Register'],
    },
  ];
}

async function forwardToTally(xmlBody) {
  const r = await fetch(TALLY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=UTF-8' },
    body: xmlBody,
    signal: AbortSignal.timeout(TALLY_TIMEOUT_MS),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

/** Build a short, deduped probe list for one date window. */
function buildAttemptList(reportIds, fromDd, toDd, optsOut) {
  const uniqueNames = [...new Set((reportIds || ['Day Book']).filter(Boolean))];
  const vt = optsOut.voucherTypeName || '';
  const list = [];
  const seen = new Set();
  const push = (tag, fn) => {
    if (seen.has(tag)) return;
    seen.add(tag);
    list.push({ tag, fn });
  };

  // 1) Collection + date formula (best range fidelity)
  if (vt) {
    push('Collection-dated|' + vt, () => buildVoucherCollectionDated(fromDd, toDd, vt, optsOut));
  }
  push('Collection-dated|all', () => buildVoucherCollectionDated(fromDd, toDd, '', optsOut));

  // 2) Day Book TDL type filter with typed dates
  if (vt) {
    push('DayBook-TDL|' + vt + '|typedDmy', () => buildDayBookTdlFilter(fromDd, toDd, vt, optsOut, 'typedDmy'));
    push('DayBook-TDL|' + vt + '|dmyPlain', () => buildDayBookTdlFilter(fromDd, toDd, vt, optsOut, 'dmyPlain'));
  }

  // 3) Export Data Day Book / Voucher Register
  for (const rid of uniqueNames) {
    const reportName = rid || 'Day Book';
    push(reportName + '+vtype|typedDmy', () => buildExportData(reportName, fromDd, toDd, optsOut, 'typedDmy'));
    push(reportName + '+vtype|dmyPlain', () => buildExportData(reportName, fromDd, toDd, optsOut, 'dmyPlain'));
    push(reportName + '+vtype|fmtFirst', () => buildExportData(reportName, fromDd, toDd, optsOut, 'fmtFirst'));
  }

  if (lastWinningTag) {
    const ix = list.findIndex((x) => x.tag === lastWinningTag);
    if (ix > 0) {
      const [w] = list.splice(ix, 1);
      list.unshift(w);
    }
  }

  return list.slice(0, MAX_PROBES_PER_WINDOW);
}

async function exportOneWindow(reportIds, fromDd, toDd, optsIn) {
  let optsOut = { ...(optsIn || {}) };
  const attempts = buildAttemptList(reportIds, fromDd, toDd, optsOut);

  let best = null;
  let bestScore = -999999;
  let bestTag = '';
  let emptyStreak = 0;

  for (const a of attempts) {
    let xml = a.fn();
    let out;
    try {
      out = await forwardToTally(xml);
    } catch (e) {
      console.warn('[ga-tally-bridge]', a.tag, 'Tally fetch failed:', e.message || e);
      emptyStreak += 1;
      if (emptyStreak >= 3) {
        console.warn('[ga-tally-bridge] aborting window after repeated Tally failures');
        break;
      }
      continue;
    }
    let bodyText = out.body || '';

    const companyRejected =
      optsOut.sendCompanyToTally &&
      optsOut.currentCompany &&
      /<LINEERROR[^>]*>/i.test(bodyText) &&
      /SVCURRENTCOMPANY|SVCurrentCompany|Could not set.*company/i.test(bodyText);
    if (companyRejected) {
      console.warn('[ga-tally-bridge] SVCURRENTCOMPANY rejected; retrying without company.');
      optsOut = { ...optsOut, sendCompanyToTally: false, currentCompany: undefined };
      xml = a.fn();
      try {
        out = await forwardToTally(xml);
        bodyText = out.body || '';
      } catch (e) {
        console.warn('[ga-tally-bridge] retry without company failed:', e.message || e);
        continue;
      }
    }

    const sc = scoreExportBody(bodyText, fromDd, toDd);
    const nv = extractVoucherBlocks(bodyText).length;
    console.log('[ga-tally-bridge]', a.tag, fromDd, '→', toDd, 'score=', sc, 'vouchers~', nv);

    if (sc > bestScore) {
      bestScore = sc;
      best = out;
      bestTag = a.tag;
    }

    if (isAcceptable(bodyText, fromDd, toDd)) {
      lastWinningTag = a.tag;
      console.log('[ga-tally-bridge] accepted', a.tag);
      return { out, tag: a.tag, score: sc, optsOut, acceptable: true, empty: false };
    }

    if (sc < 0 && nv === 0) {
      emptyStreak += 1;
      if (emptyStreak >= 2) {
        console.warn('[ga-tally-bridge] empty streak — stop probes for', fromDd, '→', toDd);
        break;
      }
    } else {
      emptyStreak = 0;
    }
  }

  const empty = bestScore < 0 || !extractVoucherBlocks(best?.body || '').length;
  return {
    out: best || { ok: true, body: '<ENVELOPE><BODY><DATA></DATA></BODY></ENVELOPE>' },
    tag: bestTag || 'empty',
    score: bestScore,
    optsOut,
    acceptable: false,
    empty,
  };
}

/**
 * Month windows first (legacy path for non-SSOT presets).
 * Truncated / date-ignored months → day-by-day.
 */
async function exportAdaptive(job, fromDd, toDd, optsIn) {
  const opts = { ...(optsIn || {}), voucherTypeName: job.voucherType || optsIn?.voucherTypeName || undefined };
  const parts = [];
  const meta = [];

  const windows = isMultiDayRequest(fromDd, toDd) ? monthChunks(fromDd, toDd) : [[fromDd, toDd]];
  for (const [wFrom, wTo] of windows) {
    console.log('[ga-tally-bridge] window', job.label, wFrom, '→', wTo);
    const wr = await exportOneWindow(job.reportIds, wFrom, wTo, opts);
    const body = wr.out.body || '';
    const truncated = looksLikeTruncation(body, wFrom, wTo);
    const ignores = responseIgnoresDateWindow(body, wFrom, wTo);
    const needDays =
      isMultiDayRequest(wFrom, wTo) && (!wr.acceptable || truncated || ignores);

    if (wr.acceptable && !needDays) {
      parts.push(body);
      meta.push({
        job: job.label,
        from: wFrom,
        to: wTo,
        tag: wr.tag,
        score: wr.score,
        mode: 'month',
        vouchers: extractVoucherBlocks(body).length,
      });
      continue;
    }

    if (needDays) {
      console.warn('[ga-tally-bridge] month incomplete — day fan-out', job.label, wFrom, wTo);
      for (const [dFrom, dTo] of dayChunks(wFrom, wTo)) {
        const dr = await exportOneWindow(job.reportIds, dFrom, dTo, wr.optsOut || opts);
        parts.push(dr.out.body || '');
        meta.push({
          job: job.label,
          from: dFrom,
          to: dTo,
          tag: dr.tag,
          score: dr.score,
          mode: 'day',
          acceptable: dr.acceptable,
          vouchers: extractVoucherBlocks(dr.out.body || '').length,
        });
      }
      continue;
    }

    parts.push(body);
    meta.push({
      job: job.label,
      from: wFrom,
      to: wTo,
      tag: wr.tag,
      score: wr.score,
      mode: wr.empty ? 'month_empty' : 'month_partial',
      vouchers: extractVoucherBlocks(body).length,
    });
  }
  return { parts, meta, optsOut: opts };
}

/**
 * Payment+Receipt SSOT export: do NOT trust Tally date windows.
 * Pull by type (and FY), then Cashflow From–To is applied in filterAndMergeVouchers.
 */
async function exportPaymentReceiptSsot(fromDd, toDd, optsIn) {
  const jobs = resolveJobs({ preset: 'payment_receipt' });
  const voucherTypes = jobs.map((j) => j.voucherType).filter(Boolean);
  let opts = { ...(optsIn || {}) };
  const parts = [];
  const meta = [];
  let strategy = 'type_only_ssot';

  // --- A) Type-only Collection (best when Day Book date filter is broken) ---
  for (const job of jobs) {
    console.log('[ga-tally-bridge] SSOT type-only collection', job.label);
    const attempts = [
      {
        tag: 'TypeOnly|' + job.voucherType,
        fn: () => buildVoucherCollectionByType(job.voucherType, opts),
      },
      {
        tag: 'TypeOnly-datedFY|' + job.voucherType,
        fn: () => {
          const fys = indianFyChunksCovering(fromDd, toDd);
          // Use first FY spanning the request for this probe; full FY loop below
          return buildVoucherCollectionDated(fys[0][0], fys[0][1], job.voucherType, opts);
        },
      },
    ];
    let bestBody = '';
    let bestTag = 'empty';
    let bestN = 0;
    for (const a of attempts) {
      let out;
      try {
        out = await forwardToTally(a.fn());
      } catch (e) {
        console.warn('[ga-tally-bridge]', a.tag, e.message || e);
        continue;
      }
      let body = out.body || '';
      if (
        opts.sendCompanyToTally &&
        opts.currentCompany &&
        /SVCURRENTCOMPANY|Could not set.*company/i.test(body)
      ) {
        opts = { ...opts, sendCompanyToTally: false, currentCompany: undefined };
        try {
          out = await forwardToTally(a.fn());
          body = out.body || '';
        } catch (_) {}
      }
      const n = extractVoucherBlocks(body).length;
      const dates = [...collectDates(body)].sort();
      console.log(
        '[ga-tally-bridge]',
        a.tag,
        'vouchers~',
        n,
        'rawSpan',
        dates[0] || '-',
        '→',
        dates[dates.length - 1] || '-'
      );
      meta.push({
        job: job.label,
        mode: 'type_probe',
        tag: a.tag,
        vouchers: n,
        dateMin: dates[0] || null,
        dateMax: dates[dates.length - 1] || null,
      });
      if (n > bestN) {
        bestN = n;
        bestBody = body;
        bestTag = a.tag;
      }
    }
    if (bestBody) {
      parts.push(bestBody);
      meta.push({ job: job.label, mode: 'type_only_keep', tag: bestTag, vouchers: bestN });
    }
  }

  let merged = filterAndMergeVouchers(parts, fromDd, toDd, voucherTypes);
  let dates = [...collectDates(merged)].sort();
  let totalV = extractVoucherBlocks(merged).length;
  console.log(
    '[ga-tally-bridge] SSOT after type-only filter',
    fromDd,
    '→',
    toDd,
    'vouchers=',
    totalV,
    'span',
    dates[0] || '-',
    '→',
    dates[dates.length - 1] || '-'
  );

  // --- B) If still truncated: pull each overlapping Indian FY with dated Collection ---
  if (totalV === 0 || looksLikeTruncation(merged, fromDd, toDd)) {
    strategy = 'fy_dated_ssot';
    console.warn('[ga-tally-bridge] SSOT type-only insufficient — FY dated collections');
    for (const [fyFrom, fyTo] of indianFyChunksCovering(fromDd, toDd)) {
      for (const job of jobs) {
        const wr = await exportOneWindow(job.reportIds, fyFrom, fyTo, {
          ...opts,
          voucherTypeName: job.voucherType,
        });
        parts.push(wr.out.body || '');
        meta.push({
          job: job.label,
          mode: 'fy_window',
          from: fyFrom,
          to: fyTo,
          tag: wr.tag,
          vouchers: extractVoucherBlocks(wr.out.body || '').length,
        });
      }
    }
    merged = filterAndMergeVouchers(parts, fromDd, toDd, voucherTypes);
    dates = [...collectDates(merged)].sort();
    totalV = extractVoucherBlocks(merged).length;
  }

  // --- C) Day walk: keep only vouchers whose DATE equals the requested day ---
  if (totalV === 0 || looksLikeTruncation(merged, fromDd, toDd)) {
    strategy = 'day_exact_ssot';
    console.warn('[ga-tally-bridge] SSOT still truncated — exact day walk', fromDd, '→', toDd);
    const dayParts = [];
    for (const job of jobs) {
      for (const [dFrom, dTo] of dayChunks(fromDd, toDd)) {
        const dr = await exportOneWindow(job.reportIds, dFrom, dTo, {
          ...opts,
          voucherTypeName: job.voucherType,
        });
        // Exact-day keep (discard Tally's "always return Apr-1" noise for other days)
        const exact = filterAndMergeVouchers([dr.out.body || ''], dFrom, dTo, [job.voucherType]);
        const nExact = extractVoucherBlocks(exact).length;
        if (nExact) dayParts.push(exact);
        meta.push({
          job: job.label,
          mode: 'day_exact',
          from: dFrom,
          to: dTo,
          tag: dr.tag,
          vouchers: nExact,
        });
      }
    }
    if (dayParts.length) {
      merged = filterAndMergeVouchers(dayParts.concat(parts), fromDd, toDd, voucherTypes);
      dates = [...collectDates(merged)].sort();
      totalV = extractVoucherBlocks(merged).length;
    }
  }

  return {
    merged,
    meta,
    optsOut: opts,
    strategy,
    voucherTypes,
    totalV,
    dateMin: dates[0] || null,
    dateMax: dates[dates.length - 1] || null,
  };
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1');
  const path = u.pathname;

  if (req.method === 'OPTIONS') {
    send(res, 204, '');
    return;
  }

  if (path === '/health') {
    send(res, 200, {
      ok: true,
      service: 'ga-tally-bridge',
      tallyUrl: TALLY_URL,
      port: BRIDGE_PORT,
      features: [
        'payment_receipt_ssot_v34',
        'type_only_collection',
        'fy_dated_fallback',
        'day_exact_keep',
        'cashflow_date_authority',
        'tally_timeout',
      ],
      version: BRIDGE_VERSION,
      tallyTimeoutMs: TALLY_TIMEOUT_MS,
      maxProbesPerWindow: MAX_PROBES_PER_WINDOW,
    });
    return;
  }

  if (path === '/tally/ping' && req.method === 'POST') {
    const tiny =
      '<?xml version="1.0" encoding="UTF-8"?><ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Companies</ID></HEADER><BODY></BODY></ENVELOPE>';
    try {
      const out = await forwardToTally(tiny);
      send(res, 200, {
        ok: out.ok,
        tallyStatus: out.status,
        preview: (out.body || '').slice(0, 400),
        error: out.ok ? null : 'Tally returned non-OK status',
        bridgeVersion: BRIDGE_VERSION,
      });
    } catch (e) {
      send(res, 200, {
        ok: false,
        error: e.message || String(e),
        hint: 'Is Tally Prime running? Enable HTTP/XML server on port 9000.',
        bridgeVersion: BRIDGE_VERSION,
      });
    }
    return;
  }

  if (path === '/tally/forward' && req.method === 'POST') {
    let buf = '';
    for await (const ch of req) buf += ch;
    try {
      const out = await forwardToTally(buf);
      res.writeHead(out.ok ? 200 : 502, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(out.body);
    } catch (e) {
      send(res, 502, { ok: false, error: e.message || String(e) });
    }
    return;
  }

  if (path === '/tally/export' && req.method === 'POST') {
    let raw = '';
    for await (const ch of req) raw += ch;
    let body = {};
    try {
      body = JSON.parse(raw || '{}');
    } catch (_) {
      send(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    const fromDd = (body.fromDate || '').replace(/\D/g, '').slice(0, 8);
    const toDd = (body.toDate || '').replace(/\D/g, '').slice(0, 8);
    if (fromDd.length !== 8 || toDd.length !== 8) {
      send(res, 400, { ok: false, error: 'fromDate and toDate must be YYYYMMDD or YYYY-MM-DD' });
      return;
    }
    if (fromDd > toDd) {
      send(res, 400, { ok: false, error: 'fromDate must be on or before toDate' });
      return;
    }

    const jobs = resolveJobs(body);
    const voucherTypes = jobs.map((j) => j.voucherType).filter(Boolean);
    let optsOut = {
      sendCompanyToTally: body.sendCompanyToTally === true,
      currentCompany:
        body.sendCompanyToTally === true && typeof body.currentCompany === 'string'
          ? body.currentCompany.trim()
          : undefined,
    };

    const preset = String(body.preset || '').trim().toLowerCase();

    try {
      let merged = '';
      let meta = [];
      let totalV = 0;
      let dates = [];
      let strategy = 'adaptive';

      if (preset === 'payment_receipt' || preset === 'payment_receipts') {
        const ssot = await exportPaymentReceiptSsot(fromDd, toDd, optsOut);
        optsOut = ssot.optsOut || optsOut;
        merged = ssot.merged;
        meta = ssot.meta || [];
        totalV = ssot.totalV || 0;
        dates = [ssot.dateMin, ssot.dateMax].filter(Boolean);
        if (!dates.length) dates = [...collectDates(merged)].sort();
        strategy = ssot.strategy || 'type_only_ssot';
      } else {
        const xmlParts = [];
        for (const job of jobs) {
          const r = await exportAdaptive(job, fromDd, toDd, optsOut);
          optsOut = r.optsOut || optsOut;
          xmlParts.push(...r.parts);
          meta.push(...r.meta);
        }
        merged = filterAndMergeVouchers(xmlParts, fromDd, toDd, voucherTypes.length ? voucherTypes : null);
        totalV = extractVoucherBlocks(merged).length;
        dates = [...collectDates(merged)].sort();
        strategy = 'adaptive_v34';
      }

      // Final SSOT clamp — never return vouchers outside Cashflow From–To
      merged = filterAndMergeVouchers([merged], fromDd, toDd, voucherTypes.length ? voucherTypes : null);
      totalV = extractVoucherBlocks(merged).length;
      dates = [...collectDates(merged)].sort();

      const stillTruncated = looksLikeTruncation(merged, fromDd, toDd);
      const rawBeforeFilterHint =
        stillTruncated && totalV > 0
          ? ' After filtering to your From–To, voucher dates still collapse to a narrow span. If Tally only has entries on that day, the books themselves lack mid-range Payment/Receipt vouchers.'
          : '';

      console.log(
        '[ga-tally-bridge] FINAL strategy=',
        strategy,
        'vouchers=',
        totalV,
        'dateSpan=',
        dates[0] || '-',
        '→',
        dates[dates.length - 1] || '-',
        stillTruncated ? 'TRUNCATED' : 'OK'
      );

      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-GA-Tally-Meta',
        'X-GA-Tally-Meta': headerSafeJson({
          preset: body.preset || null,
          strategy: strategy,
          version: BRIDGE_VERSION,
          dateAuthority: 'cashflow',
          fromDate: fromDd,
          toDate: toDd,
          voucherCount: totalV,
          dateMin: dates[0] || null,
          dateMax: dates[dates.length - 1] || null,
          empty: totalV === 0,
          truncated: stillTruncated,
          hint:
            totalV === 0
              ? 'No Payment/Receipt vouchers in this date range after Cashflow date filter. Open the company in Tally, confirm FY, and ensure Payment/Receipt vouchers exist between From and To.'
              : stillTruncated
                ? 'Cashflow kept only vouchers inside From–To, but Tally supplied a narrow date set.' +
                  rawBeforeFilterHint +
                  ' Restart bridge v3.4 (start-tally-bridge.bat).'
                : null,
          parts: meta.slice(0, 160),
        }),
      });
      res.end(merged);
    } catch (e) {
      send(res, 502, { ok: false, error: e.message || String(e) });
    }
    return;
  }

  send(res, 404, {
    ok: false,
    error: 'Not found',
    paths: ['/health', '/tally/ping', '/tally/forward', '/tally/export'],
  });
});

server.listen(BRIDGE_PORT, '127.0.0.1', () => {
  console.log(
    'GA Tally bridge v' +
      BRIDGE_VERSION +
      ' on http://127.0.0.1:' +
      BRIDGE_PORT +
      ' → ' +
      TALLY_URL +
      ' (timeout ' +
      TALLY_TIMEOUT_MS +
      'ms, max probes/window ' +
      MAX_PROBES_PER_WINDOW +
      ')'
  );
  console.log('Forwarding to Tally at ' + TALLY_URL);
  console.log(
    'payment_receipt SSOT = type-only Collection → FY dated → day-exact; Cashflow From–To is final date authority'
  );
});
