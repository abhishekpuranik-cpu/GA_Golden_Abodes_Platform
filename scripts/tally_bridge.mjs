#!/usr/bin/env node
/**
 * Golden Abodes — Tally Prime local bridge
 *
 * Tally listens on http://127.0.0.1:9000 (default). Browsers cannot call it
 * directly (CORS). This tiny server forwards XML to Tally and returns the response.
 *
 * Usage:
 *   node tally_bridge.mjs
 *   set TALLY_URL=http://127.0.0.1:9000
 *   set BRIDGE_PORT=34876
 *
 * Requirements: Node 18+ (fetch). Tally Prime must be running with XML access.
 *
 * Payment + Receipt (inception → today):
 *   POST /tally/export
 *   { "preset":"payment_receipt", "fromDate":"20000401", "toDate":"20260713", "chunkByYear":true }
 */

import http from 'http';
import { URL } from 'url';

const TALLY_URL = process.env.TALLY_URL || 'http://127.0.0.1:9000';
const BRIDGE_PORT = parseInt(process.env.BRIDGE_PORT || '34876', 10);

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

/** Tally samples often use DD-MMM-YYYY inside Type="Date" (Day Book period / Alt+F2 scope). */
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

/** True if XML looks like a voucher export this app can parse. */
function responseHasVoucherXml(text) {
  return /<VOUCHER[\s/>]/i.test(String(text || ''));
}

function staticVarsBlock(fromDd, toDd, opts, mode) {
  opts = opts || {};
  let fmt = '      <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>\n';
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

/**
 * Export Data + EXPORTDATA (Tally-integrated report export).
 * @param {'fmtFirst'|'datesFirst'|'typed'|'typedDmy'} mode
 */
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

/** STATICVARIABLES before REPORTNAME (some Tally builds). */
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

/**
 * Legacy: Export + TYPE Data + ID.
 * ID must be a built-in Tally object/collection id. We always use Day Book here so Tally
 * does not show "Collection:… Could not find description!" for report titles like
 * "Voucher Register" (those belong in Export Data REPORTNAME only).
 */
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

/** YYYYMMDD string compare is chronological for CE dates. */
function isMultiDayRequest(fromDd, toDd) {
  return String(fromDd) < String(toDd);
}

/** Count distinct 8-digit dates in <DATE>...</DATE> (Tally voucher dates). */
function scoreExportBody(xml) {
  const t = String(xml || '');
  if (!responseHasVoucherXml(t)) return -1;
  const dates = new Set();
  const re = /<DATE>(\d{8})<\/DATE>/g;
  let m;
  while ((m = re.exec(t)) !== null) dates.add(m[1]);
  const nv = (t.match(/<VOUCHER[\s/>]/gi) || []).length;
  if (dates.size === 0) return nv;
  return dates.size * 100000 + nv;
}

/** If user asked for a range but every parsed voucher date is the same day → likely Tally ignored range. */
function looksLikeSingleDayTruncation(xml, fromDd, toDd) {
  if (!isMultiDayRequest(fromDd, toDd)) return false;
  const t = String(xml || '');
  if (!responseHasVoucherXml(t)) return false;
  const dates = new Set();
  const re = /<DATE>(\d{8})<\/DATE>/g;
  let m;
  while ((m = re.exec(t)) !== null) dates.add(m[1]);
  if (dates.size === 0) return false;
  return dates.size <= 1;
}

/** Split long ranges into calendar-year chunks (robust for inception → today). */
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

function extractVoucherBlocks(xml) {
  return String(xml || '').match(/<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi) || [];
}

function voucherDedupeKey(block) {
  const guid = /<GUID>([^<]*)<\/GUID>/i.exec(block);
  if (guid && guid[1].trim()) return 'g:' + guid[1].trim();
  const mid = /<MASTERID>([^<]*)<\/MASTERID>/i.exec(block);
  if (mid && mid[1].trim()) return 'm:' + mid[1].trim();
  const d = (/<DATE>(\d{8})<\/DATE>/i.exec(block) || [])[1] || '';
  const vn = (/<VOUCHERNUMBER>([^<]*)<\/VOUCHERNUMBER>/i.exec(block) || [])[1] || '';
  const vt = (/<VOUCHERTYPENAME>([^<]*)<\/VOUCHERTYPENAME>/i.exec(block) || [])[1] || '';
  return 'k:' + d + '|' + vn + '|' + vt;
}

function mergeVoucherXmlBodies(xmlList) {
  const seen = new Set();
  const blocks = [];
  for (const xml of xmlList || []) {
    for (const v of extractVoucherBlocks(xml)) {
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

const REPORT_ALIASES = {
  'payment register': ['Payment Register', 'Payment'],
  'receipt register': ['Receipt Register', 'Receipts Register', 'Receipt Register', 'Receipt'],
  'receipts register': ['Receipts Register', 'Receipt Register', 'Receipt'],
  'day book': ['Day Book', 'Daybook', 'Voucher Register'],
  'voucher register': ['Voucher Register', 'Day Book'],
};

function expandReportNames(name) {
  const raw = String(name || '').trim();
  if (!raw) return ['Voucher Register'];
  const aliases = REPORT_ALIASES[raw.toLowerCase()];
  if (aliases) return [...new Set(aliases)];
  return [raw];
}

function resolveReportList(body) {
  const preset = String(body.preset || '').trim().toLowerCase();
  if (preset === 'payment_receipt' || preset === 'payment_receipts') {
    return ['Payment Register', 'Receipt Register'];
  }
  if (Array.isArray(body.reportIds) && body.reportIds.length) {
    return body.reportIds.map((x) => String(x || '').trim()).filter(Boolean);
  }
  return [String(body.reportId || 'Voucher Register').trim() || 'Voucher Register'];
}

async function forwardToTally(xmlBody) {
  const r = await fetch(TALLY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=UTF-8',
    },
    body: xmlBody,
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, body: text };
}

/**
 * Try export shapes for one report name + date window; return best voucher XML.
 */
async function exportOneWindow(reportIdRaw, fromDd, toDd, optsIn) {
  let optsOut = { ...(optsIn || {}) };
  const candidates = expandReportNames(reportIdRaw);
  // For multi-day non-register pulls, still try Day Book as last resort for that window
  const reportNorm = String(reportIdRaw || '').toLowerCase();
  if (
    isMultiDayRequest(fromDd, toDd) &&
    reportNorm !== 'day book' &&
    !/payment|receipt/.test(reportNorm)
  ) {
    candidates.push('Day Book');
  }
  const uniqueNames = [...new Set(candidates)];
  const LEGACY_DATA_ID = 'Day Book';

  function attemptsForReport(rid) {
    const reportName = rid || 'Voucher Register';
    return [
      { tag: reportName + '|export-data+typedDmy', fn: () => buildExportData(reportName, fromDd, toDd, optsOut, 'typedDmy') },
      {
        tag: reportName + '|export-data+varsBefore+typedDmy',
        fn: () => buildExportDataVarsBeforeReport(reportName, fromDd, toDd, optsOut, 'typedDmy'),
      },
      { tag: reportName + '|export-data+fmtFirst', fn: () => buildExportData(reportName, fromDd, toDd, optsOut, 'fmtFirst') },
      { tag: reportName + '|export-data+datesFirst', fn: () => buildExportData(reportName, fromDd, toDd, optsOut, 'datesFirst') },
      { tag: reportName + '|export-data+typedYmd', fn: () => buildExportData(reportName, fromDd, toDd, optsOut, 'typed') },
      {
        tag: reportName + '|export-data+varsBeforeReport',
        fn: () => buildExportDataVarsBeforeReport(reportName, fromDd, toDd, optsOut, 'fmtFirst'),
      },
      {
        tag: reportName + '|legacy+DayBook+typedDmy',
        fn: () => buildExportXmlLegacy(LEGACY_DATA_ID, fromDd, toDd, optsOut, 'typedDmy'),
      },
      {
        tag: reportName + '|legacy+DayBook+fmtFirst',
        fn: () => buildExportXmlLegacy(LEGACY_DATA_ID, fromDd, toDd, optsOut, 'fmtFirst'),
      },
    ];
  }

  let best = null;
  let bestScore = -999999;
  let bestTag = '';

  for (const rid of uniqueNames) {
    for (const a of attemptsForReport(rid)) {
      let xml = a.fn();
      let out = await forwardToTally(xml);
      let bodyText = out.body || '';

      const companyRejected =
        optsOut.sendCompanyToTally &&
        optsOut.currentCompany &&
        /<LINEERROR[^>]*>/i.test(bodyText) &&
        /SVCURRENTCOMPANY|SVCurrentCompany|Could not set.*company/i.test(bodyText);
      if (companyRejected) {
        console.warn(
          '[ga-tally-bridge] Tally rejected SVCURRENTCOMPANY; retrying remaining attempts without it.',
        );
        optsOut = { sendCompanyToTally: false, currentCompany: undefined };
        xml = a.fn();
        out = await forwardToTally(xml);
        bodyText = out.body || '';
      }

      const sc = scoreExportBody(bodyText);
      console.log(
        '[ga-tally-bridge]',
        a.tag,
        fromDd,
        '→',
        toDd,
        'score=',
        sc,
        'vouchers~',
        (bodyText.match(/<VOUCHER[\s/>]/gi) || []).length,
      );

      if (sc > bestScore) {
        bestScore = sc;
        best = out;
        bestTag = a.tag;
      }

      const good =
        sc > 0 &&
        (!isMultiDayRequest(fromDd, toDd) || !looksLikeSingleDayTruncation(bodyText, fromDd, toDd));
      if (good) {
        console.log('[ga-tally-bridge] picked', a.tag, '(satisfied range / vouchers)');
        return { out, tag: a.tag, score: sc, optsOut };
      }
    }
  }

  return {
    out: best || { ok: true, body: '<ENVELOPE><BODY><DATA></DATA></BODY></ENVELOPE>' },
    tag: bestTag || 'empty',
    score: bestScore,
    optsOut,
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
      features: ['payment_receipt_preset', 'year_chunks', 'multi_report'],
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
        hint: 'Is Tally Prime running? Enable "Allow access" for XML in Tally.',
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
    const reportList = resolveReportList(body);
    const fromDd = (body.fromDate || '').replace(/\D/g, '').slice(0, 8);
    const toDd = (body.toDate || '').replace(/\D/g, '').slice(0, 8);
    if (fromDd.length !== 8 || toDd.length !== 8) {
      send(res, 400, {
        ok: false,
        error: 'fromDate and toDate must be YYYYMMDD or YYYY-MM-DD',
      });
      return;
    }
    if (fromDd > toDd) {
      send(res, 400, { ok: false, error: 'fromDate must be on or before toDate' });
      return;
    }

    const sendCompanyToTally = body.sendCompanyToTally === true;
    const currentCompany =
      typeof body.currentCompany === 'string' ? body.currentCompany.trim() : '';
    let optsOut = {
      sendCompanyToTally,
      currentCompany: sendCompanyToTally ? currentCompany : undefined,
    };

    const spanYears =
      parseInt(toDd.slice(0, 4), 10) - parseInt(fromDd.slice(0, 4), 10) + (fromDd.slice(4) <= toDd.slice(4) ? 0 : 0);
    const wantChunk =
      body.chunkByYear === true ||
      (body.chunkByYear !== false && (isMultiDayRequest(fromDd, toDd) && spanYears >= 1 || fromDd.slice(0, 4) !== toDd.slice(0, 4)));
    const windows = wantChunk ? yearChunks(fromDd, toDd) : [[fromDd, toDd]];

    try {
      const xmlParts = [];
      const meta = [];

      for (const rid of reportList) {
        for (const [wFrom, wTo] of windows) {
          console.log('[ga-tally-bridge] window', rid, wFrom, '→', wTo);
          const result = await exportOneWindow(rid, wFrom, wTo, optsOut);
          optsOut = result.optsOut || optsOut;
          xmlParts.push(result.out.body || '');
          meta.push({
            reportId: rid,
            from: wFrom,
            to: wTo,
            tag: result.tag,
            score: result.score,
            vouchers: extractVoucherBlocks(result.out.body || '').length,
          });
        }
      }

      const merged = mergeVoucherXmlBodies(xmlParts);
      const totalV = extractVoucherBlocks(merged).length;
      console.log('[ga-tally-bridge] merged vouchers=', totalV, 'parts=', xmlParts.length, meta);

      // Expose light meta via custom header (browser can ignore); body stays parseable XML
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Expose-Headers': 'X-GA-Tally-Meta',
        'X-GA-Tally-Meta': JSON.stringify({
          preset: body.preset || null,
          reports: reportList,
          fromDate: fromDd,
          toDate: toDd,
          chunks: windows.length,
          voucherCount: totalV,
          parts: meta,
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
  console.log('GA Tally bridge listening on http://127.0.0.1:' + BRIDGE_PORT);
  console.log('Forwarding to Tally at ' + TALLY_URL);
  console.log('Endpoints: GET /health | POST /tally/ping | POST /tally/export | POST /tally/forward');
  console.log('Preset payment_receipt: Payment Register + Receipt Register, year-chunked for long ranges');
});
