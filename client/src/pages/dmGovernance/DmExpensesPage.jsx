import { useEffect, useState } from 'react';
import { dmGovernanceApi, formatCr } from '../../lib/dmGovernanceApi.js';

const PILOT = 'P004';

export default function DmExpensesPage() {
  const [projectId, setProjectId] = useState(PILOT);
  const [projects, setProjects] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    dmGovernanceApi
      .listExpenses(projectId)
      .then((r) => setExpenses(r.expenses || []))
      .catch((e) => setErr(e.message));
  }

  useEffect(() => {
    dmGovernanceApi.listProjects().then((r) => setProjects(r.projects || []));
  }, []);

  useEffect(() => {
    if (projectId) load();
  }, [projectId]);

  async function importCf() {
    setBusy(true);
    setErr('');
    try {
      const r = await dmGovernanceApi.importExpenses(projectId);
      setMsg(`Imported ${r.imported} from Cashflow (${r.skipped} skipped)`);
      load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const billable = expenses.filter((e) => e.billableToSpv);
  const total = billable.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Expense &amp; Reimbursement Tracker</h2>
      {err ? <div className="dm-err">{err}</div> : null}
      {msg ? <p className="dm-msg-ok">{msg}</p> : null}
      <div className="dm-panel">
        <div className="dm-form-grid">
          <div className="dm-field">
            <label>Project</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="button" className="dm-btn dm-btn-primary" disabled={busy} onClick={importCf}>
          Import from Cashflow V1 actuals
        </button>
        <p className="dm-page-lead" style={{ marginTop: 10 }}>
          Billable total: {formatCr(total)} ({billable.length} items)
        </p>
      </div>
      <div className="dm-table-wrap">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Vendor</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Billable</th>
              <th>Status</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e._id}>
                <td>{e.date || '—'}</td>
                <td>{e.vendor || '—'}</td>
                <td>{e.expenseCategory}</td>
                <td>{formatCr(e.amount)}</td>
                <td>{e.billableToSpv ? 'Yes' : 'No'}</td>
                <td>{e.approvalStatus}</td>
                <td>{e.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
