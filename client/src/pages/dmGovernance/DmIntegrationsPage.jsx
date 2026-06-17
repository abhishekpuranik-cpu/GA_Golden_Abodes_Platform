import { useEffect, useState } from 'react';
import { dmGovernanceApi } from '../../lib/dmGovernanceApi.js';

const PILOT = 'P004';

export default function DmIntegrationsPage() {
  const [logs, setLogs] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    Promise.all([dmGovernanceApi.integrationStatus(), dmGovernanceApi.listBillingTriggers(PILOT)])
      .then(([l, t]) => {
        setLogs(l.logs || []);
        setTriggers(t.triggers || []);
      })
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function fullSync() {
    setBusy(true);
    setErr('');
    try {
      const r = await dmGovernanceApi.syncAll(PILOT);
      setMsg(
        `Full sync OK — cashflow: ${r.results?.cashflow?.ok ? 'yes' : 'no'}, expenses: ${r.results?.expenses?.imported || 0}, risks: ${r.results?.risks?.count || 0}`
      );
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function syncMilestones() {
    setBusy(true);
    setErr('');
    try {
      const r = await dmGovernanceApi.syncMilestones(PILOT);
      setMsg(`Milestones synced — ${r.snapshot?.steps?.length || 0} steps`);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function syncExecution() {
    setBusy(true);
    setErr('');
    try {
      const r = await dmGovernanceApi.syncExecution(PILOT);
      setMsg(r.ok ? `Execution linked: ${r.engineKey || '—'}` : r.error);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 8px' }}>Integrations</h2>
      <p className="dm-page-lead">
        Cashflow V1 · Resource Planner V2 · Expense import · Sales/collections · Construction milestones · Risk scan · Billing triggers
      </p>
      {err ? <div className="dm-err">{err}</div> : null}
      {msg ? <p className="dm-msg-ok">{msg}</p> : null}

      <div className="dm-panel">
        <h2>Golden HQ — full sync</h2>
        <p className="dm-card-meta" style={{ marginBottom: 12 }}>
          Pulls collections, expenses, V2 costs, compliance checklist, detects billing triggers and risks.
        </p>
        <button type="button" className="dm-btn dm-btn-primary" disabled={busy} onClick={fullSync}>
          {busy ? 'Syncing…' : 'Run full sync (P004)'}
        </button>
        <button type="button" className="dm-btn" disabled={busy} onClick={syncMilestones} style={{ marginLeft: 8 }}>
          Sync milestones
        </button>
        <button type="button" className="dm-btn" disabled={busy} onClick={syncExecution} style={{ marginLeft: 8 }}>
          Sync Execution Dashboard
        </button>
      </div>

      {triggers.length ? (
        <div className="dm-panel">
          <h2>Pending billing triggers</h2>
          {triggers.map((t) => (
            <div key={t._id} className="dm-warning-text" style={{ fontSize: 13, marginBottom: 8 }}>
              {t.message} ({t.projectId})
            </div>
          ))}
        </div>
      ) : null}

      <p className="dm-section-title">Sync log</p>
      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Source</th>
              <th>Project</th>
              <th>Status</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i}>
                <td>{l.at ? new Date(l.at).toLocaleString('en-IN') : '—'}</td>
                <td>{l.source}</td>
                <td>{l.projectId || '—'}</td>
                <td>{l.status}</td>
                <td>{l.userEmail || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
