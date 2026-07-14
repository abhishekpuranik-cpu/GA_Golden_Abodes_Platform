/**
 * Shared month activity calendar for vault HTML apps.
 * GAActivityCalendar.mount(el, { title, subtitle, accent, getEvents, legend, onEventClick })
 * getEvents() => [{ id, date:'YYYY-MM-DD', title, color?, status? }]
 */
(function (global) {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function fmtYmd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function todayYmd() {
    return fmtYmd(new Date());
  }

  function parseYmd(s) {
    if (!s) return null;
    var d = new Date(String(s).slice(0, 10) + 'T12:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function shiftMonth(d, n) {
    var x = new Date(d);
    x.setMonth(x.getMonth() + n);
    return x;
  }

  function indexEvents(events) {
    var map = {};
    (events || []).forEach(function (ev) {
      var ymd = String(ev.date || '').slice(0, 10);
      if (!ymd) return;
      if (!map[ymd]) map[ymd] = [];
      map[ymd].push(ev);
    });
    return map;
  }

  function evStyle(ev, accent) {
    var bg = ev.color || accent || '#0d9488';
    var extra = '';
    if (ev.status === 'overdue') extra = 'box-shadow:inset 3px 0 0 #dc2626;';
    else if (ev.status === 'today') extra = 'box-shadow:inset 3px 0 0 #fbbf24;';
    else if (ev.status === 'done') extra = 'opacity:0.55;';
    return 'background:' + bg + ';' + extra;
  }

  function mount(container, opts) {
    if (!container) return null;
    opts = opts || {};
    var state = {
      cursor: new Date(),
      view: 'month',
      events: [],
      opts: opts
    };

    function render() {
      state.events = (typeof opts.getEvents === 'function' ? opts.getEvents() : []) || [];
      var byDay = indexEvents(state.events);
      var d = state.cursor;
      var today = todayYmd();
      var title = MONTHS[d.getMonth()] + ' ' + d.getFullYear();
      var accent = opts.accent || '#0d9488';

      var html = '<div class="ga-act-cal-wrap" style="--ga-cal-accent:' + accent + '">';
      html += '<div class="ga-act-cal-top">';
      html += '<div><div class="ga-act-cal-sub">' + (opts.subtitle || 'Activity calendar') + '</div>';
      html += '<div class="ga-act-cal-title">' + (opts.title || title) + '</div></div>';
      html += '<div class="ga-act-cal-nav">';
      html += '<button type="button" data-cal-nav="-1" title="Previous">&#9664;</button>';
      html += '<button type="button" data-cal-today="1">Today</button>';
      html += '<button type="button" data-cal-nav="1" title="Next">&#9654;</button>';
      html += '</div></div>';
      html += '<div class="ga-act-cal-body">';
      html += '<div class="ga-act-cal-month">';
      DOW.forEach(function (w) { html += '<div class="ga-act-cal-dow">' + w + '</div>'; });
      var y = d.getFullYear(), m = d.getMonth();
      var first = new Date(y, m, 1);
      var start = new Date(first);
      start.setDate(1 - first.getDay());
      for (var i = 0; i < 42; i += 1) {
        var cell = new Date(start);
        cell.setDate(start.getDate() + i);
        var ymd = fmtYmd(cell);
        var evs = byDay[ymd] || [];
        html += '<div class="ga-act-cal-day' + (cell.getMonth() !== m ? ' other' : '') + (ymd === today ? ' today' : '') + '" data-cal-day="' + ymd + '">';
        html += '<div class="ga-act-cal-day-num">' + cell.getDate() + '</div>';
        evs.slice(0, 4).forEach(function (ev) {
          html += '<div class="ga-act-cal-ev" style="' + evStyle(ev, accent) + '" data-cal-ev="' + String(ev.id || '').replace(/"/g, '') + '" title="' + String(ev.title || '').replace(/"/g, '&quot;') + '">' + (ev.title || 'Event') + '</div>';
        });
        if (evs.length > 4) html += '<div style="font-size:8px;color:#64748b">+' + (evs.length - 4) + ' more</div>';
        html += '</div>';
      }
      html += '</div></div>';

      var legend = opts.legend || [];
      if (legend.length) {
        html += '<div class="ga-act-cal-legend">';
        legend.forEach(function (item) {
          html += '<span class="ga-act-cal-legend-item"><span class="ga-act-cal-legend-dot" style="background:' + item.color + '"></span>' + item.label + '</span>';
        });
        html += '</div>';
      }
      html += '</div>';
      container.innerHTML = html;

      container.querySelectorAll('[data-cal-nav]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.cursor = shiftMonth(state.cursor, Number(btn.getAttribute('data-cal-nav')) || 0);
          render();
        });
      });
      var todayBtn = container.querySelector('[data-cal-today]');
      if (todayBtn) todayBtn.addEventListener('click', function () { state.cursor = new Date(); render(); });
      container.querySelectorAll('[data-cal-ev]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.stopPropagation();
          var id = el.getAttribute('data-cal-ev');
          var ev = state.events.find(function (x) { return String(x.id) === String(id); });
          if (ev && typeof opts.onEventClick === 'function') opts.onEventClick(ev);
        });
      });
    }

    render();
    return { refresh: render };
  }

  global.GAActivityCalendar = { mount: mount, fmtYmd: fmtYmd, todayYmd: todayYmd, parseYmd: parseYmd };
})(typeof window !== 'undefined' ? window : globalThis);
