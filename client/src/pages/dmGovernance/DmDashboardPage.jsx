import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

function Kpi({ label, value, sub, formula }) {
  return (
    <div className="dm-kpi" title={formula || ''}>
      <div className="dm-kpi-lbl">{label}</div>
      <div className="dm-kpi-val">{value}</div>
      {sub ? <div className="dm-kpi-sub">{sub}</div> : null}
      {formula ? <div className="dm-formula">{formula}</div> : null}
    </div>
  );
}

function BarChart({ rows, valueKey, maxKey, labelKey }) {
  const max = Math.max(...rows.map((r) => Number(r[maxKey] || r[valueKey] || 0)), 1);
  return (
    <div className="dm-bar-chart">
      {rows.map((r) => {
        const val = Number(r[valueKey] || 0);
        const pct = (val / max) * 100;
        return (
          <div key={r.name || r[labelKey]} className="dm-bar-row">
            <span>{r.name || r[labelKey]}</span>
            <div className="dm-bar-track">
              <div className="dm-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span style={{ textAlign: 'right' }}>{formatCr(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

function IssueRow({ issue }) {
  return (
    <div className={`dm-issue ${issue.severity}`}>
      <span className={`dm-issue-sev ${issue.severity}`}>{issue.severity}</span>
      <div>
        <div className="dm-issue-title">
          {issue.title}
          {issue.sourceLabel ? <span className="dm-source-badge">{issue.sourceLabel}</span> : null}
        </div>
        <div className="dm-issue-msg">
          {issue.projectName ? `${issue.projectName} · ` : ''}
          {issue.message}
        </div>
        {issue.impact ? <div className="dm-muted" style={{ fontSize: 12, marginBottom: 4 }}>{issue.impact}</div> : null}
        <div className="dm-issue-action">→ {issue.recommendedAction}</div>
      </div>
      {issue.href ? (
        <Link to={issue.href} className="dm-btn dm-btn-mini dm-btn-primary">
          Resolve
        </Link>
      ) : null}
    </div>
  );
}

export default function DmDashboardPage() {
  const [data, setData] = useState(null);
  const [tower, setTower] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  function applyPayload(payload) {
    setData(payload);
    setTower(payload.controlTower || null);
  }

  function load() {
    setLoading(true);
    setErr('');
    dmGovernanceApi
      .dashboard()
      .then(applyPayload)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function runProactiveScan() {
    setScanning(true);
    setErr('');
    try {
      const payload = await dmGovernanceApi.proactiveScan();
      applyPayload(payload);
    } catch (e) {
      setErr(e.message);
    } finally {
      setScanning(false);
    }
  }

  if (loading) return <p className="dm-muted">Running control tower analysis…</p>;
  if (err) return <div className="dm-err">{err}</div>;
  if (!data) return null;

  const s = data.summary;
  const health = tower?.health;
  const issues = tower?.issues || [];
  const summary = tower?.issueSummary || {};

  return (
    <div>
      <div className="dm-tower-toolbar">
        <div>
          <h2>Proactive Control Tower</h2>
          <p className="dm-page-lead" style={{ margin: '4px 0 0' }}>
            Real-time governance health · {issues.length} issue{issues.length !== 1 ? 's' : ''} detected
            {tower?.scannedAt ? ` · scanned ${new Date(tower.scannedAt).toLocaleString('en-IN')}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="dm-btn dm-btn-primary" disabled={scanning} onClick={runProactiveScan}>
            {scanning ? 'Scanning…' : 'Run proactive scan'}
          </button>
          <Link to="/app/dm-governance/alerts" className="dm-btn">
            All alerts
          </Link>
          <Link to="/app/dm-governance/executive" className="dm-btn">
            Executive view
          </Link>
        </div>
      </div>

      {health ? (
        <div className="dm-tower-hero">
          <div className="dm-health-ring">
            <div className={`dm-health-score ${health.status}`}>{health.portfolioScore}</div>
            <div className="dm-health-label">Portfolio health</div>
            <div className="dm-domain-meta" style={{ marginTop: 10 }}>
              {summary.critical ? <span className="dm-risk-critical">{summary.critical} critical</span> : null}
              {summary.critical && summary.high ? ' · ' : null}
              {summary.high ? <span className="dm-risk-high">{summary.high} high</span> : null}
            </div>
          </div>
          <div className="dm-domain-grid">
            {Object.values(health.domains || {}).map((d) => (
              <div key={d.key} className={`dm-domain-card dm-domain-${d.key}`}>
                <h4>{d.label}</h4>
                <div className={`dm-domain-score ${d.status}`}>{d.score}</div>
                <div className="dm-domain-meta">{d.issueCount} issue{d.issueCount !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(tower?.insights || []).length ? (
        <div className="dm-panel dm-panel-insights">
          <h2>AI-style insights</h2>
          <ul className="dm-insight-list">
            {tower.insights.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {tower?.crossApp?.appSignals ? (
        <>
          <p className="dm-section-title">Cross-app signals — vault integrations</p>
          <div className="dm-app-signals">
            {Object.entries(tower.crossApp.appSignals).map(([key, sig]) => (
              <div key={key} className={`dm-app-signal dm-app-signal--${key} ${sig.status}`}>
                <div className="dm-app-signal-head">
                  <span className="dm-app-signal-dot" aria-hidden />
                  <div className="dm-app-signal-name">{key.replace(/_/g, ' ')}</div>
                </div>
                <div className="dm-app-signal-meta">
                  {sig.available ? 'Connected' : 'No Mongo state'}
                  {sig.deviationCount ? ` · ${sig.deviationCount} deviation(s)` : ''}
                </div>
                {sig.note ? <div className="dm-muted" style={{ fontSize: 11, marginTop: 4 }}>{sig.note}</div> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {issues.length ? (
        <>
          <p className="dm-section-title">Priority issues — act now</p>
          <div className="dm-issue-list">
            {issues.slice(0, 12).map((issue) => (
              <IssueRow key={issue.id} issue={issue} />
            ))}
          </div>
          {issues.length > 12 ? (
            <p className="dm-muted" style={{ marginTop: 10 }}>
              +{issues.length - 12} more — <Link to="/app/dm-governance/risks" className="dm-link">view risks</Link>
            </p>
          ) : null}
        </>
      ) : (
        <div className="dm-panel" style={{ borderColor: '#bbf7d0', background: '#f0fdf4' }}>
          <strong className="dm-success-text">All clear</strong>
          <p className="dm-page-lead" style={{ margin: '8px 0 0' }}>
            No proactive issues detected. Run a full scan after integration sync or billing changes.
          </p>
        </div>
      )}

      {(tower?.watchlist || []).length ? (
        <>
          <p className="dm-section-title">Project watchlist — lowest health first</p>
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Health</th>
                  <th>Issues</th>
                  <th>Cap util</th>
                  <th>Collections</th>
                  <th>Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {tower.watchlist.map((w) => (
                  <tr key={w.projectId}>
                    <td>
                      <Link to={`/app/dm-governance/projects/${w.projectId}`}>{w.name}</Link>
                    </td>
                    <td>
                      <span className={`dm-watch-pill ${w.status}`}>{w.healthScore}</span>
                    </td>
                    <td>{w.issueCount}</td>
                    <td>{w.capUtilPct}%</td>
                    <td>{w.collectionsPct}%</td>
                    <td>{formatCr(w.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <p className="dm-section-title">Portfolio KPIs</p>
      <div className="dm-kpi-grid">
        <Kpi label="Active SPVs" value={s.activeSpvs} />
        <Kpi label="Active projects" value={s.activeProjects} />
        <Kpi label="Project topline" value={formatCr(s.totalTopline)} formula="Σ topline GDV" />
        <Kpi label="Collections" value={formatCr(s.totalCollections)} />
        <Kpi label="Max DM fee (10%)" value={formatCr(s.maxEligibleDmFee)} />
        <Kpi label="DM billed" value={formatCr(s.dmFeeBilledTtd)} sub={`Paid ${formatCr(s.dmFeePaidTtd)}`} />
        <Kpi label="DM accrued" value={formatCr(s.dmFeeAccrued)} sub={`Balance ${formatCr(s.balanceDmEligible)}`} />
        <Kpi label="Exceptions" value={s.exceptionsPending} sub="Missing billing config" />
        {(s.pendingApprovals || 0) > 0 ? (
          <Kpi
            label="Pending approvals"
            value={s.pendingApprovals}
            sub={
              <Link to="/app/dm-governance/approvals" className="dm-link">
                Open inbox →
              </Link>
            }
          />
        ) : null}
      </div>

      <p className="dm-section-title">DM billed vs cap</p>
      <div className="dm-panel">
        <BarChart rows={data.charts?.dmBilledVsCap || []} valueKey="billed" maxKey="cap" labelKey="name" />
      </div>

      <p className="dm-section-title">Project radar</p>
      <div className="dm-card-grid">
        {(data.projectCards || []).map((p) => (
          <Link
            key={p.projectId}
            to={`/app/dm-governance/projects/${p.projectId}`}
            className={`dm-card dm-card-${p.riskStatus || 'green'}`}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <h3>{p.name}</h3>
              <span className={`dm-badge dm-badge-${p.riskStatus}`}>{p.riskStatus}</span>
            </div>
            <div className="dm-card-meta">
              <div>
                {p.projectCode} · {p.revenueStatus.replace(/_/g, ' ')}
              </div>
              <div>
                Topline {formatCr(p.toplineGdv)} · Collections {formatCr(p.collectionsTtd)}
              </div>
              <div>
                DM cap {formatCr(p.dmCap)} · Billed {formatCr(p.dmFeeBilled)} ({p.capUtilPct}%)
              </div>
              <div className="dm-text-secondary" style={{ marginTop: 6 }}>
                Next: {p.nextBillingTrigger}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {(data.spvCards || []).length ? (
        <>
          <p className="dm-section-title">SPV summary</p>
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>SPV</th>
                  <th>Projects</th>
                  <th>Billed</th>
                  <th>Paid</th>
                  <th>Outstanding</th>
                  <th>Agreement</th>
                </tr>
              </thead>
              <tbody>
                {data.spvCards.map((spv) => (
                  <tr key={spv.spvId}>
                    <td>
                      <Link to={`/app/dm-governance/spvs/${spv.spvId}`}>{spv.spvName}</Link>
                    </td>
                    <td>{spv.projectCount}</td>
                    <td>{formatCr(spv.dmFeeBilled)}</td>
                    <td>{formatCr(spv.dmFeePaid)}</td>
                    <td>{formatCr(spv.dmFeeOutstanding)}</td>
                    <td>{spv.agreementStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
