#!/usr/bin/env node
/**
 * Golden Abodes — Tally Prime local bridge
 *
 * Forwards XML to Tally (default http://127.0.0.1:9000) for Cashflow live sync.
 *
 * Payment + Receipt full history (robust):
 *   Do NOT rely on "Payment Register" / "Receipt Register" report titles — Tally often
 *   ignores SVFROMDATE/SVTODATE on those and returns only the current day.
 *   Instead: Day Book / Voucher Register + VOUCHERTYPENAME=Payment|Receipt, dated windows,
 *   reject out-of-range responses, and re-chunk year → month when truncated.
 *
 *   POST /tally/export
 *   { "preset":"payment_receipt", "fromDate":"20000401", "toDate":"20260713" }
 */

import http from 'http';
import { URL } from 'url';

const TALLY_URL = process.env.TALLY_URL || 'http://127.0.0.1:9000';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '34876', 10);
/** Keep short — empty/hung Tally exports must not block Cashflow for minutes. */
const TALLY_TIMEOUT_MS = Math.max(5000, parseInt(process.env.TALLY_TIMEOUT_MS || '20000', 10) || 20000);
/** Max XML shapes tried per window before declaring empty (prevents multi-minute hangs). */
const MAX_PROBES_PER_WINDOW = Math.max(2, parseInt(process.env.TALLY_MAX_PROBES || '5', 10) || 5);
const BRIDGE_VERSION = 3.1;
/** Remember last winning export shape across windows/jobs. */
let lastWinningTag = '';

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

function buildExportData(reportId, fromDd, toDd, opts, mode) {
  opts = opts || {};
  const name = reportId || 'Voucher Register';
  const m =
    mode === 'typedDmy'
      ? 'typedDmy'
      : mode === 'typed'
        ? 'typed'
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

function buildExportDataVarsBeforeReport(reportId, fromDd, toDd, opts, mode) {
  opts = opts || {};
  const name = reportId || 'Voucher Register';
  const m =
    mode === 'typedDmy'
      ? 'typedDmy'
      : mode === 'typed'
        ? 'typed'
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
    '    <STATICVARIABLES>\n' +
    vars +
    '    </STATICVARIABLES>\n' +
    '    <REPORTNAME>' +
    escapeXml(name) +
    '</REPORTNAME>\n' +
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

function extractVoucherBlocks(xml) {
  return String(xml || '').match(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi) || [];
}

function voucherDate(block) {
  const m = /<DATE>(\d{8})<\/DATE>/i.exec(block || '');
  return m ? m[1] : '';
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
  // Heavy penalty if Tally returned only outside-window vouchers (classic register bug)
  if (inRange === 0 && outRange > 0) return -1000 - outRange;
  if (outRange > inRange && inRange < 3) return inRange - outRange;
  return dates.size * 100000 + inRange * 10 - outRange;
}

/**
 * True when Tally returned some in-range vouchers but the date span looks cut short.
 * Empty responses are NOT truncation — do not month-fan-out on score=-1 / 0 vouchers.
 */
function looksLikeTruncation(xml, fromDd, toDd) {
  if (!isMultiDayRequest(fromDd, toDd)) return false;
  if (!responseHasVoucherXml(xml)) return false;
  const dates = [...collectDates(xml)].filter((d) => !fromDd || !toDd || (d >= fromDd && d <= toDd));
  if (!dates.length) return false;
  if (dates.length <= 1 && isMultiDayRequest(fromDd, toDd)) {
    const reqSpan =
      (Date.UTC(+toDd.slice(0, 4), +toDd.slice(4, 6) - 1, +toDd.slice(6, 8)) -
        Date.UTC(+fromDd.slice(0, 4), +fromDd.slice(4, 6) - 1, +fromDd.slice(6, 8))) /
      86400000;
    return reqSpan >= 14;
  }
  dates.sort();
  // Truncated if span of returned dates is tiny vs requested window (>60 days asked, <3 days returned)
  const reqSpan =
    (Date.UTC(+toDd.slice(0, 4), +toDd.slice(4, 6) - 1, +toDd.slice(6, 8)) -
      Date.UTC(+fromDd.slice(0, 4), +fromDd.slice(4, 6) - 1, +fromDd.slice(6, 8))) /
    86400000;
  const gotSpan =
    (Date.UTC(+dates[dates.length - 1].slice(0, 4), +dates[dates.length - 1].slice(4, 6) - 1, +dates[dates.length - 1].slice(6, 8)) -
      Date.UTC(+dates[0].slice(0, 4), +dates[0].slice(4, 6) - 1, +dates[0].slice(6, 8))) /
    86400000;
  if (reqSpan >= 60 && gotSpan <= 2) return true;
  return false;
}

function isAcceptable(xml, fromDd, toDd) {
  const sc = scoreExportBody(xml, fromDd, toDd);
  if (sc <= 0) return false;
  if (looksLikeTruncation(xml, fromDd, toDd)) return false;
  return true;
}

function yearChunks(fromDd, toDd) {
  const a = String(fromDd || '');
  const b = String(toDd || '');
  if (!/^\d{8}$/.test(a) || !/^\d{8}$/.test(b) || a > b) return [[a, b]];
  const y0 = parseInt(a.slice(0, 4), 10);
  const y1 = parseInt(b.slice(0, 4), 10);
  if (y0 === y1) return [[a, b]];
  const out = [];
  for (let y = y0; y <= y1; y += 1) {
    const start = y === y0 ? a : String(y) + '0101';
    const end = y === y1 ? b : String(y) + '1231';
    if (start <= end) out.push([start, end]);
  }
  return out;
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
    // Robust path: dated Day Book / Voucher Register filtered by voucher type
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

  // Prefer last winning shape first (fast path after first success).
  if (vt && lastWinningTag.startsWith('DayBook-TDL|' + vt)) {
    const fmt = lastWinningTag.includes('|fmtFirst') ? 'fmtFirst' : 'typedDmy';
    push(lastWinningTag, () => buildDayBookTdlFilter(fromDd, toDd, vt, optsOut, fmt));
  }

  // Day Book TDL filter once per window (not once per report name).
  if (vt) {
    push('DayBook-TDL|' + vt + '|typedDmy', () => buildDayBookTdlFilter(fromDd, toDd, vt, optsOut, 'typedDmy'));
    push('DayBook-TDL|' + vt + '|fmtFirst', () => buildDayBookTdlFilter(fromDd, toDd, vt, optsOut, 'fmtFirst'));
  }

  for (const rid of uniqueNames) {
    const reportName = rid || 'Day Book';
    push(reportName + '+vtype|typedDmy', () => buildExportData(reportName, fromDd, toDd, optsOut, 'typedDmy'));
    push(reportName + '+vtype|fmtFirst', () => buildExportData(reportName, fromDd, toDd, optsOut, 'fmtFirst'));
    push(reportName + '+vtype|typedYmd', () => buildExportData(reportName, fromDd, toDd, optsOut, 'typed'));
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
      // Two empties is enough — more formats rarely help and burn 20s each.
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
 * Year window first; month fan-out ONLY when the year returned partial data that looks truncated.
 * Empty years (0 vouchers / score=-1) skip month retries — that was the multi-minute hang.
 */
async function exportAdaptive(job, fromDd, toDd, optsIn) {
  const opts = { ...(optsIn || {}), voucherTypeName: job.voucherType || optsIn?.voucherTypeName || undefined };
  const parts = [];
  const meta = [];

  const yearWins = yearChunks(fromDd, toDd);
  for (const [yFrom, yTo] of yearWins) {
    console.log('[ga-tally-bridge] year', job.label, yFrom, '→', yTo);
    const yr = await exportOneWindow(job.reportIds, yFrom, yTo, opts);
    if (yr.acceptable) {
      parts.push(yr.out.body || '');
      meta.push({
        job: job.label,
        from: yFrom,
        to: yTo,
        tag: yr.tag,
        score: yr.score,
        mode: 'year',
        vouchers: extractVoucherBlocks(yr.out.body || '').length,
      });
      continue;
    }

    const yrVouchers = extractVoucherBlocks(yr.out.body || '').length;
    if (yr.empty || yr.score < 0 || yrVouchers === 0) {
      console.warn(
        '[ga-tally-bridge] year empty — skip month fan-out',
        job.label,
        yFrom,
        yTo,
        '(open company in Tally / check FY / narrow dates)'
      );
      parts.push(yr.out.body || '');
      meta.push({
        job: job.label,
        from: yFrom,
        to: yTo,
        tag: yr.tag,
        score: yr.score,
        mode: 'year_empty',
        vouchers: 0,
      });
      continue;
    }

    console.warn('[ga-tally-bridge] year truncated — retry months', job.label, yFrom, yTo);
    for (const [mFrom, mTo] of monthChunks(yFrom, yTo)) {
      console.log('[ga-tally-bridge] month', job.label, mFrom, '→', mTo);
      const mr = await exportOneWindow(job.reportIds, mFrom, mTo, yr.optsOut || opts);
      parts.push(mr.out.body || '');
      meta.push({
        job: job.label,
        from: mFrom,
        to: mTo,
        tag: mr.tag,
        score: mr.score,
        mode: 'month',
        acceptable: mr.acceptable,
        vouchers: extractVoucherBlocks(mr.out.body || '').length,
      });
    }
  }
  return { parts, meta, optsOut: opts };
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
        'payment_receipt_daybook_vtype',
        'year_then_month_chunks',
        'date_window_guard',
        'fail_fast_empty',
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
      });
    } catch (e) {
      send(res, 200, {
        ok: false,
        error: e.message || String(e),
        hint: 'Is Tally Prime running? Enable HTTP/XML server on port 9000.',
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

    try {
      const xmlParts = [];
      const meta = [];

      for (const job of jobs) {
        const r = await exportAdaptive(job, fromDd, toDd, optsOut);
        optsOut = r.optsOut || optsOut;
        xmlParts.push(...r.parts);
        meta.push(...r.meta);
      }

      const merged = filterAndMergeVouchers(xmlParts, fromDd, toDd, voucherTypes.length ? voucherTypes : null);
      const totalV = extractVoucherBlocks(merged).length;
      const dates = [...collectDates(merged)].sort();
      console.log(
        '[ga-tally-bridge] FINAL vouchers=',
        totalV,
        'dateSpan=',
        dates[0] || '-',
        '→',
        dates[dates.length - 1] || '-',
      );
      if (totalV === 0) {
        console.warn(
          '[ga-tally-bridge] 0 vouchers — open the Tally company, confirm FY covers',
          fromDd,
          '→',
          toDd,
          ', and that Payment/Receipt exist. Empty windows no longer month-retry.'
        );
      }

      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-GA-Tally-Meta',
        'X-GA-Tally-Meta': JSON.stringify({
          preset: body.preset || null,
          strategy: 'daybook_voucher_type_dated_v3.1',
          version: BRIDGE_VERSION,
          fromDate: fromDd,
          toDate: toDd,
          voucherCount: totalV,
          dateMin: dates[0] || null,
          dateMax: dates[dates.length - 1] || null,
          empty: totalV === 0,
          hint:
            totalV === 0
              ? 'No Payment/Receipt vouchers in range. In Tally: open the company, set the correct FY, then in Cashflow set From = books inception (2000-04-01) → today and pull again.'
              : null,
          parts: meta.slice(0, 80),
        }).slice(0, 3500),
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
  console.log('payment_receipt = Day Book/Voucher Register + Payment|Receipt types, dated, year→month fallback');
});
