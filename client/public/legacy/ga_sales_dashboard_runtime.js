/* Golden Abodes — Command Centre runtime (inline into ga_sales_dashboard.html) */
(function () {
  'use strict';

  var LS_KEY = 'ga_sales_command_centre_v1';

  var C = {
    gold: '#C9A44A', goldL: '#E8C96A', goldBg: 'rgba(201,164,74,0.15)',
    blue: '#5B8DEF', blueBg: 'rgba(91,141,239,0.15)',
    green: '#4CAF7D', greenBg: 'rgba(76,175,125,0.12)',
    red: '#E05C5C', redBg: 'rgba(224,92,92,0.12)',
    amber: '#F59E0B', amberBg: 'rgba(245,158,11,0.12)',
    purple: '#8B5CF6', purpleBg: 'rgba(139,92,246,0.12)',
    teal: '#06B6D4', bg2: '#10121E',
  };

  var MONTHS = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];

  var tip = {
    backgroundColor: '#10121E',
    borderColor: 'rgba(201,164,74,0.25)',
    borderWidth: 1,
    titleColor: '#F2EDE0',
    bodyColor: '#8890AA',
    padding: 10,
  };

  function DEFAULT_DATA() {
    return {
      meta: { asOf: new Date().toISOString(), label: 'FY 2025–26', fyStart: '2025-04-01' },
      targets: {
        revenueCr: 520, bookingValueCr: 680, collectionsCr: 480, unitsBooked: 380,
        leadToBookingPct: 7, leads: 4500,
      },
      executive: {
        revenueCr: 447, bookingCr: 578, collectionsCr: 412, units: 324,
        realizationSqft: 8420, marketAvgSqft: 7950,
        yoy: { revenue: 18.4, booking: 22.1, collections: 14.6, units: 12.5, realization: 6.8 },
        monthlyRevenue: [32, 35, 38, 42, 40, 45, 48, 38, 42, 46, 44, 47],
        monthlyTarget: [40, 40, 42, 44, 43, 44, 45, 44, 45, 46, 46, 47],
        projects: [
          { name: 'Emerald Heights', revenueCr: 152, bookedUnits: 141, targetUnits: 160, col: C.gold },
          { name: 'Sapphire Villas', revenueCr: 118, bookedUnits: 36, targetUnits: 48, col: C.blue },
          { name: 'Golden Gardens', revenueCr: 68, bookedUnits: 148, targetUnits: 180, col: C.green },
          { name: 'Azure Towers', revenueCr: 74, bookedUnits: 78, targetUnits: 85, col: C.purple },
          { name: 'Horizon Res.', revenueCr: 35, bookedUnits: 143, targetUnits: 210, col: C.amber },
        ],
        collectionsMonthly: { demand: [36, 40, 42, 45, 43, 46, 50, 42, 44, 48, 46, 48], collected: [31, 34, 36, 40, 37, 40, 43, 35, 38, 41, 40, 42] },
        csat: { score: 4.3, nps: 52, repeat: 87, referral: 94 },
      },
      operations: {
        leads: 4872, visits: 1648, negotiation: 697, token: 391, bookings: 324,
        pipelineCr: 184, warmLeads: 842, avgClosureDays: 42,
        yoy: { leads: 31.4, visits: 24.2 }, momPipeline: 15.2,
        leadTrend: {
          leads: [320, 360, 400, 430, 420, 460, 490, 380, 420, 460, 450, 482],
          visits: [108, 122, 134, 145, 142, 156, 166, 128, 142, 156, 152, 162],
          bookings: [22, 24, 26, 29, 27, 30, 32, 25, 28, 31, 30, 32],
        },
        sources: [
          { name: 'Digital / Meta Ads', val: 1842, col: C.blue },
          { name: 'Channel Partners', val: 1214, col: C.gold },
          { name: 'Direct Walk-in', val: 682, col: C.green },
          { name: 'Referral', val: 748, col: C.purple },
          { name: 'IVR / Outbound', val: 386, col: C.amber },
        ],
        channels: {
          labels: ['Digital', 'Ch. Partners', 'Direct', 'Referral', 'IVR'],
          bookings: [112, 86, 48, 58, 20],
          revenueCr: [148, 168, 64, 112, 34],
        },
        roi: {
          labels: ['Digital', 'Ch. Partners', 'Direct', 'Referral', 'IVR'],
          spendLakhs: [180, 120, 20, 15, 65],
          roi: [6.2, 7.2, 24, 38.7, 3.1],
        },
        cpl: [
          { label: 'Digital / Meta', cpl: 1240, w: 52, col: 'var(--blue)' },
          { label: 'Channel Partners', cpl: 940, w: 38, col: 'var(--gold)' },
          { label: 'Direct Walk-in', cpl: 440, w: 18, col: 'var(--green)' },
          { label: 'Referral', cpl: 290, w: 12, col: 'var(--purple)' },
          { label: 'IVR / Outbound', cpl: 680, w: 28, col: 'var(--amber)' },
        ],
        blendedCpl: 985,
        mktgSpendCr: 4.8,
        sla: [
          { label: 'Digital (auto)', response: '<2 min', pct: 96, w: 96 },
          { label: 'IVR to Human', response: '8 min', pct: 88, w: 88 },
          { label: 'CP Lead', response: '22 min', pct: 74, w: 74 },
          { label: 'Walk-in', response: 'Instant', pct: 98, w: 98 },
          { label: 'Referral', response: '38 min', pct: 62, w: 62 },
        ],
        slaOverall: 78,
      },
      sales: {
        reps: [
          { name: 'Ravi Sharma', init: 'RS', proj: 'Emerald Heights', leads: 342, cl: 28, val: 52.4, conv: 8.2 },
          { name: 'Priya Menon', init: 'PM', proj: 'Azure Towers', leads: 318, cl: 24, val: 46.8, conv: 7.5 },
          { name: 'Arjun Nair', init: 'AN', proj: 'Sapphire Villas', leads: 284, cl: 22, val: 44.2, conv: 7.7 },
          { name: 'Sneha Patil', init: 'SP', proj: 'Emerald Heights', leads: 296, cl: 21, val: 38.6, conv: 7.1 },
          { name: 'Karan Mehta', init: 'KM', proj: 'Golden Gardens', leads: 312, cl: 20, val: 24.8, conv: 6.4 },
          { name: 'Divya Iyer', init: 'DI', proj: 'Horizon Residences', leads: 278, cl: 19, val: 28.4, conv: 6.8 },
          { name: 'Mohit Joshi', init: 'MJ', proj: 'Azure Towers', leads: 264, cl: 18, val: 34.6, conv: 6.8 },
          { name: 'Ananya Rao', init: 'AR', proj: 'Sapphire Villas', leads: 252, cl: 17, val: 33.2, conv: 6.7 },
          { name: 'Vikram Singh', init: 'VS', proj: 'Golden Gardens', leads: 248, cl: 15, val: 18.6, conv: 6.0 },
          { name: 'Pooja Desai', init: 'PD', proj: 'Horizon Residences', leads: 238, cl: 14, val: 20.8, conv: 5.9 },
        ],
        monthly: [
          { name: 'Ravi Sharma', tgt: 3, done: 3 }, { name: 'Priya Menon', tgt: 3, done: 2 },
          { name: 'Arjun Nair', tgt: 2, done: 2 }, { name: 'Sneha Patil', tgt: 3, done: 2 },
          { name: 'Karan Mehta', tgt: 2, done: 1 }, { name: 'Divya Iyer', tgt: 2, done: 2 },
          { name: 'Mohit Joshi', tgt: 2, done: 1 }, { name: 'Ananya Rao', tgt: 2, done: 2 },
        ],
        pipeline: [
          { name: 'Ravi Sharma', hot: 12, warm: 28, cold: 18 },
          { name: 'Priya Menon', hot: 9, warm: 24, cold: 21 },
          { name: 'Arjun Nair', hot: 8, warm: 20, cold: 19 },
          { name: 'Sneha Patil', hot: 7, warm: 22, cold: 20 },
          { name: 'Karan Mehta', hot: 6, warm: 18, cold: 24 },
          { name: 'Divya Iyer', hot: 8, warm: 16, cold: 18 },
          { name: 'Mohit Joshi', hot: 5, warm: 19, cold: 22 },
          { name: 'Ananya Rao', hot: 7, warm: 17, cold: 16 },
        ],
        activity: {
          calls: [142, 128, 118, 124, 132, 116, 108, 104],
          visits: [58, 52, 46, 48, 44, 42, 38, 36],
          proposals: [34, 30, 28, 26, 24, 22, 20, 18],
        },
        callsMonthly: [1820, 1960, 2100, 2240, 2180, 2350, 2480, 1920, 2100, 2280, 2200, 2320],
        connectRate: [48, 50, 52, 54, 51, 56, 58, 49, 53, 56, 54, 57],
        activeReps: 18, targetReps: 20, avgLeadsPerRep: 271, targetLeadsPerRep: 250,
        closuresPerRep: 18, targetClosuresPerRep: 21, followUp: 3.8, targetFollowUp: 4,
        avgDealLakh: 32.1, targetDealLakh: 30,
      },
    };
  }

  var charts = {};
  var currentData = null;
  var currentPeriod = 'fy2526';
  var LS_RP = 'ga_rp_projects';
  var LS_MS_FILTERS = 'ga_ms_command_filters_v1';
  var viewFilters = { projectId: '__all__', dateFrom: '', dateTo: '' };
  var lastViewData = null;

  function pct(a, b) {
    if (!b) return 0;
    return Math.round((a / b) * 1000) / 10;
  }

  function devClass(pctAch) {
    if (pctAch >= 95) return 'dev-ok';
    if (pctAch >= 80) return 'dev-warn';
    return 'dev-bad';
  }

  function periodSlice(period) {
    if (period === 'q2') return [3, 6];
    if (period === 'q3') return [6, 9];
    if (period === 'q4') return [9, 12];
    return [0, 12];
  }

  function sumArr(a, s, e) {
    var x = a || [];
    return x.slice(s, e).reduce(function (u, v) { return u + v; }, 0);
  }

  function mergeDeep(a, b) {
    if (!b || typeof b !== 'object') return a;
    Object.keys(b).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k]) mergeDeep(a[k], b[k]);
      else a[k] = b[k];
    });
    return a;
  }

  function normName(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function loadV3ActiveProjects() {
    try {
      var raw = localStorage.getItem(LS_RP);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (p) {
        return p && p.on !== false && String(p.status || '') === 'Active';
      });
    } catch (e) {
      return [];
    }
  }

  function parseYmd(s) {
    if (!s || typeof s !== 'string') return null;
    var p = s.split('-');
    if (p.length !== 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  }

  function monthIndexRangeInFY(fromStr, toStr, fyStartStr) {
    var fs = parseYmd(fyStartStr || '2025-04-01');
    var fromD = parseYmd(fromStr);
    var toD = parseYmd(toStr);
    if (!fs || !fromD || !toD || fromD > toD) return null;
    var i0 = 12;
    var i1 = -1;
    var fyY = fs.getFullYear();
    var fm = fs.getMonth();
    for (var i = 0; i < 12; i++) {
      var ms = new Date(fyY, fm + i, 1);
      var me = new Date(fyY, fm + i + 1, 0, 23, 59, 59, 999);
      if (me < fromD || ms > toD) continue;
      i0 = Math.min(i0, i);
      i1 = Math.max(i1, i);
    }
    if (i0 > 11 || i1 < 0) return null;
    return [i0, i1 + 1];
  }

  function applyProjectFilter(d, projectId) {
    if (!projectId || projectId === '__all__') return d;
    var v3list = loadV3ActiveProjects();
    var v3 = null;
    for (var i = 0; i < v3list.length; i++) {
      if (String(v3list[i].id) === String(projectId)) {
        v3 = v3list[i];
        break;
      }
    }
    if (!v3) return d;
    var key = normName(v3.name);
    var projs = (d.executive.projects || []).filter(function (p) {
      if (p.projectId && String(p.projectId) === String(projectId)) return true;
      var pn = normName(p.name);
      return pn === key || pn.indexOf(key) >= 0 || key.indexOf(pn) >= 0;
    });
    var totalRev = (d.executive.projects || []).reduce(function (s, p) { return s + (Number(p.revenueCr) || 0); }, 0) || 1;
    var poolRev = projs.reduce(function (s, p) { return s + (Number(p.revenueCr) || 0); }, 0);
    var r = poolRev / totalRev;
    if (!projs.length) {
      projs = [{ name: v3.name, revenueCr: 0, bookedUnits: 0, targetUnits: Number(v3.unt) || 0, col: C.gold, projectId: v3.id }];
      r = 0;
    }
    d.executive.projects = projs;
    d.executive.revenueCr = Math.round(poolRev * 10) / 10;
    d.executive.bookingCr = Math.round(d.executive.bookingCr * r * 10) / 10;
    d.executive.collectionsCr = Math.round(d.executive.collectionsCr * r * 10) / 10;
    d.executive.units = projs.reduce(function (s, p) { return s + (Number(p.bookedUnits) || 0); }, 0);
    function scaleArr(arr) {
      return (arr || []).map(function (x) { return Math.round(Number(x) * r * 10) / 10; });
    }
    d.executive.monthlyRevenue = scaleArr(d.executive.monthlyRevenue);
    d.executive.monthlyTarget = scaleArr(d.executive.monthlyTarget);
    d.executive.collectionsMonthly = {
      demand: scaleArr(d.executive.collectionsMonthly.demand),
      collected: scaleArr(d.executive.collectionsMonthly.collected),
    };
    var origLeads = d.operations.leads || 1;
    var reps = (d.sales.reps || []).filter(function (rep) {
      if (rep.projectId && String(rep.projectId) === String(projectId)) return true;
      var rp = normName(rep.proj);
      return rp === key || rp.indexOf(key) >= 0 || key.indexOf(rp) >= 0;
    });
    var leadSum = reps.reduce(function (s, x) { return s + (Number(x.leads) || 0); }, 0);
    var lr = origLeads ? Math.max(0.05, Math.min(1, leadSum / origLeads)) : r;
    if (!reps.length) lr = r;
    d.sales.reps = reps;
    var names = {};
    reps.forEach(function (x) { names[normName(x.name)] = 1; });
    d.sales.monthly = (d.sales.monthly || []).filter(function (x) { return names[normName(x.name)]; });
    d.sales.pipeline = (d.sales.pipeline || []).filter(function (x) { return names[normName(x.name)]; });
    d.operations.leads = Math.round(d.operations.leads * lr);
    d.operations.visits = Math.round(d.operations.visits * lr);
    d.operations.negotiation = Math.round(d.operations.negotiation * lr);
    d.operations.token = Math.round(d.operations.token * lr);
    d.operations.bookings = Math.round(d.operations.bookings * lr);
    d.operations.leadTrend = {
      leads: scaleArr(d.operations.leadTrend.leads),
      visits: scaleArr(d.operations.leadTrend.visits),
      bookings: scaleArr(d.operations.leadTrend.bookings),
    };
    d.operations.sources = (d.operations.sources || []).map(function (s) {
      return { name: s.name, val: Math.round((s.val || 0) * lr), col: s.col };
    });
    d.operations.channels = d.operations.channels || { labels: [], bookings: [], revenueCr: [] };
    d.operations.channels.bookings = (d.operations.channels.bookings || []).map(function (x) { return Math.round((x || 0) * lr); });
    d.operations.channels.revenueCr = (d.operations.channels.revenueCr || []).map(function (x) { return Math.round((x || 0) * lr * 10) / 10; });
    d.operations.roi = d.operations.roi || { labels: [], spendLakhs: [], roi: [] };
    d.operations.roi.spendLakhs = (d.operations.roi.spendLakhs || []).map(function (x) { return Math.round((x || 0) * lr * 10) / 10; });
    d.operations.cpl = (d.operations.cpl || []).map(function (r) {
      return Object.assign({}, r, { w: Math.max(0, Math.min(100, Math.round((r.w || 0) * lr))) });
    });
    d.operations.pipelineCr = Math.round((d.operations.pipelineCr || 0) * lr * 10) / 10;
    d.operations.warmLeads = Math.round((d.operations.warmLeads || 0) * lr);
    if (d.operations.cp) {
      d.operations.cp.leads = Math.round((d.operations.cp.leads || 0) * lr);
      d.operations.cp.bookings = Math.round((d.operations.cp.bookings || 0) * lr);
      d.operations.cp.spendLakhs = Math.round((d.operations.cp.spendLakhs || 0) * lr * 10) / 10;
      d.operations.cp.activePartners = Math.max(0, Math.round((d.operations.cp.activePartners || 0) * Math.sqrt(Math.max(0, lr))));
      d.operations.cp.leadToBookingPct = d.operations.cp.leads ? Math.round((d.operations.cp.bookings / d.operations.cp.leads) * 1000) / 10 : 0;
      d.operations.cp.shareOfLeadsPct = d.operations.leads ? Math.round((d.operations.cp.leads / d.operations.leads) * 1000) / 10 : 0;
    }
    d.sales.callsMonthly = scaleArr(d.sales.callsMonthly);
    d.sales.activity = d.sales.activity || { calls: [], visits: [], proposals: [] };
    d.sales.activity.calls = scaleArr(d.sales.activity.calls);
    d.sales.activity.visits = scaleArr(d.sales.activity.visits);
    d.sales.activity.proposals = scaleArr(d.sales.activity.proposals);
    d.sales.connectRate = (d.sales.connectRate || []).slice();
    if (d.sales.cpActivation) {
      d.sales.cpActivation.cpLeads = Math.round((d.sales.cpActivation.cpLeads || 0) * lr);
      d.sales.cpActivation.cpBookings = Math.round((d.sales.cpActivation.cpBookings || 0) * lr);
      d.sales.cpActivation.campaigns = Math.max(0, Math.round((d.sales.cpActivation.campaigns || 0) * Math.sqrt(Math.max(0, lr))));
    }
    return d;
  }

  function applyDateSliceToView(d, sl) {
    var i0 = sl[0];
    var i1 = sl[1];
    if (i1 <= i0) return;
    var span = (i1 - i0) / 12;
    var ex = d.executive;
    var t = d.targets;
    ex.revenueCr = Math.round(sumArr(ex.monthlyRevenue, i0, i1) * 10) / 10;
    t.revenueCr = Math.round(sumArr(ex.monthlyTarget, i0, i1) * 10) / 10;
    var colS = sumArr(ex.collectionsMonthly.collected, i0, i1);
    var demS = sumArr(ex.collectionsMonthly.demand, i0, i1);
    ex.collectionsCr = Math.round(colS * 10) / 10;
    t.collectionsCr = Math.round(t.collectionsCr * span * 10) / 10;
    ex.bookingCr = Math.round(ex.bookingCr * span * 10) / 10;
    t.bookingValueCr = Math.round(t.bookingValueCr * span * 10) / 10;
    t.unitsBooked = Math.max(1, Math.round(t.unitsBooked * span));
    ex.units = Math.max(0, Math.round(ex.units * span));
    var o = d.operations;
    o.leads = Math.round(o.leads * span);
    o.visits = Math.round(o.visits * span);
    o.negotiation = Math.round(o.negotiation * span);
    o.token = Math.round(o.token * span);
    o.bookings = Math.round(o.bookings * span);
    o.sources = (o.sources || []).map(function (s) { return { name: s.name, val: Math.round((s.val || 0) * span), col: s.col }; });
    o.channels = o.channels || { labels: [], bookings: [], revenueCr: [] };
    o.channels.bookings = (o.channels.bookings || []).map(function (x) { return Math.round((x || 0) * span); });
    o.channels.revenueCr = (o.channels.revenueCr || []).map(function (x) { return Math.round((x || 0) * span * 10) / 10; });
    o.roi = o.roi || { labels: [], spendLakhs: [], roi: [] };
    o.roi.spendLakhs = (o.roi.spendLakhs || []).map(function (x) { return Math.round((x || 0) * span * 10) / 10; });
    o.pipelineCr = Math.round((o.pipelineCr || 0) * span * 10) / 10;
    o.warmLeads = Math.round((o.warmLeads || 0) * span);
    if (o.cp) {
      o.cp.leads = Math.round((o.cp.leads || 0) * span);
      o.cp.bookings = Math.round((o.cp.bookings || 0) * span);
      o.cp.spendLakhs = Math.round((o.cp.spendLakhs || 0) * span * 10) / 10;
      o.cp.activePartners = Math.max(0, Math.round((o.cp.activePartners || 0) * Math.sqrt(Math.max(0, span))));
      o.cp.leadToBookingPct = o.cp.leads ? Math.round((o.cp.bookings / o.cp.leads) * 1000) / 10 : 0;
      o.cp.shareOfLeadsPct = o.leads ? Math.round((o.cp.leads / o.leads) * 1000) / 10 : 0;
    }
    var s = d.sales || {};
    s.activity = s.activity || { calls: [], visits: [], proposals: [] };
    s.activity.calls = (s.activity.calls || []).map(function (x) { return Math.round((x || 0) * span); });
    s.activity.visits = (s.activity.visits || []).map(function (x) { return Math.round((x || 0) * span); });
    s.activity.proposals = (s.activity.proposals || []).map(function (x) { return Math.round((x || 0) * span); });
    s.monthly = (s.monthly || []).map(function (r) {
      return { name: r.name, tgt: Math.max(1, Math.round((r.tgt || 0) * span)), done: Math.round((r.done || 0) * span) };
    });
    s.pipeline = (s.pipeline || []).map(function (r) {
      return { name: r.name, hot: Math.round((r.hot || 0) * span), warm: Math.round((r.warm || 0) * span), cold: Math.round((r.cold || 0) * span) };
    });
    if (s.cpActivation) {
      s.cpActivation.cpLeads = Math.round((s.cpActivation.cpLeads || 0) * span);
      s.cpActivation.cpBookings = Math.round((s.cpActivation.cpBookings || 0) * span);
      s.cpActivation.campaigns = Math.max(0, Math.round((s.cpActivation.campaigns || 0) * Math.sqrt(Math.max(0, span))));
    }
  }

  function getChartSlice(d) {
    var fy = (d.meta && d.meta.fyStart) || '2025-04-01';
    if (viewFilters.dateFrom && viewFilters.dateTo) {
      var dr = monthIndexRangeInFY(viewFilters.dateFrom, viewFilters.dateTo, fy);
      if (dr && dr[1] > dr[0]) return dr;
    }
    return periodSlice(currentPeriod);
  }

  function buildViewData() {
    var base = JSON.parse(JSON.stringify(currentData));
    base.meta = base.meta || {};
    if (!base.meta.fyStart) base.meta.fyStart = '2025-04-01';
    applyProjectFilter(base, viewFilters.projectId);
    var pr = getChartSlice(base);
    if (pr[1] <= pr[0]) pr = [0, 12];
    base._chartSlice = pr;
    if (viewFilters.dateFrom && viewFilters.dateTo) {
      var sl = monthIndexRangeInFY(viewFilters.dateFrom, viewFilters.dateTo, base.meta.fyStart);
      if (sl && sl[1] > sl[0]) applyDateSliceToView(base, sl);
    }
    return base;
  }

  function persistMsFilters() {
    try {
      localStorage.setItem(LS_MS_FILTERS, JSON.stringify(viewFilters));
    } catch (e) {}
  }

  function loadMsFilters() {
    try {
      var raw = localStorage.getItem(LS_MS_FILTERS);
      if (!raw) return;
      var o = JSON.parse(raw);
      if (o && typeof o === 'object') {
        if (o.projectId) viewFilters.projectId = o.projectId;
        if (o.dateFrom != null) viewFilters.dateFrom = o.dateFrom;
        if (o.dateTo != null) viewFilters.dateTo = o.dateTo;
      }
    } catch (e) {}
  }

  function populateProjectFilter() {
    var sel = document.getElementById('msProjectFilter');
    if (!sel) return;
    var cur = viewFilters.projectId;
    var act = loadV3ActiveProjects();
    sel.innerHTML = '<option value="__all__">All active projects (portfolio)</option>';
    act.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.name + ' (' + p.id + ')';
      sel.appendChild(o);
    });
    var ok = false;
    Array.prototype.forEach.call(sel.options, function (opt) {
      if (opt.value === cur) ok = true;
    });
    sel.value = ok ? cur : '__all__';
    viewFilters.projectId = sel.value;
  }

  function syncFilterInputs() {
    var df = document.getElementById('msDateFrom');
    var dt = document.getElementById('msDateTo');
    if (df) df.value = viewFilters.dateFrom || '';
    if (dt) dt.value = viewFilters.dateTo || '';
  }

  function updateFilterHint(d) {
    var el = document.getElementById('msFilterHint');
    if (!el) return;
    var parts = [];
    if (viewFilters.projectId && viewFilters.projectId !== '__all__') parts.push('Project filter on');
    if (viewFilters.dateFrom && viewFilters.dateTo) parts.push('Date range on · charts use FY months overlapping range');
    var n = loadV3ActiveProjects().length;
    if (!parts.length) el.textContent = n ? (n + ' active V3 project(s) — pick one to focus or load data per project in Excel.') : 'Open V3 Project Planning and save projects to sync the list (localStorage ga_rp_projects).';
    else el.textContent = parts.join(' · ');
  }

  function ensureFilterBar() {
    if (document.getElementById('msProjectFilter')) return;
    var ref = document.querySelector('.data-toolbar');
    var div = document.createElement('div');
    div.className = 'data-toolbar';
    div.style.paddingTop = '8px';
    div.style.paddingBottom = '8px';
    div.innerHTML =
      '<span style="color:var(--text-secondary);font-weight:600">Filters</span>' +
      '<label style="display:flex;flex-direction:column;gap:3px">' +
      '<span style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">Project (V3 active)</span>' +
      '<select class="layer-select" id="msProjectFilter" title="From Project Planning V3"></select></label>' +
      '<label style="display:flex;flex-direction:column;gap:3px">' +
      '<span style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">From</span>' +
      '<input type="date" id="msDateFrom" class="layer-select" style="color-scheme:dark"/></label>' +
      '<label style="display:flex;flex-direction:column;gap:3px">' +
      '<span style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">To</span>' +
      '<input type="date" id="msDateTo" class="layer-select" style="color-scheme:dark"/></label>' +
      '<button type="button" class="dash-btn" id="btnMsClearDates">Clear dates</button>' +
      '<button type="button" class="dash-btn" id="btnDownloadTemplate">Common Excel template</button>' +
      '<span class="data-status" id="msFilterHint" style="min-width:200px"></span>';
    if (ref && ref.parentNode) ref.parentNode.insertBefore(div, ref.nextSibling);
    else document.body.insertBefore(div, document.body.firstChild);
  }

  function wireFilterBar() {
    ensureFilterBar();
    var sel = document.getElementById('msProjectFilter');
    if (sel && !sel._wired) {
      sel._wired = true;
      sel.addEventListener('change', function () {
        viewFilters.projectId = sel.value;
        persistMsFilters();
        renderAll();
      });
    }
    var df = document.getElementById('msDateFrom');
    var dt = document.getElementById('msDateTo');
    if (df && !df._wired) {
      df._wired = true;
      df.addEventListener('change', function () {
        viewFilters.dateFrom = df.value || '';
        persistMsFilters();
        renderAll();
      });
    }
    if (dt && !dt._wired) {
      dt._wired = true;
      dt.addEventListener('change', function () {
        viewFilters.dateTo = dt.value || '';
        persistMsFilters();
        renderAll();
      });
    }
    var cl = document.getElementById('btnMsClearDates');
    if (cl && !cl._wired) {
      cl._wired = true;
      cl.addEventListener('click', function () {
        viewFilters.dateFrom = '';
        viewFilters.dateTo = '';
        syncFilterInputs();
        persistMsFilters();
        renderAll();
      });
    }
    var tpl = document.getElementById('btnDownloadTemplate');
    if (tpl && !tpl._wired) {
      tpl._wired = true;
      tpl.addEventListener('click', function () {
        downloadExcelTemplate();
      });
    }
  }

  function downloadExcelTemplate() {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS (XLSX) not loaded.');
      return;
    }
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['GA Command Centre — Excel import template'],
      ['Workbook includes: (A) dashboard-ready sheets for direct import and (B) raw/common source sheets.'],
      ['Direct import sheets: Summary, Executive_Projects, Operations_Funnel, Reps, Monthly_Series.'],
      ['Common source sheets: 01_Project_Master ... 12_Customer_Satisfaction (same headers as your architecture workbook).'],
      ['05_Leads: use Lead_Source = Channel_Partner (or broker in Sub_Source) for CP; Sub_Source = partner firm name.'],
      ['02_Bookings: Lead_Source column tags CP-sourced bookings for CP KPIs.'],
      ['FY month columns: Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec, Jan, Feb, Mar'],
    ]), '_Readme');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Key', 'Value'],
      ['fyStart', '2025-04-01'],
      ['revenueCr', 447],
      ['bookingCr', 578],
      ['collectionsCr', 412],
      ['units', 324],
    ]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['ProjectName', 'RevenueCr', 'BookedUnits', 'TargetUnits', 'ProjectId'],
      ['Emerald Heights', 152, 141, 160, 'P001'],
      ['Sapphire Villas', 118, 36, 48, 'P002'],
    ]), 'Executive_Projects');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Key', 'Value'],
      ['leads', 4872],
      ['visits', 1648],
      ['negotiation', 697],
      ['token', 391],
      ['bookings', 324],
    ]), 'Operations_Funnel');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Name', 'Init', 'Project', 'ProjectId', 'Leads', 'Closures', 'Value', 'Conv'],
      ['Ravi Sharma', 'RS', 'Emerald Heights', '', 342, 28, 52.4, 8.2],
    ]), 'Reps');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Metric', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'],
      ['monthlyRevenue', 32, 35, 38, 42, 40, 45, 48, 38, 42, 46, 44, 47],
      ['monthlyTarget', 40, 40, 42, 44, 43, 44, 45, 44, 45, 46, 46, 47],
    ]), 'Monthly_Series');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Project_ID','Project_Name','Project_Type','Segment','Location','City','Total_Units','Total_Area_sqft','Total_Project_Value_Cr','Launch_Date']]), '01_Project_Master');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Booking_ID','Booking_Date','Project_ID','Unit_Number','Tower_Block','Floor_Number','Unit_Type','Unit_Area_sqft','Booking_Value_Lakh','Token_Amount_Lakh','Sales_Rep_ID','Lead_Source'],
      ['B001','2025-06-01','P001','A-101','A','5','3 BHK',1850,420,5,'R01','Channel_Partner'],
      ['B002','2025-06-15','P001','B-202','B','8','2 BHK',1100,280,3,'R02','Walk_in'],
    ]), '02_Bookings');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Entry_ID','Month_Year','Project_ID','POC_Percentage','Revenue_Recognised_Cr','Cumulative_Revenue_Cr','Target_Revenue_Cr','Total_Bookings_Value_Cr','Remarks']]), '03_Revenue_Recognition');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Collection_ID','Collection_Date','Booking_ID','Customer_ID','Project_ID','Demand_Notice_Date','Demand_Amount_Lakh','Amount_Collected_Lakh','Outstanding_Lakh','Due_Date']]), '04_Collections');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Lead_ID','Lead_Date','Lead_Source','Sub_Source','Campaign_ID','Project_Interest','Configuration_Interest','Budget_Min_Lakh','Budget_Max_Lakh','Customer_Name'],
      ['L001','2025-06-01','Channel_Partner','ABC Realtors','C01','P001','3 BHK',80,120,'Sample CP lead'],
      ['L002','2025-06-02','Meta','Jan Promo','C02','P001','2 BHK',50,90,'Sample digital lead'],
    ]), '05_Leads');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Visit_ID','Visit_Date','Visit_Time','Lead_ID','Project_ID','Sales_Rep_ID','Visit_Count_For_Lead','Visit_Type','Units_Shown','Visit_Duration_Min']]), '06_Site_Visits');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Pipeline_ID','Lead_ID','Project_ID','Stage_Name','Stage_Sequence','Stage_Entry_Date','Stage_Exit_Date','Days_In_Stage','Stage_Outcome','Lost_Reason']]), '07_Pipeline_Stages');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Rep_ID','Rep_Name','Designation','Team','Reporting_Manager_ID','Project_Assignment','Date_Of_Joining','Employment_Type','Target_Units_Annual','Target_Value_Annual_Lakh']]), '08_Sales_Reps');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Activity_ID','Activity_Date','Activity_Time','Rep_ID','Lead_ID','Project_ID','Activity_Type','Duration_Min','Outcome','Follow_Up_Date']]), '09_Rep_Activity_Log');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Target_ID','Month_Year','Project_ID','Rep_ID','Target_Leads','Target_Site_Visits','Target_Bookings_Units','Target_Booking_Value_Lakh','Target_Collections_Cr','Target_Revenue_Cr']]), '10_Monthly_Targets');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Campaign_ID','Campaign_Name','Channel','Sub_Channel','Project_ID','Campaign_Objective','Start_Date','End_Date','Budget_Lakh','Actual_Spend_Lakh']]), '11_Marketing_Campaigns');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CSAT_ID','Survey_Date','Survey_Type','Customer_ID','Booking_ID','Project_ID','Sales_Rep_ID','CSAT_Score','NPS_Score','Sales_Experience_Rating']]), '12_Customer_Satisfaction');
    XLSX.writeFile(wb, 'GA_CommandCentre_common_template.xlsx');
  }

  function loadState() {
    var def = JSON.parse(JSON.stringify(DEFAULT_DATA()));
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) return mergeDeep(def, JSON.parse(raw));
    } catch (e) {}
    return def;
  }

  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(currentData));
    } catch (e) {}
  }

  function destroyChart(id) {
    if (charts[id]) {
      try { charts[id].destroy(); } catch (e) {}
      charts[id] = null;
    }
  }

  function setText(id, t) {
    var el = document.getElementById(id);
    if (el) el.textContent = t;
  }

  function renderExecKpis(d, ex) {
    var t = d.targets;
    var e = ex;
    var grid = document.getElementById('execKpis');
    if (!grid) return;

    var items = [
      { icon: '₹', label: 'Revenue Recognised', val: '₹' + e.revenueCr + ' ', small: 'Cr', ach: pct(e.revenueCr, t.revenueCr), yoy: e.yoy.revenue, tgt: 'of ₹' + t.revenueCr + ' Cr target' },
      { icon: '🏡', label: 'Booking Value', val: '₹' + e.bookingCr + ' ', small: 'Cr', ach: pct(e.bookingCr, t.bookingValueCr), yoy: e.yoy.booking, tgt: 'of ₹' + t.bookingValueCr + ' Cr target' },
      { icon: '💰', label: 'Collections', val: '₹' + e.collectionsCr + ' ', small: 'Cr', ach: pct(e.collectionsCr, t.collectionsCr), yoy: e.yoy.collections, tgt: 'of ₹' + t.collectionsCr + ' Cr target' },
      { icon: '🏢', label: 'Units Booked', val: String(e.units) + ' ', small: 'units', ach: pct(e.units, t.unitsBooked), yoy: e.yoy.units, tgt: 'of ' + t.unitsBooked + ' units target' },
      { icon: '📐', label: 'Avg Realization / sqft', val: '₹' + e.realizationSqft.toLocaleString('en-IN'), small: '', ach: pct(e.realizationSqft, e.marketAvgSqft), yoy: e.yoy.realization, tgt: 'Market avg ₹' + e.marketAvgSqft.toLocaleString('en-IN') },
    ];

    grid.innerHTML = items.map(function (it) {
      var dev = it.ach - 100;
      var devTxt = (dev >= 0 ? '+' : '') + dev.toFixed(1) + '% vs target';
      var cls = devClass(it.ach);
      var barW = Math.min(100, Math.max(0, it.ach));
      return (
        '<div class="kpi-card">' +
        '<div class="kpi-icon">' + it.icon + '</div>' +
        '<div class="kpi-label">' + it.label + '</div>' +
        '<div class="kpi-value">' + it.val + (it.small ? '<small>' + it.small + '</small>' : '') + '</div>' +
        '<div class="kpi-meta">' +
        '<span class="kpi-trend up">▲ ' + it.yoy + '% YoY</span>' +
        '<span class="kpi-target-txt">' + it.tgt + '</span></div>' +
        '<span class="dev-pill ' + cls + '">' + devTxt + '</span>' +
        '<div class="kpi-bar"><div class="kpi-bar-fill" style="width:' + barW + '%"></div></div></div>'
      );
    }).join('');

    var badges = document.getElementById('execBadges');
    if (badges) {
      var revOk = pct(e.revenueCr, t.revenueCr) >= 85;
      var cpLeadShare = (d.operations && d.operations.cp && d.operations.leads) ? Math.round((d.operations.cp.leads / Math.max(1, d.operations.leads)) * 100) : null;
      badges.innerHTML =
        '<span class="badge ' + (revOk ? 'badge-green' : 'badge-amber') + '">' + (revOk ? '▲' : '▼') + ' ' + pct(e.revenueCr, t.revenueCr).toFixed(0) + '% revenue vs target</span>' +
        (cpLeadShare != null ? '<span class="badge badge-blue">CP lead share ' + cpLeadShare + '%</span>' : '') +
        '<span class="badge badge-blue">' + (d.meta.label || '') + ' · snapshot</span>';
    }
  }

  function renderExecProjects(d) {
    var mount = document.getElementById('execProjectProg');
    if (!mount) return;
    var ex = d.executive;
    var totalB = 0;
    var totalT = 0;
    mount.innerHTML = ex.projects.map(function (p) {
      var ach = p.targetUnits ? pct(p.bookedUnits, p.targetUnits) : 0;
      totalB += p.bookedUnits;
      totalT += p.targetUnits;
      var pctCls = ach >= 85 ? 'up' : ach >= 70 ? 'neutral' : 'down';
      return (
        '<div class="prog-row">' +
        '<div class="prog-label">' + esc(p.name) + '</div>' +
        '<div class="prog-track"><div class="prog-fill" style="width:' + Math.min(100, ach) + '%;background:' + p.col + '"></div></div>' +
        '<div class="prog-val">' + p.bookedUnits + '</div>' +
        '<div class="prog-pct ' + pctCls + '">' + ach.toFixed(0) + '%</div></div>'
      );
    }).join('');
    setText('execUnitsSummaryVal', totalB + ' / ' + totalT + ' units');
    var dem = sumArr(ex.collectionsMonthly.demand, 0, 12);
    var col = sumArr(ex.collectionsMonthly.collected, 0, 12);
    var eff = dem ? pct(col, dem) : 0;
    setText('execDemandCr', '₹' + dem + ' Cr');
    setText('execColEff', eff.toFixed(1) + '%');
    setText('execPendingCr', '₹' + (dem - col) + ' Cr');
  }

  function renderOpsKpis(d) {
    var t = d.targets;
    var o = d.operations;
    var grid = document.getElementById('opsKpis');
    if (!grid) return;
    var l2b = o.leads ? pct(o.bookings, o.leads) : 0;
    var tgt = t.leadToBookingPct;
    var gap = l2b - tgt;
    var cp = o.cp || {};
    var cpShare = cp.shareOfLeadsPct != null ? cp.shareOfLeadsPct : (o.leads && cp.leads ? Math.round((cp.leads / o.leads) * 1000) / 10 : 0);
    var cpL2b = cp.leadToBookingPct != null ? cp.leadToBookingPct : (cp.leads ? Math.round((cp.bookings || 0) / cp.leads * 1000) / 10 : 0);
    var items = [
      { icon: '📥', label: 'Total Leads', val: o.leads.toLocaleString('en-IN'), sub: 'vs ' + t.leads + ' target', ach: pct(o.leads, t.leads), bar: pct(o.leads, t.leads), ycls: 'up' },
      { icon: '🏠', label: 'Site Visits', val: o.visits.toLocaleString('en-IN'), sub: o.leads ? pct(o.visits, o.leads).toFixed(1) + '% of leads' : '', ach: 100, bar: 78, ycls: 'up' },
      { icon: '🎯', label: 'Lead → Booking', val: l2b.toFixed(1) + ' ', small: '%', sub: 'Target ' + tgt + '%', ach: pct(l2b, tgt), bar: Math.min(100, pct(l2b, tgt)), ycls: gap < 0 ? 'down' : 'up' },
      { icon: '🤝', label: 'CP lead share', val: (cp.leads != null ? cp.leads : 0).toLocaleString('en-IN') + ' ', small: '(' + cpShare + '%)', sub: 'Broker / channel partner sourced', ach: Math.min(100, cpShare * 2), bar: Math.min(100, cpShare * 2), ycls: 'neutral' },
      { icon: '✅', label: 'CP lead → booking', val: cpL2b.toFixed(1) + ' ', small: '%', sub: (cp.bookings || 0) + ' CP-tagged bookings', ach: Math.min(100, cpL2b * 5), bar: Math.min(100, cpL2b * 5), ycls: cpL2b >= tgt ? 'up' : 'neutral' },
      { icon: '⏱', label: 'Avg Closure Days', val: String(o.avgClosureDays) + ' ', small: 'days', sub: 'Target <45 days', ach: 88, bar: 88, ycls: 'up' },
      { icon: '💼', label: 'Pipeline', val: '₹' + o.pipelineCr + ' ', small: 'Cr', sub: o.warmLeads + ' warm leads', ach: 72, bar: 72, ycls: 'up' },
    ];
    grid.innerHTML = items.map(function (it) {
      return (
        '<div class="kpi-card"><div class="kpi-icon">' + it.icon + '</div>' +
        '<div class="kpi-label">' + it.label + '</div>' +
        '<div class="kpi-value">' + it.val + (it.small ? '<small>' + it.small + '</small>' : '') + '</div>' +
        '<div class="kpi-meta"><span class="kpi-trend ' + it.ycls + '">' + it.sub + '</span></div>' +
        '<div class="kpi-bar"><div class="kpi-bar-fill" style="width:' + it.bar + '%"></div></div></div>'
      );
    }).join('');

    var badges = document.getElementById('opsBadges');
    if (badges) {
      var cp = o.cp || {};
      var cpCpl = cp.bookings ? Math.round((cp.spendLakhs || 0) * 100000 / cp.bookings) : 0;
      badges.innerHTML =
        '<span class="badge ' + (gap < 0 ? 'badge-amber' : 'badge-green') + '">Lead→Booking ' + (gap < 0 ? '▼' : '▲') + ' ' + Math.abs(gap).toFixed(1) + 'pp vs ' + tgt + '%</span>' +
        (cp.leads ? '<span class="badge badge-blue">CP leads ' + cp.leads + ' · CP bookings ' + (cp.bookings || 0) + '</span>' : '') +
        (cpCpl ? '<span class="badge badge-amber">CP cost/booking ₹' + cpCpl.toLocaleString('en-IN') + '</span>' : '') +
        '<span class="badge badge-green">Pipeline ₹' + o.pipelineCr + ' Cr</span>';
    }
  }

  function renderFunnel(d) {
    var el = document.getElementById('funnelMount');
    if (!el) return;
    var o = d.operations;
    var L = o.leads;
    var v = o.visits;
    var n = o.negotiation;
    var tk = o.token;
    var b = o.bookings;
    var w = function (x) { return L ? (x / L) * 100 : 0; };
    var stages = [
      { lbl: 'Leads Generated', n: L, wp: 100, col: 'linear-gradient(90deg,#C9A44A,#E8C96A)', tc: 'var(--gold)', span: L.toLocaleString('en-IN') + ' leads' },
      { lbl: 'Site Visits', n: v, wp: w(v), col: 'linear-gradient(90deg,#5B8DEF,#7AABFF)', tc: 'var(--blue)', span: String(v) },
      { lbl: 'Under Negotiation', n: n, wp: w(n), col: 'linear-gradient(90deg,#8B5CF6,#A87AFF)', tc: 'var(--purple)', span: String(n) },
      { lbl: 'Token / ATS', n: tk, wp: w(tk), col: 'linear-gradient(90deg,#F59E0B,#FBB13A)', tc: 'var(--amber)', span: String(tk) },
      { lbl: 'Bookings', n: b, wp: w(b), col: 'linear-gradient(90deg,#4CAF7D,#6DCFA0)', tc: 'var(--green)', span: String(b) },
    ];
    var html = '';
    for (var i = 0; i < stages.length; i++) {
      var s = stages[i];
      var prev = i ? stages[i - 1].n : L;
      var conv = prev ? ((s.n / prev) * 100).toFixed(1) : '100';
      html +=
        (i ? '<div class="funnel-conv">↓ &nbsp;' + conv + '% to next stage</div>' : '') +
        '<div class="funnel-row">' +
        '<div class="f-lbl">' + s.lbl + '</div>' +
        '<div class="f-bar-wrap"><div class="f-bar" style="width:' + Math.max(2, s.wp) + '%;background:' + s.col + '"><span>' + s.span + '</span></div></div>' +
        '<div class="f-meta"><div class="n" style="color:' + s.tc + '">' + s.n.toLocaleString('en-IN') + '</div><div class="p">' + s.wp.toFixed(1) + '%</div></div></div>';
    }
    el.innerHTML = html;
  }

  function renderCplSla(d) {
    var o = d.operations;
    setText('mktgSpend', '₹' + o.mktgSpendCr + ' Cr');
    setText('blendedCpl', '₹' + o.blendedCpl.toLocaleString('en-IN') + ' / Lead');
    setText('slaOverall', o.slaOverall + '%');
    var cpl = document.getElementById('cplMount');
    if (cpl) {
      cpl.innerHTML = o.cpl.map(function (r) {
        return (
          '<div class="prog-row">' +
          '<div class="prog-label">' + esc(r.label) + '</div>' +
          '<div class="prog-track"><div class="prog-fill" style="width:' + r.w + '%;background:' + r.col + '"></div></div>' +
          '<div class="prog-val" style="font-size:11px">₹' + r.cpl.toLocaleString('en-IN') + '</div></div>'
        );
      }).join('');
    }
    var sla = document.getElementById('slaMount');
    if (sla) {
      sla.innerHTML = o.sla.map(function (r) {
        var pc = r.pct >= 85 ? 'up' : r.pct >= 70 ? 'neutral' : 'down';
        return (
          '<div class="prog-row">' +
          '<div class="prog-label">' + esc(r.label) + '</div>' +
          '<div class="prog-track"><div class="prog-fill" style="width:' + r.w + '%;background:var(--green)"></div></div>' +
          '<div class="prog-val" style="font-size:11px">' + esc(r.response) + '</div>' +
          '<div class="prog-pct ' + pc + '">' + r.pct + '%</div></div>'
        );
      }).join('');
    }
  }

  function renderSalesKpis(d) {
    var s = d.sales;
    var t = d.targets;
    var cp = d.operations && d.operations.cp ? d.operations.cp : {};
    var cpA = s.cpActivation || {};
    var cpL2b = cp.leadToBookingPct != null ? cp.leadToBookingPct : (cp.leads ? Math.round(((cp.bookings || 0) / cp.leads) * 1000) / 10 : 0);
    var grid = document.getElementById('salesKpis');
    if (!grid) return;
    var items = [
      { icon: '👥', label: 'Active Reps', val: String(s.activeReps) + ' ', small: 'reps', sub: 'Target ' + s.targetReps, bar: pct(s.activeReps, s.targetReps) },
      { icon: '📊', label: 'Avg Leads / Rep', val: String(s.avgLeadsPerRep) + ' ', small: '/rep', sub: 'Target ' + s.targetLeadsPerRep, bar: Math.min(100, pct(s.avgLeadsPerRep, s.targetLeadsPerRep)) },
      { icon: '✅', label: 'Closures / Rep (YTD)', val: String(s.closuresPerRep) + ' ', small: '/rep', sub: 'Target ' + s.targetClosuresPerRep, bar: pct(s.closuresPerRep, s.targetClosuresPerRep) },
      { icon: '🤝', label: 'CP bookings (txn)', val: String(cpA.cpBookings || cp.bookings || 0) + ' ', small: 'bookings', sub: (cpA.cpLeads || cp.leads || 0) + ' CP leads in view', bar: Math.min(100, ((cpA.cpLeads || cp.leads || 0) ? (((cpA.cpBookings || cp.bookings || 0) / (cpA.cpLeads || cp.leads || 1)) * 100 * 5) : 0)) },
      { icon: '🧾', label: 'CP conversion (txn)', val: cpL2b.toFixed(1) + ' ', small: '%', sub: (cp.activePartners || 0) + ' active CP partners', bar: Math.min(100, cpL2b * 5) },
      { icon: '📞', label: 'Avg Follow-up', val: String(s.followUp) + ' ', small: '× / lead', sub: 'Target ' + s.targetFollowUp + '×', bar: pct(s.followUp, s.targetFollowUp) },
      { icon: '💎', label: 'Avg Deal / Rep', val: '₹' + s.avgDealLakh + ' ', small: 'L', sub: 'Target ₹' + s.targetDealLakh + ' L', bar: pct(s.avgDealLakh, s.targetDealLakh) },
    ];
    grid.innerHTML = items.map(function (it) {
      return (
        '<div class="kpi-card"><div class="kpi-icon">' + it.icon + '</div>' +
        '<div class="kpi-label">' + it.label + '</div>' +
        '<div class="kpi-value">' + it.val + '<small>' + it.small + '</small></div>' +
        '<div class="kpi-meta"><span class="kpi-trend neutral">' + it.sub + '</span></div>' +
        '<div class="kpi-bar"><div class="kpi-bar-fill" style="width:' + it.bar + '%"></div></div></div>'
      );
    }).join('');
    var badges = document.getElementById('salesBadges');
    if (badges && s.reps.length) {
      var top = s.reps[0];
      var below = s.reps.filter(function (r) { return r.conv < 6.5; }).length;
      var cpa = s.cpActivation || {};
      badges.innerHTML =
        '<span class="badge badge-green">Top: ' + esc(top.name) + ' — ' + top.cl + ' closures</span>' +
        (cpa.cpLeads ? '<span class="badge badge-blue">CP activation: ' + (cpa.campaigns || 0) + ' campaigns · ' + cpa.cpLeads + ' CP leads</span>' : '') +
        ((cp.leads || 0) ? '<span class="badge badge-blue">CP txn: ' + (cp.bookings || 0) + ' bookings · ' + cpL2b.toFixed(1) + '% conversion</span>' : '') +
        '<span class="badge badge-amber">⚠ ' + below + ' reps below 6.5% conv.</span>';
    }
  }

  function renderLeaderboard(d) {
    var reps = d.sales.reps;
    var body = document.getElementById('lbBody');
    if (!body) return;
    body.innerHTML = '';
    reps.forEach(function (r, i) {
      var rc = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rx';
      var cc = r.conv >= 7.5 ? C.green : r.conv >= 6.5 ? C.amber : C.red;
      var status = r.conv >= 7.5 ? '<span class="tag tg-green">On Fire</span>' : r.conv >= 6.5 ? '<span class="tag tg-amber">On Track</span>' : '<span style="background:var(--red-bg);color:var(--red)" class="tag">Needs Push</span>';
      body.innerHTML +=
        '<tr><td><span class="rank-badge ' + rc + '">' + (i + 1) + '</span></td>' +
        '<td><div class="rep-name"><div class="rep-av">' + esc(r.init) + '</div><span>' + esc(r.name) + '</span></div></td>' +
        '<td><span style="font-size:10.5px;color:var(--text-secondary)">' + esc(r.proj) + '</span></td>' +
        '<td>' + r.leads + '</td><td><strong style="color:var(--gold)">' + r.cl + '</strong></td>' +
        '<td><strong>₹' + r.val + 'L</strong></td>' +
        '<td><span style="color:' + cc + ';font-weight:700">' + r.conv + '%</span></td><td>' + status + '</td></tr>';
    });
  }

  function renderMonthlyPipeline(d) {
    var mt = document.getElementById('monthlyTracker');
    if (mt) {
      mt.innerHTML = '';
      d.sales.monthly.forEach(function (r) {
        var p = Math.round((r.done / r.tgt) * 100);
        var col = p === 100 ? C.green : p >= 50 ? C.amber : C.red;
        mt.innerHTML +=
          '<div class="prog-row"><div class="prog-label" style="font-size:11px">' + esc(r.name) + '</div>' +
          '<div class="prog-track"><div class="prog-fill" style="width:' + p + '%;background:' + col + '"></div></div>' +
          '<div class="prog-val" style="font-size:11px;color:' + col + '">' + r.done + '/' + r.tgt + '</div>' +
          '<div class="prog-pct" style="color:' + col + '">' + p + '%</div></div>';
      });
    }
    var pt = document.getElementById('pipelineTracker');
    if (pt) {
      pt.innerHTML = '';
      d.sales.pipeline.forEach(function (r) {
        var total = r.hot + r.warm + r.cold;
        var hotP = Math.round((r.hot / total) * 100);
        var warmP = Math.round((r.warm / total) * 100);
        pt.innerHTML +=
          '<div style="margin-bottom:9px"><div style="display:flex;justify-content:space-between;margin-bottom:3px">' +
          '<span style="font-size:11px;color:var(--text-secondary)">' + esc(r.name) + '</span>' +
          '<div style="display:flex;gap:8px;font-size:10px">' +
          '<span style="color:' + C.red + '">🔥 ' + r.hot + ' hot</span>' +
          '<span style="color:' + C.amber + '">⚡ ' + r.warm + ' warm</span>' +
          '<span style="color:var(--text-muted)">❄ ' + r.cold + ' cold</span></div></div>' +
          '<div style="display:flex;height:6px;border-radius:3px;overflow:hidden;gap:1px">' +
          '<div style="width:' + hotP + '%;background:' + C.red + ';border-radius:3px 0 0 3px"></div>' +
          '<div style="width:' + warmP + '%;background:' + C.amber + '"></div>' +
          '<div style="flex:1;background:var(--bg-card-2);border-radius:0 3px 3px 0"></div></div></div>';
      });
    }
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function buildInsights(d) {
    var out = [];
    var ex = d.executive;
    var t = d.targets;
    var revP = pct(ex.revenueCr, t.revenueCr);
    if (revP < 90) {
      out.push({ sev: 'high', owner: 'Leadership & project sales', title: 'Revenue behind plan', action: 'Review project-wise booking pace and pricing; align marketing weight to projects below target utilisation.' });
    }
    var o = d.operations;
    var l2b = o.leads ? pct(o.bookings, o.leads) : 0;
    if (l2b < t.leadToBookingPct) {
      out.push({ sev: 'med', owner: 'Marketing + CRM ops', title: 'Funnel conversion below target', action: 'Diagnose stage with largest drop (visits vs negotiation vs token). Tighten nurture and RM follow-up SLAs.' });
    }
    var worst = null;
    ex.projects.forEach(function (p) {
      var a = p.targetUnits ? pct(p.bookedUnits, p.targetUnits) : 0;
      if (!worst || a < worst.ach) worst = { name: p.name, ach: a };
    });
    if (worst && worst.ach < 75) {
      out.push({ sev: 'med', owner: 'Project lead', title: 'Project lagging: ' + worst.name, action: 'Site experience, inventory fit, or competitive pricing — run a focused war room for this micro-market.' });
    }
    var lowReps = d.sales.reps.filter(function (r) { return r.conv < 6.5; });
    if (lowReps.length >= 3) {
      out.push({ sev: 'med', owner: 'Sales leadership', title: String(lowReps.length) + ' reps below conversion benchmark', action: 'Coaching, shadowing, and territory rebalance; check lead quality mix by rep.' });
    }
    if (o.slaOverall < 80) {
      out.push({ sev: 'high', owner: 'Operations', title: 'Response SLA under stress', action: 'Staffing or routing on digital/IVR; automate first response where possible.' });
    }
    return out;
  }

  function renderInsights(d) {
    var el = document.getElementById('insightsBody');
    if (!el) return;
    var rows = buildInsights(d);
    if (!rows.length) {
      el.innerHTML = '<p style="color:var(--text-secondary);font-size:12px">No automated exceptions for the current view. Adjust project/date filters or refresh after new data.</p>';
      return;
    }
    el.innerHTML = rows.map(function (r) {
      return (
        '<div class="insight-card sev-' + (r.sev === 'high' ? 'high' : 'med') + '">' +
        '<div class="insight-owner">' + esc(r.owner) + '</div>' +
        '<div class="insight-title">' + esc(r.title) + '</div>' +
        '<div class="insight-action">' + esc(r.action) + '</div></div>'
      );
    }).join('');
  }

  function updateCharts(d) {
    var ex = d.executive;
    var o = d.operations;
    var s = d.sales;
    var pr = (d._chartSlice && d._chartSlice[1] > d._chartSlice[0]) ? d._chartSlice : periodSlice(currentPeriod);
    var labels = MONTHS.slice(pr[0], pr[1]);
    var revS = ex.monthlyRevenue.slice(pr[0], pr[1]);
    var tgtS = ex.monthlyTarget.slice(pr[0], pr[1]);
    var demS = ex.collectionsMonthly.demand.slice(pr[0], pr[1]);
    var colS = ex.collectionsMonthly.collected.slice(pr[0], pr[1]);
    var ltL = o.leadTrend.leads.slice(pr[0], pr[1]);
    var ltV = o.leadTrend.visits.slice(pr[0], pr[1]);
    var ltB = o.leadTrend.bookings.slice(pr[0], pr[1]);
    var callsS = s.callsMonthly.slice(pr[0], pr[1]);
    var connS = s.connectRate.slice(pr[0], pr[1]);

    destroyChart('revenueChart');
    charts.revenueChart = new Chart(document.getElementById('revenueChart'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Revenue (₹ Cr)', data: revS, backgroundColor: labels.map(function (_, i) { return 'rgba(201,164,74,' + (0.45 + i * 0.04) + ')'; }), borderColor: C.gold, borderWidth: 1, borderRadius: 4 },
          { label: 'Target (₹ Cr)', data: tgtS, type: 'line', borderColor: C.blue, borderWidth: 2, borderDash: [5, 4], pointRadius: 3, fill: false, tension: 0.3 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: Object.assign({}, tip, { callbacks: { label: function (c) { return ' ' + c.dataset.label + ': ₹' + c.parsed.y + ' Cr'; } } }) },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(201,164,74,0.06)' }, ticks: { callback: function (v) { return '₹' + v; } } },
        },
      },
    });

    destroyChart('projectDonut');
    charts.projectDonut = new Chart(document.getElementById('projectDonut'), {
      type: 'doughnut',
      data: {
        labels: ex.projects.map(function (p) { return p.name; }),
        datasets: [{ data: ex.projects.map(function (p) { return p.revenueCr; }), backgroundColor: ex.projects.map(function (p) { return p.col + '99'; }), borderColor: ex.projects.map(function (p) { return p.col; }), borderWidth: 1.5 }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: tip } },
    });
    var dLeg = document.getElementById('donutLegend');
    if (dLeg) {
      var tot = ex.projects.reduce(function (a, p) { return a + p.revenueCr; }, 0);
      dLeg.innerHTML = ex.projects.map(function (p) {
        return '<div class="legend-row"><div style="display:flex;align-items:center;gap:6px"><div class="legend-dot" style="background:' + p.col + '"></div><span class="legend-label">' + esc(p.name) + '</span></div><span class="legend-val">₹' + p.revenueCr + ' Cr</span></div>';
      }).join('');
    }

    destroyChart('collectionsChart');
    charts.collectionsChart = new Chart(document.getElementById('collectionsChart'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Demand', data: demS, backgroundColor: C.blueBg, borderColor: C.blue, borderWidth: 1, borderRadius: 3 },
          { label: 'Collected', data: colS, backgroundColor: C.greenBg, borderColor: C.green, borderWidth: 1, borderRadius: 3 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' }, tooltip: tip }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(201,164,74,0.06)' } } } },
    });

    var cs = ex.csat;
    destroyChart('csatGauge');
    charts.csatGauge = new Chart(document.getElementById('csatGauge'), {
      type: 'doughnut',
      data: { datasets: [{ data: [cs.score, 5 - cs.score], backgroundColor: [C.gold + 'CC', 'rgba(201,164,74,0.1)'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, circumference: 180, rotation: -90, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    });
    var csEl = document.getElementById('csatScore');
    if (csEl) csEl.innerHTML = cs.score + '<span style="font-size:14px;color:var(--text-secondary);font-family:\'Outfit\',sans-serif"> / 5.0</span>';
    setText('csatNps', '+' + cs.nps);
    setText('csatRepeat', cs.repeat + '%');
    setText('csatReferral', cs.referral + '%');

    destroyChart('sourceChart');
    charts.sourceChart = new Chart(document.getElementById('sourceChart'), {
      type: 'doughnut',
      data: {
        labels: o.sources.map(function (x) { return x.name; }),
        datasets: [{ data: o.sources.map(function (x) { return x.val; }), backgroundColor: o.sources.map(function (x) { return x.col + '88'; }), borderWidth: 1.5 }],
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false }, tooltip: tip } },
    });
    var sLeg = document.getElementById('sourceLegend');
    if (sLeg) {
      var totL = o.sources.reduce(function (a, x) { return a + x.val; }, 0);
      sLeg.innerHTML = o.sources.map(function (d) {
        var p = totL ? Math.round((d.val / totL) * 100) : 0;
        return '<div class="legend-row"><div style="display:flex;align-items:center;gap:6px"><div class="legend-dot" style="background:' + d.col + '"></div><span class="legend-label">' + esc(d.name) + '</span></div><div style="display:flex;gap:8px"><span class="legend-val">' + d.val.toLocaleString('en-IN') + '</span><span style="font-size:10px;color:var(--text-muted)">' + p + '%</span></div></div>';
      }).join('');
    }

    destroyChart('leadTrendChart');
    charts.leadTrendChart = new Chart(document.getElementById('leadTrendChart'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Leads', data: ltL, borderColor: C.gold, backgroundColor: C.goldBg, fill: true, tension: 0.4, borderWidth: 2 },
          { label: 'Visits', data: ltV, borderColor: C.blue, tension: 0.4, borderWidth: 2 },
          { label: 'Bookings', data: ltB, borderColor: C.green, tension: 0.4, borderWidth: 2 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: true, position: 'bottom' }, tooltip: tip }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(201,164,74,0.06)' } } } },
    });

    destroyChart('channelChart');
    charts.channelChart = new Chart(document.getElementById('channelChart'), {
      type: 'bar',
      data: {
        labels: o.channels.labels,
        datasets: [
          { label: 'Bookings', data: o.channels.bookings, backgroundColor: C.goldBg, borderColor: C.gold, borderWidth: 1, borderRadius: 3 },
          { label: 'Revenue ₹Cr', data: o.channels.revenueCr, backgroundColor: C.blueBg, borderColor: C.blue, borderWidth: 1, borderRadius: 3 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' }, tooltip: tip }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(201,164,74,0.06)' } } } },
    });

    destroyChart('roiChart');
    charts.roiChart = new Chart(document.getElementById('roiChart'), {
      type: 'bar',
      data: {
        labels: o.roi.labels,
        datasets: [
          { label: 'Spend (₹ L)', data: o.roi.spendLakhs, backgroundColor: C.redBg, borderColor: C.red, borderWidth: 1, borderRadius: 3 },
          { label: 'ROI index', data: o.roi.roi, backgroundColor: C.greenBg, borderColor: C.green, borderWidth: 1, borderRadius: 3 },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' }, tooltip: tip }, scales: { x: { grid: { display: false } }, y: { grid: { color: 'rgba(201,164,74,0.06)' } } } },
    });

    var top8 = s.reps.slice(0, 8);
    destroyChart('activityChart');
    charts.activityChart = new Chart(document.getElementById('activityChart'), {
      type: 'bar',
      data: {
        labels: top8.map(function (r) { return r.name.split(' ')[0]; }),
        datasets: [
          { label: 'Calls', data: s.activity.calls, backgroundColor: C.goldBg, borderColor: C.gold, borderWidth: 0 },
          { label: 'Visits', data: s.activity.visits, backgroundColor: C.blueBg, borderColor: C.blue, borderWidth: 0 },
          { label: 'Proposals', data: s.activity.proposals, backgroundColor: C.greenBg, borderColor: C.green, borderWidth: 0 },
        ],
      },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom' }, tooltip: tip }, scales: { x: { stacked: true }, y: { stacked: true } } },
    });

    destroyChart('callTrendChart');
    charts.callTrendChart = new Chart(document.getElementById('callTrendChart'), {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'Calls', data: callsS, borderColor: C.gold, backgroundColor: C.goldBg, fill: true, tension: 0.4, yAxisID: 'y' },
          { label: 'Connect %', data: connS, borderColor: C.teal, tension: 0.4, yAxisID: 'y1' },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'bottom' }, tooltip: tip },
        scales: {
          x: { grid: { display: false } },
          y: { grid: { color: 'rgba(201,164,74,0.06)' } },
          y1: { position: 'right', grid: { display: false }, ticks: { callback: function (v) { return v + '%'; } } },
        },
      },
    });

    destroyChart('scatterChart');
    charts.scatterChart = new Chart(document.getElementById('scatterChart'), {
      type: 'bubble',
      data: {
        datasets: [{
          label: 'Reps',
          data: s.reps.map(function (r) { return { x: r.leads, y: r.cl, r: Math.sqrt(r.val) * 1.4 }; }),
          backgroundColor: s.reps.map(function (_, i) { return [C.gold, C.blue, C.green, C.purple, C.amber, C.teal, C.red, C.green, C.blue, C.gold][i] + '88'; }),
          borderColor: s.reps.map(function (_, i) { return [C.gold, C.blue, C.green, C.purple, C.amber, C.teal, C.red, C.green, C.blue, C.gold][i]; }),
          borderWidth: 1.5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, tip, { callbacks: { label: function (c) {
            var pt = c.raw || c.parsed || {};
            var r = s.reps[c.dataIndex];
            return ' ' + (r ? r.name : '') + ': ' + (pt.x != null ? pt.x : '') + ' leads → ' + (pt.y != null ? pt.y : '') + ' closures';
          } } }),
        },
        scales: {
          x: { grid: { color: 'rgba(201,164,74,0.06)' }, title: { display: true, text: 'Leads' } },
          y: { grid: { color: 'rgba(201,164,74,0.06)' }, title: { display: true, text: 'Closures' } },
        },
      },
    });
  }

  function applyLayer() {
    var v = document.getElementById('layerSel') && document.getElementById('layerSel').value;
    document.body.className = '';
    if (v === 'board') document.body.classList.add('layer-board');
    else if (v === 'ops') document.body.classList.add('layer-ops');
    else if (v === 'sales') document.body.classList.add('layer-sales');
  }

  function renderAll() {
    loadMsFilters();
    wireFilterBar();
    populateProjectFilter();
    syncFilterInputs();
    var d = buildViewData();
    lastViewData = d;
    setText('asOfLabel', 'As of ' + new Date(currentData.meta.asOf || Date.now()).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }));
    updateFilterHint(d);
    renderExecKpis(d, d.executive);
    renderExecProjects(d);
    renderOpsKpis(d);
    renderFunnel(d);
    renderCplSla(d);
    renderSalesKpis(d);
    renderLeaderboard(d);
    renderMonthlyPipeline(d);
    renderInsights(d);
    if (document.getElementById('calendar') && document.getElementById('calendar').classList.contains('active')) {
      renderSalesCalendar();
    }
    updateCharts(d);
    applyLayer();
    try { global.GA_SALES_STATE = currentData; } catch (e) {}
    setText('dataStatus', 'Data loaded · ' + (localStorage.getItem(LS_KEY) ? 'saved in browser' : 'demo'));
  }

  function importJsonFile(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var j = JSON.parse(r.result);
        var def = JSON.parse(JSON.stringify(DEFAULT_DATA()));
        currentData = mergeDeep(def, j);
        currentData.meta = currentData.meta || {};
        currentData.meta.asOf = new Date().toISOString();
        saveState();
        renderAll();
      } catch (e) {
        alert('Invalid JSON: ' + e.message);
      }
    };
    r.readAsText(file);
  }

  function sheetToRows(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  }

  function normKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  /** True if CRM source/sub-source indicates channel partner / broker (flexible spelling). */
  function isCpLeadSource(s) {
    var n = normKey(s);
    if (!n) return false;
    if (n.indexOf('channelpartner') >= 0 || n.indexOf('channelpartners') >= 0) return true;
    if (n === 'cp' || n.indexOf('cplead') >= 0 || n.indexOf('cp_') === 0) return true;
    if (n.indexOf('broker') >= 0) return true;
    if (n.indexOf('chpartner') >= 0) return true;
    if (n.indexOf('partner') >= 0 && (n.indexOf('channel') >= 0 || n.indexOf('sales') >= 0)) return true;
    return false;
  }
  function rowLooksCp(r) {
    return isCpLeadSource(r.leadsource || r.lead_source) || isCpLeadSource(r.subsource || r.sub_source);
  }
  function toNum(v) { var n = Number(v); return isNaN(n) ? 0 : n; }
  function toYmd(v) {
    if (!v) return null;
    if (typeof v === 'string') {
      var m = v.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
    }
    var d = new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function salesEvStatus(ymd) {
    if (!ymd || !global.GAActivityCalendar) return undefined;
    var today = GAActivityCalendar.todayYmd();
    if (ymd < today) return 'overdue';
    if (ymd === today) return 'today';
    return undefined;
  }
  function buildCalendarEvents(data) {
    var events = [];
    (data.calendarEvents || []).forEach(function (ev, i) {
      var ymd = toYmd(ev.date);
      if (!ymd) return;
      events.push({
        id: ev.id || ('ce-' + i),
        date: ymd,
        title: ev.title || 'Activity',
        color: ev.color || '#14b8a6',
        status: salesEvStatus(ymd)
      });
    });
    if (events.length) return events;
    var fyStart = (data.meta && data.meta.fyStart) || '2025-04-01';
    var parts = fyStart.split('-');
    var fyY = Number(parts[0]) || 2025;
    var fyM = Number(parts[1]) - 1 || 3;
    for (var i = 0; i < 12; i += 1) {
      var end = new Date(fyY, fyM + i + 1, 0);
      var ymd = toYmd(end);
      var tgt = (data.executive && data.executive.monthlyTarget) ? data.executive.monthlyTarget[i] : 0;
      if (!tgt) continue;
      events.push({
        id: 'tgt-' + i,
        date: ymd,
        title: 'Revenue target review · ' + MONTHS[i],
        color: '#5B8DEF',
        status: salesEvStatus(ymd)
      });
    }
    return events;
  }
  var _salesCalApi = null;
  function renderSalesCalendar() {
    var root = document.getElementById('sales-cal-root');
    if (!root || !global.GAActivityCalendar) return;
    var d = lastViewData || currentData;
    if (!_salesCalApi) {
      _salesCalApi = GAActivityCalendar.mount(root, {
        title: 'Sales command centre',
        subtitle: 'Visits · follow-ups · targets',
        accent: '#14b8a6',
        getEvents: function () { return buildCalendarEvents(d || currentData || {}); },
        legend: [
          { color: '#14b8a6', label: 'CRM activity' },
          { color: '#5B8DEF', label: 'Monthly target' }
        ],
        onEventClick: function (ev) { alert(ev.title || 'Activity'); }
      });
    } else {
      _salesCalApi.refresh();
    }
  }
  function detectHeaderIndex(rows, wanted) {
    for (var i = 0; i < Math.min(rows.length, 20); i++) {
      var r = rows[i] || [];
      var hit = 0;
      for (var j = 0; j < r.length; j++) if (wanted[normKey(r[j])]) hit++;
      if (hit >= 2) return i;
    }
    return -1;
  }
  function rowsToObjects(rows, headerIdx) {
    if (headerIdx < 0 || headerIdx >= rows.length) return [];
    var hdr = rows[headerIdx] || [];
    var out = [];
    for (var i = headerIdx + 1; i < rows.length; i++) {
      var row = rows[i] || [];
      var obj = {};
      var used = 0;
      for (var c = 0; c < hdr.length; c++) {
        var k = normKey(hdr[c]);
        if (!k) continue;
        obj[k] = row[c];
        if (row[c] !== null && row[c] !== '') used++;
      }
      if (used) out.push(obj);
    }
    return out;
  }
  function startsWith01to12(name) {
    var n = String(name || '').toLowerCase();
    return /^(0[1-9]|1[0-2])_/.test(n);
  }
  function aggregateRawWorkbook(wb, base) {
    var data = JSON.parse(JSON.stringify(base));
    var hasRaw = wb.SheetNames.some(startsWith01to12);
    if (!hasRaw) return null;
    var by = {};
    wb.SheetNames.forEach(function (sn) { by[String(sn || '').toLowerCase()] = sn; });
    function getRows(pref) {
      var k = Object.keys(by).find(function (x) { return x.indexOf(pref) === 0; });
      if (!k) return [];
      return sheetToRows(wb.Sheets[by[k]]);
    }
    var projRows = rowsToObjects(getRows('01_project_master'), detectHeaderIndex(getRows('01_project_master'), { projectid: 1, projectname: 1 }));
    var bookingRows = rowsToObjects(getRows('02_bookings'), detectHeaderIndex(getRows('02_bookings'), { bookingid: 1, bookingvaluelakh: 1, projectid: 1 }));
    var revRows = rowsToObjects(getRows('03_revenue_recognition'), detectHeaderIndex(getRows('03_revenue_recognition'), { monthyear: 1, revenuerecognisedcr: 1, targetrevenuecr: 1 }));
    var colRows = rowsToObjects(getRows('04_collections'), detectHeaderIndex(getRows('04_collections'), { demandamountlakh: 1, amountcollectedlakh: 1 }));
    var leadRows = rowsToObjects(getRows('05_leads'), detectHeaderIndex(getRows('05_leads'), { leadid: 1, leadsource: 1 }));
    var visitRows = rowsToObjects(getRows('06_site_visits'), detectHeaderIndex(getRows('06_site_visits'), { visitid: 1, leadid: 1, projectid: 1 }));
    var pipeRows = rowsToObjects(getRows('07_pipeline_stages'), detectHeaderIndex(getRows('07_pipeline_stages'), { piplineid: 1, stagename: 1, leadid: 1, pipelineid: 1 }));
    var repRows = rowsToObjects(getRows('08_sales_reps'), detectHeaderIndex(getRows('08_sales_reps'), { repid: 1, repname: 1 }));
    var actRows = rowsToObjects(getRows('09_rep_activity_log'), detectHeaderIndex(getRows('09_rep_activity_log'), { activityid: 1, repid: 1, activitytype: 1 }));
    var tgtRows = rowsToObjects(getRows('10_monthly_targets'), detectHeaderIndex(getRows('10_monthly_targets'), { targetid: 1, monthyear: 1, targetbookingsunits: 1 }));
    var campRows = rowsToObjects(getRows('11_marketing_campaigns'), detectHeaderIndex(getRows('11_marketing_campaigns'), { campaignid: 1, channel: 1, actualspendlakh: 1 }));
    var csatRows = rowsToObjects(getRows('12_customer_satisfaction'), detectHeaderIndex(getRows('12_customer_satisfaction'), { csatid: 1, csatscore: 1, npsscore: 1 }));

    if (projRows.length) {
      data.executive.projects = projRows.slice(0, 12).map(function (p, i) {
        return {
          name: p.projectname || p.projectid || ('Project ' + (i + 1)),
          revenueCr: 0,
          bookedUnits: 0,
          targetUnits: Math.round(toNum(p.totalunits)),
          col: [C.gold, C.blue, C.green, C.purple, C.amber][i % 5],
          projectId: p.projectid || undefined
        };
      });
    }
    var pMap = {};
    data.executive.projects.forEach(function (p) { pMap[normKey(p.projectid || p.name)] = p; });
    bookingRows.forEach(function (b) {
      var id = normKey(b.projectid);
      var p = pMap[id];
      if (!p) return;
      p.bookedUnits += 1;
      p.revenueCr += toNum(b.bookingvaluelakh) / 100;
    });
    data.executive.revenueCr = data.executive.projects.reduce(function (s, p) { return s + toNum(p.revenueCr); }, 0);
    data.executive.units = data.executive.projects.reduce(function (s, p) { return s + toNum(p.bookedUnits); }, 0);
    data.executive.bookingCr = bookingRows.reduce(function (s, b) { return s + toNum(b.bookingvaluelakh) / 100; }, 0);
    var demCr = colRows.reduce(function (s, r) { return s + toNum(r.demandamountlakh) / 100; }, 0);
    var colCr = colRows.reduce(function (s, r) { return s + toNum(r.amountcollectedlakh) / 100; }, 0);
    data.executive.collectionsCr = colCr;
    data.executive.collectionsMonthly = data.executive.collectionsMonthly || { demand: new Array(12).fill(0), collected: new Array(12).fill(0) };
    data.executive.collectionsMonthly.demand = new Array(12).fill(0);
    data.executive.collectionsMonthly.collected = new Array(12).fill(0);
    var monthIdx = { jan: 9, feb: 10, mar: 11, apr: 0, may: 1, jun: 2, jul: 3, aug: 4, sep: 5, oct: 6, nov: 7, dec: 8 };
    revRows.forEach(function (r) {
      var d = new Date(r.monthyear || r.month || '');
      var key = isNaN(d.getTime()) ? normKey(String(r.monthyear || '').slice(0, 3)) : normKey(d.toLocaleString('en-US', { month: 'short' }));
      var i = monthIdx[key];
      if (i == null) return;
      data.executive.monthlyRevenue[i] += toNum(r.revenuerecognisedcr);
      data.executive.monthlyTarget[i] += toNum(r.targetrevenuecr);
    });
    if (!data.executive.monthlyRevenue.some(function (x) { return x > 0; })) {
      data.executive.monthlyRevenue = data.executive.monthlyRevenue || new Array(12).fill(0);
    }
    data.operations.leads = leadRows.length || data.operations.leads;
    data.operations.visits = visitRows.length || data.operations.visits;
    data.operations.bookings = bookingRows.length || data.operations.bookings;
    var stageCounts = { negotiation: 0, token: 0 };
    pipeRows.forEach(function (r) {
      var st = normKey(r.stagename);
      if (st.indexOf('negotiat') >= 0) stageCounts.negotiation++;
      if (st.indexOf('token') >= 0 || st.indexOf('ats') >= 0) stageCounts.token++;
    });
    data.operations.negotiation = stageCounts.negotiation || data.operations.negotiation;
    data.operations.token = stageCounts.token || data.operations.token;
    var src = {};
    leadRows.forEach(function (r) {
      var s = String(r.leadsource || 'Unknown');
      src[s] = (src[s] || 0) + 1;
    });
    var srcKeys = Object.keys(src);
    if (srcKeys.length) data.operations.sources = srcKeys.map(function (k, i) { return { name: k, val: src[k], col: [C.blue, C.gold, C.green, C.purple, C.amber][i % 5] }; });
    var cpLead = leadRows.filter(rowLooksCp).length;
    var cpBk = bookingRows.filter(function (r) {
      return isCpLeadSource(r.sourcetype || r.channel || r.leadsource || r.lead_source || r.sourcesegment);
    }).length;
    var cpCamp = campRows.filter(function (r) { return normKey(r.channel).indexOf('partner') >= 0 || normKey(r.channel).indexOf('channel') >= 0; });
    var cpSpend = cpCamp.reduce(function (s, r) { return s + toNum(r.actualspendlakh); }, 0);
    var cpPartnerNames = leadRows.filter(rowLooksCp).map(function (r) { return String(r.subsource || r.sub_source || '').trim(); }).filter(function (x) { return x; });
    data.operations.cp = {
      leads: cpLead,
      bookings: cpBk,
      spendLakhs: cpSpend,
      activePartners: new Set(cpPartnerNames).size,
      leadToBookingPct: cpLead ? Math.round((cpBk / cpLead) * 1000) / 10 : 0,
      shareOfLeadsPct: data.operations.leads ? Math.round((cpLead / data.operations.leads) * 1000) / 10 : 0
    };
    var reps = repRows.map(function (r, i) {
      var id = r.repid;
      var acts = actRows.filter(function (a) { return String(a.repid || '') === String(id || ''); });
      var leads = acts.filter(function (a) { return normKey(a.activitytype).indexOf('call') >= 0; }).length;
      var cl = bookingRows.filter(function (b) { return String(b.salesrepid || '') === String(id || ''); }).length;
      var val = bookingRows.filter(function (b) { return String(b.salesrepid || '') === String(id || ''); }).reduce(function (s, b) { return s + toNum(b.bookingvaluelakh); }, 0);
      var conv = leads ? Math.round((cl / leads) * 1000) / 10 : 0;
      return { name: r.repname || ('Rep ' + (i + 1)), init: String(r.repname || 'R').slice(0, 2).toUpperCase(), proj: r.projectassignment || '', leads: leads, cl: cl, val: Math.round(val) / 1, conv: conv };
    }).filter(function (x) { return x.name; });
    if (reps.length) data.sales.reps = reps;
    data.sales.activeReps = repRows.length || data.sales.activeReps;
    data.sales.cpActivation = {
      campaigns: cpCamp.length,
      cpLeads: cpLead,
      cpBookings: cpBk
    };
    if (csatRows.length) {
      var avg = csatRows.reduce(function (s, r) { return s + toNum(r.csatscore); }, 0) / csatRows.length;
      var npsRaw = csatRows.map(function (r) { return toNum(r.npsscore); });
      var prom = npsRaw.filter(function (x) { return x >= 9; }).length;
      var det = npsRaw.filter(function (x) { return x <= 6; }).length;
      data.executive.csat.score = Math.round(avg * 10) / 10 || data.executive.csat.score;
      data.executive.csat.nps = npsRaw.length ? Math.round(((prom - det) / npsRaw.length) * 100) : data.executive.csat.nps;
    }
    var calEvents = [];
    visitRows.forEach(function (r, i) {
      var ymd = toYmd(r.visitdate || r.visit_date);
      if (!ymd) return;
      calEvents.push({ id: 'vis-' + i, date: ymd, title: 'Site visit · ' + (r.leadid || r.lead_id || 'Lead'), color: '#14b8a6' });
    });
    actRows.forEach(function (r, i) {
      var ymd = toYmd(r.followupdate || r.follow_up_date || r.activitydate || r.activity_date);
      if (!ymd) return;
      calEvents.push({ id: 'act-' + i, date: ymd, title: (r.activitytype || 'Follow-up') + ' · ' + (r.repid || r.rep_id || 'Rep'), color: '#8B5CF6' });
    });
    colRows.forEach(function (r, i) {
      var ymd = toYmd(r.duedate || r.due_date);
      if (!ymd) return;
      calEvents.push({ id: 'col-' + i, date: ymd, title: 'Collection due · ' + (r.projectid || r.project_id || 'Project'), color: '#F59E0B' });
    });
    campRows.forEach(function (r, i) {
      var s = toYmd(r.startdate || r.start_date);
      var e = toYmd(r.enddate || r.end_date);
      if (s) calEvents.push({ id: 'camp-s-' + i, date: s, title: 'Campaign start · ' + (r.campaignname || r.channel || 'Campaign'), color: '#C9A44A' });
      if (e) calEvents.push({ id: 'camp-e-' + i, date: e, title: 'Campaign end · ' + (r.campaignname || r.channel || 'Campaign'), color: '#E05C5C' });
    });
    data.calendarEvents = calEvents;
    data.meta = data.meta || {};
    data.meta.rawSource = true;
    return data;
  }

  function importExcel(file) {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS (XLSX) did not load. Check your network and reload.');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var base = currentData ? JSON.parse(JSON.stringify(currentData)) : JSON.parse(JSON.stringify(DEFAULT_DATA()));
        var translated = aggregateRawWorkbook(wb, base);
        if (translated) {
          translated.meta = translated.meta || {};
          translated.meta.asOf = new Date().toISOString();
          currentData = translated;
          saveState();
          renderAll();
          return;
        }
        wb.SheetNames.forEach(function (name) {
          var sh = wb.Sheets[name];
          var n = name.toLowerCase().replace(/\s+/g, '');
          var rows = sheetToRows(sh);
          if (n.indexOf('executive_projects') >= 0 || n === 'executiveprojects') {
            var hdr = rows[0];
            if (!hdr || !hdr.length) return;
            var ix = {};
            hdr.forEach(function (h, i) {
              ix[String(h || '').toLowerCase().replace(/\s+/g, '')] = i;
            });
            var plist = [];
            for (var ri = 1; ri < rows.length; ri++) {
              var row = rows[ri];
              if (!row || row.length < 2) continue;
              var pcol = ix.projectname != null ? ix.projectname : ix.name;
              var pname = pcol != null ? row[pcol] : null;
              if (!pname) continue;
              plist.push({
                name: pname,
                revenueCr: Number(row[ix.revenuecr]) || 0,
                bookedUnits: Number(row[ix.bookedunits]) || 0,
                targetUnits: Number(row[ix.targetunits]) || 0,
                col: [C.gold, C.blue, C.green, C.purple, C.amber][plist.length % 5],
                projectId: row[ix.projectid] || undefined,
              });
            }
            if (plist.length) base.executive.projects = plist;
            return;
          }
          if (n.indexOf('monthly_series') >= 0 || n === 'monthlyseries') {
            var h0 = rows[0];
            if (!h0 || h0.length < 13) return;
            for (var rj = 1; rj < rows.length; rj++) {
              var rw = rows[rj];
              if (!rw || !rw[0]) continue;
              var mk = String(rw[0] || '').toLowerCase().replace(/\s+/g, '');
              var nums = [];
              for (var c = 1; c <= 12; c++) nums.push(Number(rw[c]) || 0);
              if (mk === 'monthlyrevenue') base.executive.monthlyRevenue = nums;
              if (mk === 'monthlytarget') base.executive.monthlyTarget = nums;
            }
            return;
          }
          if ((n.indexOf('executive') >= 0 || n === 'summary') && n.indexOf('executive_projects') < 0 && n !== 'executiveprojects') {
            rows.forEach(function (row) {
              if (!row || row.length < 2) return;
              var k = String(row[0] || '').toLowerCase().replace(/\s+/g, '');
              var v = row[1];
              if (k === 'fystart' && typeof v === 'string') base.meta.fyStart = v;
              if (k === 'revenuecr' && typeof v === 'number') base.executive.revenueCr = v;
              if (k === 'bookingcr' && typeof v === 'number') base.executive.bookingCr = v;
              if (k === 'collectionscr' && typeof v === 'number') base.executive.collectionsCr = v;
              if (k === 'units' && typeof v === 'number') base.executive.units = v;
            });
          }
          if (n.indexOf('operations') >= 0 || n === 'funnel') {
            rows.forEach(function (row) {
              if (!row || row.length < 2) return;
              var k = String(row[0] || '').toLowerCase().replace(/\s+/g, '');
              var v = row[1];
              if (k === 'leads' && typeof v === 'number') base.operations.leads = v;
              if (k === 'visits' && typeof v === 'number') base.operations.visits = v;
              if (k === 'negotiation' && typeof v === 'number') base.operations.negotiation = v;
              if (k === 'token' && typeof v === 'number') base.operations.token = v;
              if (k === 'bookings' && typeof v === 'number') base.operations.bookings = v;
            });
          }
          if (n.indexOf('rep') >= 0 || n === 'sales') {
            var hdr = rows[0];
            if (!hdr || !hdr.length) return;
            var idx = {};
            hdr.forEach(function (h, i) {
              idx[String(h || '').toLowerCase().replace(/\s+/g, '')] = i;
            });
            var list = [];
            for (var r = 1; r < rows.length; r++) {
              var row = rows[r];
              if (!row || !row[idx.name]) continue;
              list.push({
                name: row[idx.name],
                init: (row[idx.init] || String(row[idx.name]).slice(0, 2)).toUpperCase(),
                proj: row[idx.project || idx.proj] || '',
                projectId: row[idx.projectid] || undefined,
                leads: Number(row[idx.leads]) || 0,
                cl: Number(row[idx.closures || idx.closure]) || 0,
                val: Number(row[idx.value || 'valuelakh']) || 0,
                conv: Number(row[idx.conv || idx.conversion]) || 0,
              });
            }
            if (list.length) base.sales.reps = list;
          }
        });
        base.meta = base.meta || {};
        base.meta.asOf = new Date().toISOString();
        currentData = base;
        saveState();
        renderAll();
      } catch (err) {
        alert('Excel error: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  window.switchTab = function (id, btn) {
    document.querySelectorAll('.tab-content').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.gov-tab').forEach(function (b) { b.classList.remove('active'); });
    document.getElementById(id).classList.add('active');
    btn.classList.add('active');
    if (id === 'calendar') renderSalesCalendar();
  };

  window.updatePeriod = function (v) {
    currentPeriod = v;
    var labels = { fy2526: 'FY 2025–26 YTD', q4: 'Q4 FY 2025–26 (Jan–Mar)', q3: 'Q3 FY 2025–26 (Oct–Dec)', q2: 'Q2 FY 2025–26 (Jul–Sep)' };
    setText('execTitle', 'Business Performance · ' + labels[v]);
    setText('opsTitle', 'Operational Health · ' + labels[v]);
    var st = document.querySelector('#salesteam .sec-title');
    if (st) st.textContent = 'Sales Team Productivity · ' + labels[v];
    renderAll();
  };

  window.refreshDash = function (btn) {
    renderAll();
    if (btn) {
      btn.style.transform = 'rotate(720deg)';
      btn.style.transition = 'transform 0.7s ease';
      setTimeout(function () { btn.style.transform = ''; btn.style.transition = ''; }, 700);
    }
  };

  window.exportCSV = function () {
    var reps = (lastViewData && lastViewData.sales && lastViewData.sales.reps) ? lastViewData.sales.reps : currentData.sales.reps;
    var rows = [['Rank', 'Name', 'Project', 'Leads', 'Closures', 'Value (₹L)', 'Conv%']];
    reps.forEach(function (r, i) {
      rows.push([i + 1, r.name, r.proj, r.leads, r.cl, r.val, r.conv + '%']);
    });
    var csv = rows.map(function (r) { return r.join(','); }).join('\n');
    var a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'GA_Sales_Leaderboard.csv';
    a.click();
  };

  window.exportDashboardJson = function () {
    var blob = new Blob([JSON.stringify(currentData, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'GA_CommandCentre_data.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };

  document.addEventListener('DOMContentLoaded', function () {
    loadMsFilters();
    currentData = loadState();
    document.getElementById('fileJson') && document.getElementById('fileJson').addEventListener('change', function (ev) {
      var f = ev.target.files[0];
      ev.target.value = '';
      if (f) importJsonFile(f);
    });
    document.getElementById('fileXlsx') && document.getElementById('fileXlsx').addEventListener('change', function (ev) {
      var f = ev.target.files[0];
      ev.target.value = '';
      if (f) importExcel(f);
    });
    document.getElementById('btnExportJson') && document.getElementById('btnExportJson').addEventListener('click', exportDashboardJson);
    document.getElementById('btnReset') && document.getElementById('btnReset').addEventListener('click', function () {
      localStorage.removeItem(LS_KEY);
      currentData = JSON.parse(JSON.stringify(DEFAULT_DATA()));
      saveState();
      renderAll();
    });
    document.getElementById('layerSel') && document.getElementById('layerSel').addEventListener('change', applyLayer);

    Chart.defaults.color = '#8890AA';
    Chart.defaults.borderColor = 'rgba(201,164,74,0.07)';
    Chart.defaults.font.family = "'Outfit', sans-serif";
    Chart.defaults.font.size = 11;

    renderAll();
  });
  window.addEventListener('storage', function (ev) {
    if (!ev) return;
    if (ev.key === LS_RP || ev.key === LS_KEY || ev.key === LS_MS_FILTERS) renderAll();
  });
})();
