import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../../hooks/postsales/useDashboard.js';
import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';
import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';
import { PHASES } from '../../data/postsales/steps.js';

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n);
}

export default function Dashboard() {
  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear } = useInventoryFilters();
  const { data, loading, error } = useDashboard(query);
  const navigate = useNavigate();

  if (loading) return <div className="ps-empty">Loading dashboard…</div>;
  if (error) return <div className="ps-error">{error}</div>;
  if (!data) return <div className="ps-empty">No data</div>;

  const cf = data.cashflowHealth || {};
  const collectPct = data.collectPct ?? 0;
  const fb = data.forecastBuckets || { clear: 0, risky: 0, delayed: 0 };
  const forecastTotal = fb.clear + fb.risky + fb.delayed;
  const maxProjectPending = Math.max(...(data.collectionByProject?.map((p) => p.pending + p.gstPending) || [1]), 1);

  return (
    <div className="ps-dash-page">
      <h2 style={{ marginTop: 0 }}>Operations & Cashflow Dashboard</h2>
      <p className="ps-reports-sub">Practical view of collection health, forecast risk, and pipeline operations.</p>

      <PostSalesFilterBar
        project={project}
        phase={phase}
        building={building}
        onProjectChange={setProject}
        onPhaseChange={setPhase}
        onBuildingChange={setBuilding}
        options={options}
        onClear={clear}
      />

      <div className="ps-kpi-grid ps-dash-kpi">
        <div className="ps-kpi">
          <div className="ps-kpi-label">Active units</div>
          <div className="ps-kpi-value">{data.activeUnits}</div>
          <div className="ps-kpi-sub">{data.totalUnits} total in scope</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Agreement collected</div>
          <div className="ps-kpi-value" style={{ fontSize: '1.1rem', color: 'var(--ps-success)' }}>{fmt(cf.agreementReceived)}</div>
          <div className="ps-kpi-sub">{collectPct}% of {fmt(cf.agreementDue)} due</div>
        </div>
        <div className="ps-kpi danger">
          <div className="ps-kpi-label">Outstanding (today)</div>
          <div className="ps-kpi-value" style={{ fontSize: '1.1rem' }}>{fmt(cf.totalOutstanding)}</div>
          <div className="ps-kpi-sub">Agmt {fmt(cf.agreementPending)} + GST {fmt(cf.gstPending)}</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Forecast pipeline</div>
          <div className="ps-kpi-value" style={{ fontSize: '1.1rem' }}>{fmt(forecastTotal)}</div>
          <div className="ps-kpi-sub">Clear {fmt(fb.clear)} · Risky {fmt(fb.risky)} · Delayed {fmt(fb.delayed)}</div>
        </div>
        <div className={`ps-kpi ${data.slaBreaches > 0 ? 'danger' : ''}`}>
          <div className="ps-kpi-label">SLA breaches</div>
          <div className="ps-kpi-value">{data.slaBreaches}</div>
        </div>
        <div className={`ps-kpi ${data.openDisbursementTasks > 0 ? 'warning' : ''}`}>
          <div className="ps-kpi-label">Disbursement tasks</div>
          <div className="ps-kpi-value">{data.openDisbursementTasks}</div>
          <div className="ps-kpi-sub">{data.delayedDisbursementTasks} delayed</div>
        </div>
        <div className={`ps-kpi ${data.openTickets > 0 ? 'warning' : ''}`}>
          <div className="ps-kpi-label">Open tickets</div>
          <div className="ps-kpi-value">{data.openTickets}</div>
          <div className="ps-kpi-sub">{data.ackBreachCount} ack · {data.resBreachCount} resolution SLA</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Pending demands</div>
          <div className="ps-kpi-value">{data.pendingDemandCount}</div>
        </div>
      </div>

      <div className="ps-grid-2">
        <div className="ps-card">
          <strong>Cashflow — agreement vs GST</strong>
          <div className="ps-dash-split">
            <div>
              <div className="ps-kpi-label">Agreement due</div>
              <div className="ps-dash-big">{fmt(cf.agreementDue)}</div>
              <div className="ps-progress" style={{ marginTop: 8 }}><div className="ps-progress-fill" style={{ width: `${collectPct}%` }} /></div>
              <div className="ps-kpi-sub">Received {fmt(cf.agreementReceived)} · Pending {fmt(cf.agreementPending)}</div>
            </div>
            <div>
              <div className="ps-kpi-label">GST</div>
              <div className="ps-dash-big">{fmt(cf.gstDue)}</div>
              <div className="ps-kpi-sub">Received {fmt(cf.gstReceived)} · Pending {fmt(cf.gstPending)}</div>
            </div>
          </div>
        </div>

        <div className="ps-card">
          <strong>Forecast risk mix</strong>
          {forecastTotal > 0 ? (
            <>
              <div className="ps-dash-risk-bar">
                <div className="ps-dash-risk-clear" style={{ width: `${(fb.clear / forecastTotal) * 100}%` }} title={`Clear ${fmt(fb.clear)}`} />
                <div className="ps-dash-risk-risky" style={{ width: `${(fb.risky / forecastTotal) * 100}%` }} title={`Risky ${fmt(fb.risky)}`} />
                <div className="ps-dash-risk-delayed" style={{ width: `${(fb.delayed / forecastTotal) * 100}%` }} title={`Delayed ${fmt(fb.delayed)}`} />
              </div>
              <div className="ps-dash-legend">
                <span><i className="dot clear" /> Clear {fmt(fb.clear)}</span>
                <span><i className="dot risky" /> Risky {fmt(fb.risky)}</span>
                <span><i className="dot delayed" /> Delayed {fmt(fb.delayed)}</span>
              </div>
            </>
          ) : (
            <div className="ps-empty" style={{ padding: 16 }}>No installment forecasts yet — set expected payments in Reports.</div>
          )}
        </div>
      </div>

      <div className="ps-grid-2">
        <div className="ps-card">
          <strong>Collection by project (pending)</strong>
          {(data.collectionByProject || []).map((p) => (
            <div key={p.project} className="ps-bar-row">
              <span className="ps-bar-label">{p.project} <span className="ps-kpi-sub">({p.units} units)</span></span>
              <div className="ps-bar-track">
                <div className="ps-bar-fill" style={{ width: `${((p.pending + p.gstPending) / maxProjectPending) * 100}%`, background: 'var(--ps-danger)' }} />
              </div>
              <span style={{ fontSize: '0.75rem', minWidth: 72, textAlign: 'right' }}>{fmt(p.pending + p.gstPending)}</span>
            </div>
          ))}
          {!data.collectionByProject?.length && <div className="ps-empty" style={{ padding: 16 }}>No units in filter</div>}
        </div>

        <div className="ps-card">
          <strong>Pipeline phase (in progress)</strong>
          {(data.byPhase || []).map((p) => (
            <div key={p.phase} className="ps-bar-row">
              <span className="ps-bar-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color || PHASES[p.phase]?.color }} />
                {p.label || p.phase}
              </span>
              <div className="ps-bar-track">
                <div className="ps-bar-fill" style={{ width: `${Math.min(p.count * 15, 100)}%`, background: p.color }} />
              </div>
              <span style={{ fontSize: '0.8rem', width: 24 }}>{p.count}</span>
            </div>
          ))}
          {!data.byPhase?.length && <div className="ps-empty" style={{ padding: 16 }}>No active phases</div>}
        </div>
      </div>

      {data.highPriorityUnits?.length > 0 && (
        <div className="ps-card">
          <strong>Watch list — high priority collections</strong>
          {data.highPriorityUnits.map((u) => (
            <div
              key={u.unitId}
              className="ps-dash-list-row"
              onClick={() => navigate(`/app/post-sales/reports`)}
            >
              <span><strong>{u.project} · {u.unitNumber}</strong> — {u.clientName}</span>
              <span className={`ps-badge ps-badge-${u.priority === 'high' ? 'red' : 'amber'}`}>{u.priority}</span>
              <span className="ps-num">{fmt(u.pending)} pending</span>
            </div>
          ))}
        </div>
      )}

      {data.slaBreachUnits?.length > 0 && (
        <div className="ps-card">
          <strong>SLA breach units</strong>
          {data.slaBreachUnits.slice(0, 8).map((u) => (
            <div key={u.unitId} className="ps-dash-list-row" onClick={() => navigate(`/app/post-sales/units/${u.unitId}`)}>
              <span><strong>{u.project} · {u.unitNumber}</strong> — {u.customerName}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--ps-danger)' }}>{u.breachedSteps?.map((s) => `Step ${s.stepNumber}`).join(', ')}</span>
            </div>
          ))}
        </div>
      )}

      {data.openTicketsList?.length > 0 && (
        <div className="ps-card">
          <strong>Open tickets</strong>
          {data.openTicketsList.map((t) => (
            <div key={t.ticketId} className="ps-dash-list-row">
              <span><strong>{t.project} · {t.unitNumber}</strong> #{t.ticketNumber}</span>
              <span style={{ fontSize: '0.8rem' }}>{t.description?.slice(0, 60)}</span>
              {(t.ackSlaBreach || t.resolutionSlaBreach) && <span className="ps-badge ps-badge-red">SLA</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
