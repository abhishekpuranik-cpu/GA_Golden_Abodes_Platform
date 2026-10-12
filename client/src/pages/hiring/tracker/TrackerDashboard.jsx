import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { trackerApi, trackerCache } from '../../../lib/hiring/trackerApi.js';
import { STAGES, STAGE_LABEL, fmtDate, scoreTone } from '../../../lib/hiring/trackerLabels.js';

const fmtAvg = (v) => (v == null ? '—' : Number(v).toFixed(1));
const EMPTY = { positionId: '', from: '', to: '', stage: '', interviewer: '' };

export default function TrackerDashboard() {
  const { caps, positions, users } = useOutletContext();
  const navigate = useNavigate();
  const [filters, setFilters] = useState(EMPTY);
  const [data, setData] = useState(() => trackerCache.peek('dashboard') || null);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    if (filters === EMPTY && trackerCache.peek('dashboard')) setData(trackerCache.peek('dashboard'));
    trackerApi.dashboard(filters).then((d) => { setData(d); setErr(''); }).catch((e) => setErr(e.message));
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const drill = (bucket, extra = {}) => {
    const p = new URLSearchParams({ view: 'table', ...Object.fromEntries(Object.entries({ ...filters, ...extra }).filter(([, v]) => v)) });
    if (bucket && bucket !== 'all') p.set('bucket', bucket);
    else p.set('status', 'all');
    navigate(`/app/hiring/tracker?${p.toString()}`);
  };
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  if (err) return <p className="hr-error">{err}</p>;
  if (!data) return <p className="hr-muted">Loading dashboard…</p>;

  const k = data.kpis;
  const maxFunnel = Math.max(1, ...data.funnel.map((f) => f.count));
  const maxDays = Math.max(1, ...data.timeInStage.map((t) => t.avgDays || 0));
  const hasFilters = Object.values(filters).some(Boolean);

  const KPI = [
    { key: 'all', label: 'Total candidates', value: k.total },
    { key: 'hr_done', label: 'HR screenings done', value: k.hrDone },
    { key: 'hr_cleared', label: 'Cleared HR', value: k.hrCleared },
    { key: 'r1_done', label: '1st rounds done', value: k.r1Done },
    { key: 'r2_done', label: '2nd rounds done', value: k.r2Done },
    { key: 'selected', label: 'Selected', value: k.selected, tone: 'good' },
    { key: 'on_hold', label: 'On hold', value: k.onHold, tone: 'mid' },
    { key: 'rejected', label: 'Rejected', value: k.rejected, tone: 'low' },
    { key: 'withdrawn', label: 'Withdrawn', value: k.withdrawn }
  ];

  const QUEUES = [
    { key: 'pending_hr', label: 'Pending HR screening' },
    { key: 'pending_r1', label: 'Pending 1st round' },
    { key: 'pending_r2', label: 'Pending 2nd round' },
    { key: 'awaiting_decision', label: 'Awaiting decision' },
    { key: 'overdue', label: 'Overdue actions', alert: true },
    { key: 'stale', label: 'Stuck > 7 days', alert: true }
  ];

  return (
    <div className="ht-dash">
      <div className="ht-filters ht-dash-filters">
        <select value={filters.positionId} onChange={set('positionId')} aria-label="Position">
          <option value="">All positions</option>
          {positions.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
        </select>
        <select value={filters.stage} onChange={set('stage')} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
        <select value={filters.interviewer} onChange={set('interviewer')} aria-label="Interviewer">
          <option value="">Any owner / interviewer</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <label className="ht-date">From <input type="date" value={filters.from} onChange={set('from')} /></label>
        <label className="ht-date">To <input type="date" value={filters.to} onChange={set('to')} /></label>
        {hasFilters && <button type="button" className="ht-link-btn" onClick={() => setFilters(EMPTY)}>Clear</button>}
      </div>

      {k.total === 0 ? (
        <div className="ht-empty-card">
          <h2>No candidates {hasFilters ? 'match these filters' : 'in the tracker yet'}</h2>
          <p className="hr-muted">The dashboard fills in as candidates move through the pipeline.</p>
          {!hasFilters && <Link className="hr-btn hr-btn-gold" to="/app/hiring/tracker">Go to pipeline</Link>}
        </div>
      ) : (
        <>
          <div className="ht-hero">
            <button type="button" className="ht-hero-main" onClick={() => drill('selected')}>
              <span className="ht-hero-num">{k.conversion}%</span>
              <span className="ht-hero-label">Overall hiring conversion</span>
              <span className="ht-hero-sub">{k.selected} selected of {k.total} shortlisted</span>
            </button>
            <div className="ht-kpis">
              {KPI.map((x) => (
                <button key={x.key} type="button" className={`ht-kpi ${x.tone ? `tone-${x.tone}` : ''}`} onClick={() => drill(x.key)}>
                  <b>{x.value}</b>
                  <span>{x.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ht-dash-grid">
            <section className="ht-panel ht-span-2">
              <h3>Hiring funnel</h3>
              <div className="ht-funnel">
                {data.funnel.map((f, i) => (
                  <button key={f.key} type="button" className="ht-funnel-row" onClick={() => drill(f.key)}>
                    <span className="ht-funnel-label">{f.label}</span>
                    <span className="ht-funnel-bar">
                      <span style={{ width: `${Math.max(2, (f.count / maxFunnel) * 100)}%` }} />
                    </span>
                    <span className="ht-funnel-count">{f.count}</span>
                    <span className="ht-funnel-pct">
                      {i === 0 ? '100%' : f.fromPrevPct == null ? '—' : `${f.fromPrevPct}% of prev`}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <section className="ht-panel">
              <h3>Action queues</h3>
              <div className="ht-queues">
                {QUEUES.map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    className={`ht-queue ${q.alert && data.queues[q.key] > 0 ? 'is-alert' : ''}`}
                    onClick={() => drill(q.key)}
                  >
                    <span>{q.label}</span>
                    <b>{data.queues[q.key]}</b>
                  </button>
                ))}
              </div>
              {data.bottleneck && data.bottleneck.avgDays > 0 && (
                <p className="ht-callout">
                  Slowest stage: <b>{data.bottleneck.label}</b> — avg {data.bottleneck.avgDays} days
                </p>
              )}
            </section>

            <section className="ht-panel ht-span-full">
              <h3>Position-wise progress</h3>
              <div className="ht-table-wrap">
                <table className="ht-table ht-pos-table">
                  <thead>
                    <tr>
                      <th>Position</th><th>Total</th><th>Shortlisted</th><th>HR</th><th>1st</th><th>2nd</th>
                      <th>Decision</th><th>Hold</th><th>Rejected</th><th>Selected / openings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.positions.map((p) => (
                      <tr key={p.positionId} onClick={() => drill('all', { positionId: p.positionId })}>
                        <td><b>{p.title}</b></td>
                        <td>{p.total}</td>
                        <td>{p.shortlisted || ''}</td>
                        <td>{p.hr || ''}</td>
                        <td>{p.r1 || ''}</td>
                        <td>{p.r2 || ''}</td>
                        <td>{p.decision || ''}</td>
                        <td>{p.onHold || ''}</td>
                        <td>{p.rejected || ''}</td>
                        <td>
                          <div className="ht-fill">
                            <span className="ht-fill-bar"><span style={{ width: `${p.openings ? Math.min(100, (p.selected / p.openings) * 100) : 0}%` }} /></span>
                            <span>{p.selected}/{p.openings}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ht-panel">
              <h3>Evaluation scores</h3>
              <div className="ht-scores">
                <div>
                  <span>Avg HR screening</span>
                  <b className={`tone-${scoreTone(data.scores.hrAvg)}`}>{fmtAvg(data.scores.hrAvg)}</b>
                  <em>{data.scores.hrSamples} evaluated</em>
                </div>
                {caps.mgmt && (
                  <>
                    <div>
                      <span>Avg 1st round</span>
                      <b className={`tone-${scoreTone(data.scores.r1Avg)}`}>{fmtAvg(data.scores.r1Avg)}</b>
                      <em>{data.scores.r1Samples} evaluated</em>
                    </div>
                    <div>
                      <span>Avg 2nd round</span>
                      <b className={`tone-${scoreTone(data.scores.r2Avg)}`}>{fmtAvg(data.scores.r2Avg)}</b>
                      <em>{data.scores.r2Samples} evaluated</em>
                    </div>
                  </>
                )}
              </div>
              <div className="ht-turnaround">
                <div><span>Avg turnaround</span><b>{data.turnaround.avgDays != null ? `${data.turnaround.avgDays} d` : '—'}</b></div>
                <div><span>Median</span><b>{data.turnaround.medianDays != null ? `${data.turnaround.medianDays} d` : '—'}</b></div>
                <p className="ht-side-meta">Shortlist → final decision · {data.turnaround.samples} decided</p>
              </div>
              {caps.mgmt && k.overrides > 0 && (
                <p className="ht-callout ht-callout-warn">{k.overrides} stage override{k.overrides === 1 ? '' : 's'} recorded</p>
              )}
            </section>

            <section className="ht-panel ht-span-2">
              <h3>Avg days in stage</h3>
              <div className="ht-stage-time">
                {data.timeInStage.map((t) => (
                  <div key={t.stage} className="ht-st-row">
                    <span>{t.label}</span>
                    <span className="ht-st-bar"><span style={{ width: `${t.avgDays ? (t.avgDays / maxDays) * 100 : 0}%` }} /></span>
                    <b>{t.avgDays != null ? `${t.avgDays}d` : '—'}</b>
                  </div>
                ))}
              </div>
            </section>

            <section className="ht-panel ht-span-full">
              <h3>Overdue next actions</h3>
              {data.overdueList.length ? (
                <ul className="ht-overdue">
                  {data.overdueList.map((o) => (
                    <li key={o._id}>
                      <Link to={`/app/hiring/tracker/c/${o._id}`}><b>{o.name}</b></Link>
                      <span>{o.position} · {STAGE_LABEL[o.stage]}</span>
                      <span>{o.nextAction}</span>
                      <time>due {fmtDate(o.nextActionDue)}{o.owner ? ` · ${o.owner}` : ''}</time>
                    </li>
                  ))}
                </ul>
              ) : <p className="ht-allclear">All clear — no overdue actions.</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
