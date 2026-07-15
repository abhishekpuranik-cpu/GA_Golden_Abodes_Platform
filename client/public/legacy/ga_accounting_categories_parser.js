'use strict';
/**
 * Browser parser for GA Accounting Categories workbook (V3 Building + Common sheets).
 * Mirrors scripts/build-ga-accounting-categories-js.mjs — keep logic aligned.
 */
(function (global) {
  var V3_BUILDING_SHEET = 'Master Sheet for Building';
  var V3_COMMON_SHEET = 'Master Sheet For Common';

  function yesNo(v) {
    return String(v != null ? v : '').trim().toLowerCase() === 'yes';
  }
  function clean(v) {
    return String(v != null ? v : '').trim();
  }
  function extractShortCode(fullStr) {
    var t = clean(fullStr);
    if (!t || t === '0') return '';
    var m = t.match(/\b([A-Z]\d+-\d+)\b/);
    return m ? m[1] : '';
  }
  function inferFlow(l1Letter, l1Name, scope) {
    var lc = clean(l1Letter).toUpperCase();
    var name = clean(l1Name).toLowerCase();
    if (scope === 'common' && lc === 'Z') return 'cash';
    if (/loans?\s*and\s*advance|advances?\s+given|advance\s+receivable/i.test(name)) return 'out';
    if (/deposit|fixed asset|payable|suspense|other current|retention|creditor|depreciation/i.test(name)) {
      return 'out';
    }
    if (/^other income$/i.test(name) || /\bother income\b/i.test(name)) return 'in';
    if (/customer collection/i.test(name)) return 'in';
    if (/sales revenue/i.test(name)) return 'in';
    if (/unsecured loan/i.test(name)) return 'in';
    if (/investor funding|financial institution funding|promoter funding|equity infusion/i.test(name)) return 'in';
    if (scope === 'building') {
      if (lc === 'A' && /sales|revenue/i.test(name)) return 'in';
      if (lc === 'B' && /collection/i.test(name)) return 'in';
      return 'out';
    }
    if (/^[LMNOP]$/.test(lc)) return 'in';
    return 'out';
  }
  function inferLegacyCat1(opts) {
    var n = clean(opts.l1Name);
    var nl = n.toLowerCase();
    if (opts.flow === 'in') {
      if (nl.indexOf('customer collection') >= 0) return 'Customer Collections';
      if (nl.indexOf('sales revenue') >= 0) return 'Sales Revenue';
      if (nl.indexOf('equity') >= 0 || nl.indexOf('promoter') >= 0) return 'Equity Infusion';
      if (nl.indexOf('investor') >= 0) return 'Investor Funding';
      if (nl.indexOf('unsecured') >= 0 || nl.indexOf('financial institution') >= 0) return 'Unsecured Loan';
      return 'Other Income';
    }
    if (nl.indexOf('project acquisition') >= 0 || (nl.indexOf('land') >= 0 && nl.indexOf('loan') < 0)) return 'Land';
    if (nl.indexOf('statutory') >= 0 || nl.indexOf('government duties') >= 0 || nl.indexOf('duties & taxes') >= 0) {
      return 'Regulatory & Consulting';
    }
    if (nl.indexOf('regulatory') >= 0) return 'Regulatory & Consulting';
    if (nl.indexOf('consult') >= 0) return 'Consultant';
    if (nl.indexOf('noc') >= 0) return 'NOC';
    if (nl.indexOf('marketing') >= 0) return 'Marketing';
    if (nl.indexOf('g&a') >= 0 || nl.indexOf('g a') >= 0 || nl.indexOf('dm fee') >= 0) return 'GA DM Fee';
    if (nl.indexOf('finance cost') >= 0) return 'Interest Paid';
    if (/\binterest\b/i.test(nl) && nl.indexOf('income') < 0) return 'Interest Paid';
    if (nl.indexOf('principal') >= 0 || nl.indexOf('debt') >= 0) return 'Principal Repaid';
    if (nl.indexOf('payable') >= 0 || nl.indexOf('creditor') >= 0) return 'Payables';
    if (
      nl.indexOf('construction') >= 0 ||
      nl.indexOf('show flat') >= 0 ||
      nl.indexOf('sales office') >= 0 ||
      nl.indexOf('common aminities') >= 0 ||
      nl.indexOf('common amenities') >= 0 ||
      nl.indexOf('loans and advance') >= 0 ||
      nl.indexOf('fixed asset') >= 0 ||
      nl.indexOf('deposit') >= 0 ||
      nl.indexOf('common expenses') >= 0
    ) {
      return 'Construction';
    }
    if (opts.scope === 'common') return 'Construction';
    return 'Construction';
  }
  function scopedL1Label(scope, l1Name) {
    var label = clean(l1Name);
    if (!label) return '';
    return scope === 'common' ? 'Common · ' + label : 'Building · ' + label;
  }
  function parseV3MasterSheet(ws, scope, prefix) {
    var rows = global.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    var entries = {};
    var cfL1Order = [];
    var plL1Order = [];
    var cfL1Seen = {};
    var plL1Seen = {};
    var curL1 = '';
    var curL1Name = '';
    var curL2 = '';
    var curL2Name = '';
    for (var r = 5; r < rows.length; r++) {
      var row = rows[r] || [];
      var cfApplicable = yesNo(row[0]);
      var plApplicable = yesNo(row[1]);
      if (row[2]) {
        curL1 = clean(row[2]);
        curL1Name = clean(row[3]);
      }
      if (row[4]) {
        curL2 = clean(row[4]);
        curL2Name = clean(row[5]);
      }
      var l3CodeNum = clean(row[6]);
      var l3Name = clean(row[7]);
      if (!l3Name) continue;
      var desc = clean(row[8]);
      var cfL1 = clean(row[9]);
      var cfL2 = clean(row[10]);
      var cfL3 = clean(row[11]);
      var plL1 = clean(row[12]);
      var plL2 = clean(row[13]);
      var plL3 = clean(row[14]);
      var shortCode =
        extractShortCode(cfL3) ||
        extractShortCode(plL3) ||
        (curL1 && l3CodeNum ? curL1 + curL2 + '-' + l3CodeNum : '');
      if (!shortCode) continue;
      var masterKey = prefix + '|' + shortCode;
      var flow = inferFlow(curL1, curL1Name, scope);
      var legacyCat1 = inferLegacyCat1({ l1Name: curL1Name, flow: flow, scope: scope });
      var entry = {
        schema: 'v3',
        scope: scope,
        prefix: prefix,
        masterKey: masterKey,
        shortCode: shortCode,
        cfApplicable: cfApplicable,
        plApplicable: plApplicable,
        l1: curL1,
        l1Name: curL1Name,
        l2: curL2,
        l2Name: curL2Name,
        l3: shortCode,
        l3Name: l3Name,
        desc: desc,
        cfL1: cfL1,
        cfL2: cfL2,
        cfL3: cfL3,
        plL1: plL1,
        plL2: plL2,
        plL3: plL3,
        cfL1Label: scopedL1Label(scope, curL1Name),
        plL1Label: scopedL1Label(scope, curL1Name),
        flow: flow,
        legacyCat1: legacyCat1,
      };
      entries[masterKey] = entry;
      if (cfApplicable && curL1Name) {
        var col = entry.cfL1Label;
        if (!cfL1Seen[col]) {
          cfL1Seen[col] = 1;
          cfL1Order.push({ scope: scope, l1: curL1, l1Name: curL1Name, label: col, flow: flow });
        }
      }
      if (plApplicable && curL1Name) {
        var plCol = entry.plL1Label;
        if (!plL1Seen[plCol]) {
          plL1Seen[plCol] = 1;
          plL1Order.push({ scope: scope, l1: curL1, l1Name: curL1Name, label: plCol });
        }
      }
    }
    return { entries: entries, cfL1Order: cfL1Order, plL1Order: plL1Order };
  }
  function parseV2Outflow(ws) {
    var rows = global.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rows.length) throw new Error('Empty worksheet');
    var header = rows[0].map(function (c) {
      return String(c != null ? c : '').replace(/\r?\n/g, ' ').trim();
    });
    var iL1c = -1;
    var iL1n = -1;
    var iL2c = -1;
    var iL2n = -1;
    var iL3 = -1;
    var iL3Head = -1;
    header.forEach(function (h, ix) {
      if (iL1c < 0 && h.indexOf('L1') >= 0 && h.indexOf('Code') >= 0) iL1c = ix;
      if (iL1n < 0 && h.indexOf('L1') >= 0 && (h.indexOf('Category') >= 0 || h.indexOf('Cat') >= 0)) iL1n = ix;
      if (iL2c < 0 && h.indexOf('L2') >= 0 && h.indexOf('Code') >= 0) iL2c = ix;
      if (iL2n < 0 && h.indexOf('L2') >= 0 && (h.indexOf('Category') >= 0 || h.indexOf('Cat') >= 0)) iL2n = ix;
      if (iL3 < 0 && h.indexOf('L3') >= 0 && h.indexOf('Code') >= 0) iL3 = ix;
      if (iL3Head < 0 && /L3/i.test(h) && (/Cost|Head/i.test(h) || /category/i.test(h))) iL3Head = ix;
    });
    if (iL3 < 0) throw new Error('Could not find L3 Code column');
    var curL1 = '';
    var curL1Name = '';
    var entries = {};
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var l1c = String(row[iL1c] != null ? row[iL1c] : '').trim();
      var l1n = String(row[iL1n] != null ? row[iL1n] : '').trim();
      if (l1c) curL1 = l1c;
      if (l1n) curL1Name = l1n;
      var l3 = String(row[iL3] != null ? row[iL3] : '').trim();
      if (!l3) continue;
      var l2c = String(row[iL2c] != null ? row[iL2c] : '').trim();
      var l2n = String(row[iL2n] != null ? row[iL2n] : '').trim();
      var l3Head = String(row[iL3Head >= 0 ? iL3Head : iL3 + 1] != null ? row[iL3Head >= 0 ? iL3Head : iL3 + 1] : '').trim();
      var desc = '';
      header.forEach(function (h, ix) {
        if (/description/i.test(h)) {
          var t = String(row[ix] != null ? row[ix] : '').trim();
          if (t) desc = t;
        }
      });
      var letter = String(curL1 || '').trim().charAt(0).toUpperCase();
      var flow = inferFlow(letter, curL1Name, 'building');
      var masterKey = 'A|' + l3;
      entries[masterKey] = {
        schema: 'v2',
        scope: 'building',
        prefix: 'A',
        masterKey: masterKey,
        shortCode: l3,
        cfApplicable: true,
        plApplicable: false,
        l1: curL1,
        l1Name: curL1Name,
        l2: l2c,
        l2Name: l2n,
        l3: l3,
        l3Name: l3Head,
        desc: desc,
        cfL1: '',
        cfL2: '',
        cfL3: '',
        plL1: '',
        plL2: '',
        plL3: '',
        cfL1Label: scopedL1Label('building', curL1Name),
        plL1Label: scopedL1Label('building', curL1Name),
        flow: flow,
        legacyCat1: inferLegacyCat1({ l1Name: curL1Name, flow: flow, scope: 'building' }),
      };
    }
    return { entries: entries, cfL1Order: [], plL1Order: [] };
  }
  function buildShortCodeIndex(entries) {
    var byShort = {};
    Object.keys(entries).forEach(function (k) {
      var e = entries[k];
      var sk = e.shortCode;
      if (!byShort[sk]) byShort[sk] = [];
      byShort[sk].push(e.masterKey);
    });
    return byShort;
  }
  function parseBuildingPrefixes(wb) {
    var sheetName = null;
    for (var si = 0; si < wb.SheetNames.length; si++) {
      if (/^masters$/i.test(wb.SheetNames[si])) {
        sheetName = wb.SheetNames[si];
        break;
      }
    }
    if (!sheetName) return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    var rows = global.XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    var prefixes = [];
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || [];
      for (var c = 0; c < row.length; c++) {
        var cell = clean(row[c]).toUpperCase();
        if (cell === 'CM') continue;
        if (/^[A-Z]$/.test(cell) && prefixes.indexOf(cell) < 0) prefixes.push(cell);
      }
    }
    if (!prefixes.length) return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    return prefixes.sort();
  }

  /**
   * @param {object} wb - SheetJS workbook from XLSX.read
   * @returns {{schema, sourceName, uploadedAt, keyCount, GA_ACCT_* }}
   */
  function buildGaAcctMasterFromWorkbook(wb) {
    if (!wb || !wb.SheetNames || !wb.SheetNames.length) throw new Error('Workbook is empty');
    var entries = {};
    var cfL1Building = [];
    var cfL1Common = [];
    var plL1Building = [];
    var plL1Common = [];
    var buildingPrefixes = parseBuildingPrefixes(wb);
    var schema = 'v2';
    if (wb.SheetNames.indexOf(V3_BUILDING_SHEET) >= 0 && wb.SheetNames.indexOf(V3_COMMON_SHEET) >= 0) {
      schema = 'v3';
      var building = parseV3MasterSheet(wb.Sheets[V3_BUILDING_SHEET], 'building', 'A');
      var common = parseV3MasterSheet(wb.Sheets[V3_COMMON_SHEET], 'common', 'CM');
      entries = Object.assign({}, building.entries, common.entries);
      cfL1Building = building.cfL1Order;
      cfL1Common = common.cfL1Order;
      plL1Building = building.plL1Order;
      plL1Common = common.plL1Order;
      buildingPrefixes = parseBuildingPrefixes(wb);
    } else {
      var sheetName = wb.SheetNames.indexOf('Outflow') >= 0 ? 'Outflow' : wb.SheetNames[0];
      var parsed = parseV2Outflow(wb.Sheets[sheetName]);
      entries = parsed.entries;
    }
    var keys = Object.keys(entries);
    return {
      schema: schema,
      uploadedAt: Date.now(),
      keyCount: keys.length,
      GA_ACCT_SCHEMA: schema,
      GA_ACCT_L3_BY_CODE: entries,
      GA_ACCT_L3_BY_SHORT: buildShortCodeIndex(entries),
      GA_ACCT_CF_L1_BUILDING: cfL1Building,
      GA_ACCT_CF_L1_COMMON: cfL1Common,
      GA_ACCT_PL_L1_BUILDING: plL1Building,
      GA_ACCT_PL_L1_COMMON: plL1Common,
      GA_ACCT_BUILDING_PREFIXES: buildingPrefixes,
    };
  }

  global.buildGaAcctMasterFromWorkbook = buildGaAcctMasterFromWorkbook;
})(typeof window !== 'undefined' ? window : globalThis);
