import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

export default function DmProjectDetailPage() {
  const { projectId } = useParams();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState('');

  const [milestones, setMilestones] = useState(null);

  function load() {
    dmGovernanceApi
      .getProject(projectId)
      .then((r) => {
        setData(r);
        setForm({ ...r.project });
        setMilestones(r.project?.integrationSnapshot?.constructionMilestones || null);
      })
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, [projectId]);

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await dmGovernanceApi.saveProject(projectId, form);
      setMsg('Saved');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function syncCashflow() {
    setSyncing(true);
    try {
      const r = await dmGovernanceApi.syncCashflow(projectId);
      setMsg(r.ok ? `Cashflow synced · revenue status: ${r.revenueStatus}` : r.error);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function syncAll() {
    setSyncing(true);
    try {
      const r = await dmGovernanceApi.syncAll(projectId);
      setMsg(`Full sync complete — collections: ${formatCr(r.project?.collectionsTtd)}`);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function syncMilestones() {
    setSyncing(true);
    try {
      const r = await dmGovernanceApi.syncMilestones(projectId);
      setMsg(
        r.snapshot?.latestAchieved
          ? `Milestone: ${r.snapshot.latestAchieved.label} (${r.snapshot.progressPct}% progress)`
          : 'Milestones synced'
      );
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function syncExecution() {
    setSyncing(true);
    try {
      const r = await dmGovernanceApi.syncExecution(projectId);
      setMsg(r.engineKey ? `Execution linked (${r.engineKey}) · ${r.completion}% complete` : r.error || 'Synced');
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSyncing(false);
    }
  }

  if (!form) return <p className="dm-muted">Loading…</p>;

  const ex = data?.executive || {};

  return (
    <div>
      <p>
        <Link to="/app/dm-governance/projects">← Projects</Link>
        {' · '}
        <Link to={`/app/dm-governance/billing-workspace`}>Billing workspace</Link>
        {' · '}
        <Link to={`/app/dm-governance/billing/${projectId}`}>Billing config</Link>
      </p>
      <h2 style={{ margin: '0 0 8px' }}>{form.name}</h2>
      <p className="dm-page-lead">
        {form.projectCode} · {form.location} · Pilot executive summary
      </p>
      {err ? <div className="dm-err">{err}</div> : null}
      {msg ? <p className="dm-msg-ok">{msg}</p> : null}

      {data?.businessHealth?.pillars ? (
        <details className="dm-bh-details" style={{ marginBottom: 20 }}>
          <summary>6-area health breakdown</summary>
          <div className="dm-bh-pillar-row" style={{ paddingTop: 12 }}>
            {Object.values(data.businessHealth.pillars).map((p) => (
              <div key={p.key} className="dm-bh-pillar">
                <span className={`dm-bh-dot ${p.status}`} />
                <span className="dm-bh-pillar-name">{p.label}</span>
                <span className={`dm-bh-pillar-state ${p.status}`}>
                  {p.status === 'green' ? 'OK' : p.status === 'amber' ? 'Watch' : 'At risk'}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      <div className="dm-kpi-grid">
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">DM cap (10%)</div>
          <div className="dm-kpi-val">{formatCr(ex.dmCap)}</div>
          <div className="dm-formula">eligible base × dmCapPct</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Billed / Balance</div>
          <div className="dm-kpi-val">{formatCr(ex.dmFeeBilled)}</div>
          <div className="dm-kpi-sub">Balance {formatCr(ex.balanceEligible)}</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Cap utilisation</div>
          <div className="dm-kpi-val">{Math.round(ex.capUtilPct || 0)}%</div>
        </div>
        <div className="dm-kpi">
          <div className="dm-kpi-lbl">Collections TTD</div>
          <div className="dm-kpi-val">{formatCr(form.collectionsTtd)}</div>
        </div>
      </div>

      <div className="dm-panel">
        <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <button type="button" className="dm-btn" disabled={syncing} onClick={syncCashflow}>
            {syncing ? 'Syncing…' : 'Sync Cashflow V1'}
          </button>
          <button type="button" className="dm-btn dm-btn-primary" disabled={syncing} onClick={syncAll}>
            Full integration sync
          </button>
          <button type="button" className="dm-btn" disabled={syncing} onClick={syncMilestones}>
            Sync milestones
          </button>
          <button type="button" className="dm-btn" disabled={syncing} onClick={syncExecution}>
            Sync Execution Dashboard
          </button>
        </div>
        <div className="dm-form-grid">
          <div className="dm-field">
            <label>Topline GDV</label>
            <input
              type="number"
              value={form.toplineGdv || 0}
              onChange={(e) => setForm({ ...form, toplineGdv: Number(e.target.value) })}
            />
          </div>
          <div className="dm-field">
            <label>Eligible base type</label>
            <select
              value={form.eligibleBaseType || 'topline_gdv'}
              onChange={(e) => setForm({ ...form, eligibleBaseType: e.target.value })}
            >
              <option value="topline_gdv">topline_gdv</option>
              <option value="agreement_value">agreement_value</option>
              <option value="collections_ttd">collections_ttd</option>
            </select>
          </div>
          <div className="dm-field">
            <label>DM cap %</label>
            <input
              type="number"
              step="0.1"
              value={form.dmCapPct ?? 10}
              onChange={(e) => setForm({ ...form, dmCapPct: Number(e.target.value) })}
            />
          </div>
          <div className="dm-field">
            <label>Revenue status</label>
            <select
              value={form.revenueStatus || 'pre_revenue'}
              onChange={(e) => setForm({ ...form, revenueStatus: e.target.value })}
            >
              <option value="pre_revenue">pre_revenue</option>
              <option value="launched">launched</option>
              <option value="collection_active">collection_active</option>
              <option value="mature">mature</option>
              <option value="completion">completion</option>
            </select>
          </div>
          <div className="dm-field">
            <label>DM sync to Cashflow</label>
            <select
              value={form.dmSyncEnabled ? 'yes' : 'no'}
              onChange={(e) => setForm({ ...form, dmSyncEnabled: e.target.value === 'yes' })}
            >
              <option value="yes">Enabled — replace ga schedule</option>
              <option value="no">Disabled</option>
            </select>
          </div>
          <div className="dm-field">
            <label>Construction progress %</label>
            <input
              type="number"
              value={form.constructionProgressPct || 0}
              onChange={(e) => setForm({ ...form, constructionProgressPct: Number(e.target.value) })}
            />
          </div>
        </div>
        <button type="button" className="dm-btn dm-btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save project'}
        </button>
      </div>

      {milestones?.steps?.length ? (
        <div className="dm-panel">
          <h2>Construction milestones</h2>
          <p className="dm-card-meta" style={{ marginBottom: 10 }}>
            Source: {milestones.source || 'cashflow'} · Progress {milestones.progressPct || 0}%
            {milestones.latestAchieved ? ` · Latest: ${milestones.latestAchieved.label}` : ''}
          </p>
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Target</th>
                  <th>Achieved</th>
                  <th>Cum. CLP %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {milestones.steps.map((s) => (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td>{s.targetIso || '—'}</td>
                    <td>{s.achievedIso || '—'}</td>
                    <td>{s.cumDuePct}%</td>
                    <td>{s.done ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {(data?.spvs || []).length ? (
        <div className="dm-panel">
          <h2>Linked SPVs</h2>
          {data.spvs.map((s) => (
            <div key={s._id}>
              <Link to={`/app/dm-governance/spvs/${s._id}`}>{s.spvName}</Link> — {s.agreementStatus}
            </div>
          ))}
        </div>
      ) : null}

      {data?.billingConfig ? (
        <div className="dm-panel">
          <h2>Active billing model</h2>
          <div className="dm-card-meta">
            {data.billingConfig.modelType} · Retainer {formatCr(data.billingConfig.retainerMonthly)}/mo · Markup{' '}
            {data.billingConfig.markupPct}%
          </div>
          <Link to={`/app/dm-governance/billing/${projectId}`}>Edit billing configuration →</Link>
        </div>
      ) : (
        <div className="dm-err">No billing model configured — set up billing before invoicing.</div>
      )}
    </div>
  );
}
