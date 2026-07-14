import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ActivityCalendarShell from '../../components/postsales/ActivityCalendarShell.jsx';
import BusinessHealthSubNav from '../../components/businessHealth/BusinessHealthSubNav.jsx';
import { dmGovernanceApi } from '../../lib/dmGovernanceApi.js';
import { appCalendarColor } from '../../lib/appCalendarColors.js';
import { parseYmd, todayYmd } from '../../lib/postsales/activityCalendarUtils.js';
import { startOfDay } from '../../lib/postsales/taskAgenda.js';
import '../../components/postsales/activityCalendar.css';

const PILLARS = [
  { key: 'commercial', label: 'Commercial', color: '#2563eb' },
  { key: 'delivery', label: 'Delivery', color: '#059669' },
  { key: 'financial', label: 'Financial', color: '#0d9488' },
  { key: 'people_cost', label: 'People', color: '#9333ea' },
  { key: 'governance', label: 'Governance', color: '#0891b2' },
  { key: 'customer', label: 'Customer', color: '#ea580c' }
];

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' }
];

const POLL_MS = 30000;

function apiRange(view, cursorDate) {
  const d = new Date(cursorDate);
  let from;
  let to;
  if (view === 'year') {
    from = new Date(d.getFullYear(), 0, 1);
    to = new Date(d.getFullYear(), 11, 31);
  } else if (view === 'week') {
    from = new Date(d);
    from.setDate(d.getDate() - d.getDay() - 14);
    to = new Date(d);
    to.setDate(d.getDate() - d.getDay() + 20);
  } else if (view === 'day') {
    from = new Date(d);
    from.setDate(d.getDate() - 21);
    to = new Date(d);
    to.setDate(d.getDate() + 21);
  } else {
    from = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    to = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  }
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function eventDates(ev) {
  return ev.date ? [ev.date] : [];
}

function eventColor(ev) {
  return ev.sourceColor || appCalendarColor(ev.sourceApp);
}

function eventAccentStyle(ev) {
  if (ev.status === 'done') return { opacity: 0.5 };
  if (ev.status === 'overdue') return { boxShadow: 'inset 3px 0 0 #dc2626' };
  if (ev.status === 'today') return { boxShadow: 'inset 3px 0 0 #fbbf24' };
  return undefined;
}

function eventTitle(ev) {
  return ev.title;
}

export default function DmPortfolioCalendarPage() {
  const [view, setView] = useState('month');
  const [cursorDate, setCursorDate] = useState(() => startOfDay(new Date()));
  const [selectedYmd, setSelectedYmd] = useState(todayYmd());
  const [events, setEvents] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [syncing, setSyncing] = useState(false);

  const [apps, setApps] = useState([]);
  const [pillars, setPillars] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState(null);

  const range = useMemo(() => apiRange(view, cursorDate), [view, cursorDate]);

  const query = useMemo(() => {
    const q = { ...range, status };
    if (apps.length) q.apps = apps.join(',');
    if (pillars.length) q.pillars = pillars.join(',');
    if (projectId) q.projects = projectId;
    return q;
  }, [range, apps, pillars, projectId, status]);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setSyncing(true);
      setErr('');
      try {
        const data = await dmGovernanceApi.portfolioCalendar(query);
        setEvents(data.events || []);
        setMeta(data.meta || null);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [query]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load(true);
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const dayEvents = useMemo(
    () => events.filter((ev) => eventDates(ev).includes(selectedYmd)),
    [events, selectedYmd]
  );

  const legend = useMemo(() => {
    return (meta?.sources || []).map((s) => ({
      label: s.label,
      color: s.color || appCalendarColor(s.key)
    }));
  }, [meta]);

  function toggleChip(list, setList, key) {
    setList((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  function toggleApp(key) {
    const allKeys = (meta?.sources || []).map((s) => s.key);
    setApps((prev) => {
      if (!prev.length) {
        return allKeys.filter((k) => k !== key);
      }
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      const next = [...prev, key];
      return next.length === allKeys.length ? [] : next;
    });
  }

  const counts = meta?.counts || {};

  return (
    <div className="dm-bh-calendar-page">
      <BusinessHealthSubNav />

      <header className="dm-bh-cal-head">
        <div>
          <h2 className="dm-bh-cal-title">Portfolio calendar</h2>
          <p className="dm-bh-cal-sub">
            Live view across DM billing, Post Sales, Cashflow, PreCon, Finance, Marketing, and Hiring.
            {meta?.syncedAt && (
              <span className={`dm-bh-sync${syncing ? ' syncing' : ''}`}>
                {' '}
                · Synced {new Date(meta.syncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="dm-bh-cal-stats">
          <span className="dm-bh-stat-pill">{counts.total ?? events.length} events</span>
          {(counts.overdue ?? 0) > 0 && <span className="dm-bh-stat-pill danger">{counts.overdue} overdue</span>}
          {(counts.today ?? 0) > 0 && <span className="dm-bh-stat-pill warn">{counts.today} today</span>}
        </div>
      </header>

      <div className="dm-bh-cal-filters">
        <div className="dm-bh-filter-row">
          <span className="dm-bh-filter-label">Status</span>
          <div className="dm-bh-chips">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`dm-bh-chip${status === t.id ? ' on' : ''}`}
                onClick={() => setStatus(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dm-bh-filter-row">
          <span className="dm-bh-filter-label">Apps</span>
          <div className="dm-bh-chips">
            {(meta?.sources || []).map((s) => {
              const color = s.color || appCalendarColor(s.key);
              const on = !apps.length || apps.includes(s.key);
              return (
              <button
                key={s.key}
                type="button"
                className={`dm-bh-chip dm-bh-chip-app${on ? ' on' : ''}`}
                style={{ '--chip-color': color }}
                onClick={() => toggleApp(s.key)}
              >
                <span className="dm-bh-chip-dot" style={{ background: color }} aria-hidden />
                {s.label}
                {s.count > 0 ? ` (${s.count})` : ''}
              </button>
            );})}
          </div>
        </div>

        <div className="dm-bh-filter-row">
          <span className="dm-bh-filter-label">Pillar</span>
          <div className="dm-bh-chips">
            {PILLARS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`dm-bh-chip${!pillars.length || pillars.includes(p.key) ? ' on' : ''}`}
                style={{ '--chip-color': p.color }}
                onClick={() => toggleChip(pillars, setPillars, p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="dm-bh-filter-row dm-bh-filter-row--compact">
          <label className="dm-bh-filter-label" htmlFor="dm-cal-project">
            Project
          </label>
          <select
            id="dm-cal-project"
            className="dm-bh-select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All projects</option>
            {(meta?.projects || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button type="button" className="dm-btn dm-btn-ghost dm-btn-sm" onClick={() => load(true)} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Refresh now'}
          </button>
        </div>
      </div>

      {err && <div className="dm-err">{err}</div>}
      {loading && !events.length ? <p className="dm-muted">Loading calendar…</p> : null}

      <div className="dm-bh-cal-grid">
        <div className="dm-bh-cal-main">
          <ActivityCalendarShell
            eyebrow="Business Health"
            view={view}
            cursorDate={cursorDate}
            selectedYmd={selectedYmd}
            tasks={events}
            getTaskYmd={eventDates}
            getTaskId={(ev) => ev.id}
            getTaskTitle={eventTitle}
            getTaskColor={eventColor}
            getTaskExtraStyle={eventAccentStyle}
            onViewChange={setView}
            onCursorChange={setCursorDate}
            onToday={() => {
              const t = startOfDay(new Date());
              setCursorDate(t);
              setSelectedYmd(todayYmd());
            }}
            onSelectDay={setSelectedYmd}
            onTaskClick={setSelectedEvent}
            legend={legend}
          />
        </div>

        <aside className="dm-bh-cal-side">
          <h3 className="dm-bh-side-title">
            {selectedYmd
              ? parseYmd(selectedYmd)?.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })
              : 'Selected day'}
          </h3>
          {!dayEvents.length ? (
            <p className="dm-muted">No events this day with current filters.</p>
          ) : (
            <ul className="dm-bh-day-list">
              {dayEvents.map((ev) => (
                <li key={ev.id} className={`dm-bh-day-item status-${ev.status}`}>
                  <button type="button" className="dm-bh-day-btn" onClick={() => setSelectedEvent(ev)}>
                    <span className="dm-bh-day-dot" style={{ background: eventColor(ev) }} />
                    <span className="dm-bh-day-text">
                      <strong>{ev.title}</strong>
                      <span>
                        {ev.sourceLabel}
                        {ev.projectName ? ` · ${ev.projectName}` : ''}
                        {ev.status === 'overdue' ? ' · overdue' : ev.status === 'today' ? ' · today' : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {selectedEvent && (
            <div className="dm-bh-event-detail">
              <h4>{selectedEvent.title}</h4>
              <p className="dm-muted">{selectedEvent.subtitle}</p>
              <dl className="dm-bh-event-meta">
                <dt>App</dt>
                <dd>{selectedEvent.sourceLabel}</dd>
                <dt>Date</dt>
                <dd>{selectedEvent.date}</dd>
                <dt>Status</dt>
                <dd>{selectedEvent.status}</dd>
                {selectedEvent.projectName && (
                  <>
                    <dt>Project</dt>
                    <dd>{selectedEvent.projectName}</dd>
                  </>
                )}
              </dl>
              {selectedEvent.href && (
                selectedEvent.href.startsWith('/legacy') || selectedEvent.href.startsWith('http') ? (
                  <a href={selectedEvent.href} className="dm-bh-link">
                    Open in {selectedEvent.sourceLabel} →
                  </a>
                ) : (
                  <Link to={selectedEvent.href} className="dm-bh-link">
                    Open in {selectedEvent.sourceLabel} →
                  </Link>
                )
              )}
              <button type="button" className="dm-btn dm-btn-ghost dm-btn-sm" onClick={() => setSelectedEvent(null)}>
                Close
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
