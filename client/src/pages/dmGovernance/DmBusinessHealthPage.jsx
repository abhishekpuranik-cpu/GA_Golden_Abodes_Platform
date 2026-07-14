import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOutletContext } from 'react-router-dom';
import BusinessHealthSubNav from '../../components/businessHealth/BusinessHealthSubNav.jsx';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';
import { quickLaunchForUser } from '../../lib/businessHealthQuickLaunch.js';

const PILLAR_ORDER = ['commercial', 'delivery', 'financial', 'people_cost', 'governance', 'customer'];

function pillarWord(status) {
  if (status === 'green') return 'OK';
  if (status === 'amber') return 'Watch';
  return 'At risk';
}

/** Plain-language portfolio story — not DM ops jargon. */
function buildStory(summary, projectCards, health, issueCount) {
  const projects = projectCards || [];
  const names = projects.map((p) => p.name).filter(Boolean);
  const topline = Number(summary?.totalTopline) || 0;
  const collections = Number(summary?.totalCollections) || 0;
  const collPct = topline > 0 ? Math.round((collections / topline) * 100) : 0;

  let headline = 'Review the items below';
  if (health?.status === 'green' && issueCount === 0) headline = 'Business is on track';
  else if (health?.status === 'green') headline = 'Generally healthy — a few items to clear';
  else if (health?.status === 'amber') headline = 'Some areas need attention';
  else headline = 'Several areas need attention this week';

  const parts = [];
  if (!projects.length) {
    parts.push('No active projects in the portfolio yet.');
  } else if (projects.length === 1) {
    const p = projects[0];
    const phase = String(p.revenueStatus || '').replace(/_/g, ' ');
    parts.push(
      `${p.name} is the active project (${phase}). GDV ${formatCr(p.toplineGdv)}${collPct > 0 ? `, with ${collPct}% collected so far` : ', sales/collections not yet meaningful'}.`
    );
  } else {
    parts.push(`${projects.length} projects · combined GDV ${formatCr(topline)} · ${collPct}% collected across portfolio.`);
  }

  if (issueCount > 0) {
    parts.push(`${issueCount} open item${issueCount !== 1 ? 's' : ''} flagged across sales, delivery, finance, and governance.`);
  } else {
    parts.push('No cross-app red flags right now.');
  }

  return { headline, body: parts.join(' ') };
}

function ResolveLink({ href, label = 'Open' }) {
  if (!href) return null;
  if (href.startsWith('/legacy') || href.startsWith('http')) {
    return (
      <a href={href} className="dm-bh-link">
        {label} →
      </a>
    );
  }
  return (
    <Link to={href} className="dm-bh-link">
      {label} →
    </Link>
  );
}

function PriorityItem({ issue, rank }) {
  return (
    <li className="dm-bh-priority-item">
      <span className="dm-bh-priority-rank">{rank}</span>
      <div className="dm-bh-priority-body">
        <div className="dm-bh-priority-title">{issue.title}</div>
        <div className="dm-bh-priority-meta">
          {issue.projectName ? `${issue.projectName} · ` : ''}
          {issue.recommendedAction}
        </div>
      </div>
      <ResolveLink href={issue.href} />
    </li>
  );
}

export default function DmBusinessHealthPage() {
  const { user } = useOutletContext() || {};
  const [data, setData] = useState(null);
  const [tower, setTower] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const quickLaunch = quickLaunchForUser(user).filter((a) => a.enabled);

  function applyPayload(payload) {
    setData(payload);
    setTower(payload.controlTower || null);
  }

  useEffect(() => {
    dmGovernanceApi
      .dashboard()
      .then(applyPayload)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function refresh() {
    setScanning(true);
    setErr('');
    try {
      applyPayload(await dmGovernanceApi.proactiveScan());
    } catch (e) {
      setErr(e.message);
    } finally {
      setScanning(false);
    }
  }

  if (loading) return <p className="dm-muted">Loading…</p>;
  if (err) {
    return (
      <div>
        <BusinessHealthSubNav />
        <div className="dm-err">{err}</div>
        <p className="dm-muted" style={{ marginTop: 12 }}>
          Try <Link to="/app/dm-governance/calendar">Portfolio calendar</Link> or refresh. If this persists,
          the consolidated dashboard API may be down.
        </p>
      </div>
    );
  }
  if (!data) return null;

  const s = data.summary;
  const health = tower?.health;
  const pillarMap = health?.pillars || {};
  const pillars = PILLAR_ORDER.map((k) => pillarMap[k]).filter(Boolean);
  const issues = tower?.issues || [];
  const priority = issues.filter((i) => ['critical', 'high', 'medium'].includes(i.severity)).slice(0, 3);
  const story = buildStory(s, data.projectCards, health, issues.length);
  const apps = tower?.crossApp?.appSignals ? Object.entries(tower.crossApp.appSignals) : [];
  const connected = apps.filter(([, sig]) => sig.available).length;

  return (
    <div className="dm-bh-simple">
      <BusinessHealthSubNav />
      <header className="dm-bh-head">
        <div>
          <h2 className="dm-bh-head-title">How is the business doing?</h2>
          <p className="dm-bh-head-sub">One view across sales, delivery, finance, and customers</p>
        </div>
        <button type="button" className="dm-btn dm-btn-primary" disabled={scanning} onClick={refresh}>
          {scanning ? 'Updating…' : 'Refresh'}
        </button>
      </header>

      <section className={`dm-bh-verdict dm-bh-verdict-${health?.status || 'amber'}`}>
        <p className="dm-bh-verdict-headline">{story.headline}</p>
        <p className="dm-bh-verdict-body">{story.body}</p>
        {health ? (
          <p className="dm-bh-verdict-score">
            Overall score <strong className={health.status}>{health.portfolioScore}</strong>
            <span className="dm-muted"> / 100</span>
            {tower?.scannedAt ? (
              <span className="dm-muted"> · {new Date(tower.scannedAt).toLocaleDateString('en-IN')}</span>
            ) : null}
          </p>
        ) : null}
      </section>

      {pillars.length ? (
        <section className="dm-bh-pillars">
          <p className="dm-bh-section-label">Six areas of the business</p>
          <div className="dm-bh-pillar-row">
            {pillars.map((p) => (
              <div key={p.key} className="dm-bh-pillar" title={p.hint}>
                <span className={`dm-bh-dot ${p.status}`} aria-hidden />
                <span className="dm-bh-pillar-name">{p.label}</span>
                <span className={`dm-bh-pillar-state ${p.status}`}>{pillarWord(p.status)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="dm-bh-priority">
        <p className="dm-bh-section-label">Fix first</p>
        {priority.length ? (
          <ol className="dm-bh-priority-list">
            {priority.map((issue, i) => (
              <PriorityItem key={issue.id} issue={issue} rank={i + 1} />
            ))}
          </ol>
        ) : (
          <p className="dm-bh-empty">Nothing urgent — keep source apps updated and refresh weekly.</p>
        )}
        {issues.length > 3 ? (
          <p className="dm-bh-more">
            <Link to="/app/dm-governance/risks" className="dm-link">
              {issues.length - 3} more open items
            </Link>
          </p>
        ) : null}
      </section>

      {(data.projectCards || []).length ? (
        <section className="dm-bh-projects">
          <p className="dm-bh-section-label">Projects</p>
          <div className="dm-bh-project-list">
            {(data.projectCards || []).map((p) => (
              <Link key={p.projectId} to={`/app/dm-governance/projects/${p.projectId}`} className="dm-bh-project-card">
                <div className="dm-bh-project-top">
                  <strong>{p.name}</strong>
                  <span className={`dm-badge dm-badge-${p.riskStatus}`}>{p.riskStatus}</span>
                </div>
                <p className="dm-bh-project-line">
                  {String(p.revenueStatus || '').replace(/_/g, ' ')} · GDV {formatCr(p.toplineGdv)} · Collections{' '}
                  {formatCr(p.collectionsTtd)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <details className="dm-bh-details">
        <summary>Source apps ({connected}/{apps.length} connected)</summary>
        <div className="dm-bh-apps-inline">
          {apps.map(([key, sig]) => (
            <span key={key} className={`dm-bh-app-chip ${sig.status}`}>
              {sig.label || key.replace(/_/g, ' ')}
              {sig.available ? '' : ' · not synced'}
            </span>
          ))}
        </div>
        {quickLaunch.length ? (
          <div className="dm-bh-apps-links">
            {quickLaunch.map((app) => (
              <a key={app.appId} href={app.href} className="dm-bh-apps-link">
                {app.label}
              </a>
            ))}
          </div>
        ) : null}
      </details>

      <details className="dm-bh-details">
        <summary>DM billing &amp; fees (finance)</summary>
        <div className="dm-bh-finance-grid">
          <div>
            <span className="dm-bh-fin-lbl">DM billed</span>
            <span className="dm-bh-fin-val">{formatCr(s.dmFeeBilledTtd)}</span>
          </div>
          <div>
            <span className="dm-bh-fin-lbl">DM paid</span>
            <span className="dm-bh-fin-val">{formatCr(s.dmFeePaidTtd)}</span>
          </div>
          <div>
            <span className="dm-bh-fin-lbl">Accrued</span>
            <span className="dm-bh-fin-val">{formatCr(s.dmFeeAccrued)}</span>
          </div>
          <div>
            <span className="dm-bh-fin-lbl">Billing gaps</span>
            <span className="dm-bh-fin-val">{s.exceptionsPending || 0}</span>
          </div>
        </div>
        <p className="dm-bh-finance-nav">
          <Link to="/app/dm-governance/billing-workspace" className="dm-link">
            Billing workspace
          </Link>
          {' · '}
          <Link to="/app/dm-governance/invoices" className="dm-link">
            Invoices
          </Link>
          {' · '}
          <Link to="/app/dm-governance/executive" className="dm-link">
            Executive pack
          </Link>
        </p>
      </details>
    </div>
  );
}
