import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../../hooks/postsales/useDashboard.js';
import { PHASES } from '../../data/postsales/steps.js';

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

export default function Dashboard() {
  const { data, loading, error } = useDashboard();
  const navigate = useNavigate();

  if (loading) return <div className="ps-empty">Loading dashboard…</div>;
  if (error) return <div className="ps-error">{error}</div>;
  if (!data) return <div className="ps-empty">No data</div>;

  const collectPct = data.totalDemanded ? Math.round((data.totalCollected / data.totalDemanded) * 100) : 0;
  const maxProject = Math.max(...(data.byProject?.map((p) => p.count) || [1]), 1);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Operations Dashboard</h2>

      <div className="ps-kpi-grid">
        <div className="ps-kpi">
          <div className="ps-kpi-label">Active units</div>
          <div className="ps-kpi-value">{data.activeUnits}</div>
        </div>
        <div className={`ps-kpi ${data.slaBreaches > 0 ? 'danger' : ''}`}>
          <div className="ps-kpi-label">SLA breaches</div>
          <div className="ps-kpi-value">{data.slaBreaches}</div>
        </div>
        <div className={`ps-kpi ${data.openTickets > 0 ? 'warning' : ''}`}>
          <div className="ps-kpi-label">Open tickets</div>
          <div className="ps-kpi-value">{data.openTickets}</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">Outstanding demands</div>
          <div className="ps-kpi-value" style={{ fontSize: '1.2rem' }}>{fmt(data.totalOutstanding)}</div>
        </div>
      </div>

      <div className="ps-card">
        <strong>Collection progress</strong>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: 8 }}>
          <span>{fmt(data.totalCollected)} collected</span>
          <span>{collectPct}% of {fmt(data.totalDemanded)}</span>
        </div>
        <div className="ps-progress"><div className="ps-progress-fill" style={{ width: `${collectPct}%` }} /></div>
      </div>

      <div className="ps-grid-2">
        <div className="ps-card">
          <strong>Units by project</strong>
          {(data.byProject || []).map((p) => (
            <div key={p.project} className="ps-bar-row">
              <span className="ps-bar-label">{p.project}</span>
              <div className="ps-bar-track">
                <div className="ps-bar-fill" style={{ width: `${(p.count / maxProject) * 100}%` }} />
              </div>
              <span style={{ fontSize: '0.8rem', width: 24 }}>{p.count}</span>
            </div>
          ))}
        </div>

        <div className="ps-card">
          <strong>Units by pipeline phase</strong>
          {(data.byPhase || []).map((p) => (
            <div key={p.phase} className="ps-bar-row">
              <span className="ps-bar-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color || PHASES[p.phase]?.color }} />
                {p.label || p.phase}
              </span>
              <div className="ps-bar-track">
                <div className="ps-bar-fill" style={{ width: `${Math.min(p.count * 20, 100)}%`, background: p.color }} />
              </div>
              <span style={{ fontSize: '0.8rem', width: 24 }}>{p.count}</span>
            </div>
          ))}
          {!data.byPhase?.length && <div className="ps-empty" style={{ padding: 20 }}>No active phases</div>}
        </div>
      </div>

      {data.slaBreachUnits?.length > 0 && (
        <div className="ps-card">
          <strong>SLA breach units</strong>
          {data.slaBreachUnits.map((u) => (
            <div
              key={u.unitId}
              style={{ padding: '8px 0', borderBottom: '1px solid var(--ps-border)', cursor: 'pointer' }}
              onClick={() => navigate(`/app/post-sales/units/${u.unitId}`)}
            >
              <strong>{u.project} · {u.unitNumber}</strong> — {u.customerName}
              <div style={{ fontSize: '0.8rem', color: 'var(--ps-danger)' }}>
                {u.breachedSteps?.map((s) => `Step ${s.stepNumber}`).join(', ')}
              </div>
            </div>
          ))}
        </div>
      )}

      {data.openTicketsList?.length > 0 && (
        <div className="ps-card">
          <strong>Open tickets</strong>
          {data.openTicketsList.map((t) => (
            <div key={t.ticketId} style={{ padding: '8px 0', borderBottom: '1px solid var(--ps-border)' }}>
              <span className="ps-badge ps-badge-blue">{t.ticketNumber}</span>{' '}
              {t.project} · {t.unitNumber}
              {t.ackSlaBreach && <span className="ps-badge ps-badge-red" style={{ marginLeft: 6 }}>Ack breach</span>}
              {t.resolutionSlaBreach && <span className="ps-badge ps-badge-amber" style={{ marginLeft: 6 }}>Res breach</span>}
              <div style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>{t.description}</div>
            </div>
          ))}
        </div>
      )}

      {data.pendingMilestones?.length > 0 && (
        <div className="ps-card" style={{ background: 'var(--ps-warning-bg)', borderColor: '#fde68a' }}>
          <strong>Pending milestone triggers</strong>
          {data.pendingMilestones.map((m) => (
            <div key={m.milestoneId} style={{ padding: '8px 0' }}>
              {m.project} · {m.tower} — {m.milestoneName} ({m.clpPercent}% CLP)
            </div>
          ))}
        </div>
      )}

      {data.possessionReadiness?.length > 0 && (
        <div className="ps-card">
          <strong>Possession readiness (steps 13–20)</strong>
          {data.possessionReadiness.map((u) => (
            <div key={u.unitId} className="ps-bar-row">
              <span className="ps-bar-label">{u.project} · {u.unitNumber}</span>
              <div className="ps-progress" style={{ flex: 1 }}><div className="ps-progress-fill" style={{ width: `${u.pctComplete}%` }} /></div>
              <span style={{ fontSize: '0.8rem' }}>{u.pctComplete}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
