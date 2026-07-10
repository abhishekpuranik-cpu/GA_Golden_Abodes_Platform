import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { hiringApi } from '../../lib/hiringApi.js';
import EntityTagSelect from '../../components/hiring/EntityTagSelect.jsx';
import MoneyInput from '../../components/hiring/MoneyInput.jsx';
import EmptyState from '../../components/hiring/EmptyState.jsx';

const STATUSES = ['Draft', 'Sourcing', 'Shortlisting', 'Interviewing', 'Offer', 'Hiring Fulfilled', 'Closed', 'Cancelled'];
const OPEN_STATUSES = ['Draft', 'Sourcing', 'Shortlisting', 'Interviewing', 'Offer'];

export default function RequisitionBoard() {
  const { canWrite } = useOutletContext();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('open');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    entityTag: 'GAPL',
    role: '',
    department: '',
    projectName: '',
    location: 'Pune (PCMC)',
    brief: '',
    bandMinPaise: null,
    bandMaxPaise: null,
    experienceMinYears: null,
    experienceMaxYears: null,
    headcount: 1,
    requestedBy: '',
    approvedBy: ''
  });
  const [jdFile, setJdFile] = useState(null);
  const [emailFile, setEmailFile] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    const params = filter && filter !== 'open' && filter !== 'all' ? { status: filter } : {};
    hiringApi.requirementsReport(params)
      .then((d) => {
        let list = d.requirements || [];
        if (filter === 'open') {
          list = list.filter((r) => OPEN_STATUSES.includes(r.status));
        }
        setRows(list);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setErr('');
    try {
      const doc = await hiringApi.createRequisition(form, { jd: jdFile, email: emailFile });
      setShowNew(false);
      setJdFile(null);
      setEmailFile(null);
      navigate(`/app/hiring/req/${doc._id}`);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <>
      <div className="hr-toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="open">Open positions</option>
          <option value="all">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {canWrite && (
          <button type="button" className="hr-btn hr-btn-gold" onClick={() => setShowNew(true)}>
            + New requisition
          </button>
        )}
      </div>

      {err && <p className="hr-error">{err}</p>}

      {loading ? (
        <p className="hr-muted">Loading positions…</p>
      ) : !rows.length ? (
        <EmptyState
          title={filter === 'open' ? 'No open positions' : 'No requisitions yet'}
          hint="Create a requisition to start sourcing candidates."
          action={canWrite && (
            <button type="button" className="hr-btn" onClick={() => setShowNew(true)}>+ New requisition</button>
          )}
        />
      ) : (
        <div className="hr-req-board">
          <div className="hr-req-board-meta">
            <span>{rows.length} position{rows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="hr-table-wrap hr-req-table-wrap">
            <table className="hr-table hr-req-table">
              <thead>
                <tr>
                  <th>Position</th>
                  <th>Where</th>
                  <th>Fill</th>
                  <th>Stage</th>
                  <th>Requested by</th>
                  <th>Approved by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.requisitionId}
                    className="hr-table-row-click"
                    onClick={() => navigate(`/app/hiring/req/${r.requisitionId}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/app/hiring/req/${r.requisitionId}`)}
                    role="link"
                    tabIndex={0}
                  >
                    <td>
                      <Link
                        className="hr-req-code"
                        to={`/app/hiring/req/${r.requisitionId}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {r.positionNumber}
                      </Link>
                      <div className="hr-req-role">{r.role}</div>
                      <div className="hr-req-sub">{r.entityTag}{r.band ? ` · ${r.band}` : ''}</div>
                    </td>
                    <td>
                      <div className="hr-req-primary">{r.project || '—'}</div>
                      <div className="hr-req-sub">{r.location}</div>
                    </td>
                    <td>
                      <div className="hr-req-fill">
                        <span className="hr-req-fill-num">{r.hired}/{r.headcount}</span>
                        <span className="hr-req-sub">{r.totalCandidates ?? 0} candidates</span>
                      </div>
                    </td>
                    <td>
                      <span className={`hr-status-pill hr-status-${String(r.status).toLowerCase().replace(/\s+/g, '-')}`}>
                        {r.status}
                      </span>
                      <div className="hr-req-sub">
                        {r.daysInCurrentStage ?? '—'}d in stage · {r.daysOpen ?? '—'}d open
                      </div>
                    </td>
                    <td>
                      <span className="hr-person">{r.requestedBy || '—'}</span>
                    </td>
                    <td>
                      <span className="hr-person">{r.approvedBy || '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && (
        <div className="hr-modal-backdrop" onClick={() => setShowNew(false)}>
          <div className="hr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>New requisition</h2>
            <form onSubmit={handleCreate}>
              <EntityTagSelect value={form.entityTag} onChange={(v) => setForm({ ...form, entityTag: v })} />
              <div className="hr-form-row">
                <label>Role</label>
                <input required value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
              </div>
              <div className="hr-form-row">
                <label>Department</label>
                <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="e.g. Post Sales" />
              </div>
              <div className="hr-form-row">
                <label>Project</label>
                <input value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} placeholder="e.g. Group (HQ)" />
              </div>
              <div className="hr-form-row">
                <label>Location</label>
                <select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
                  <option>Pune (PCMC)</option>
                  <option>Mumbai</option>
                  <option>Goa</option>
                </select>
              </div>
              <MoneyInput
                label="Band min (₹/year)"
                valuePaise={form.bandMinPaise}
                onChangePaise={(v) => setForm({ ...form, bandMinPaise: v })}
              />
              <MoneyInput
                label="Band max (₹/year)"
                valuePaise={form.bandMaxPaise}
                onChangePaise={(v) => setForm({ ...form, bandMaxPaise: v })}
              />
              <div className="hr-form-row hr-form-row-inline">
                <label>Experience (years)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={form.experienceMinYears ?? ''}
                  onChange={(e) => setForm({ ...form, experienceMinYears: e.target.value ? Number(e.target.value) : null })}
                />
                <span>–</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={form.experienceMaxYears ?? ''}
                  onChange={(e) => setForm({ ...form, experienceMaxYears: e.target.value ? Number(e.target.value) : null })}
                />
              </div>
              <div className="hr-form-row">
                <label>Headcount</label>
                <input
                  type="number"
                  min="1"
                  value={form.headcount}
                  onChange={(e) => setForm({ ...form, headcount: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="hr-form-row hr-form-row-inline">
                <div style={{ flex: 1 }}>
                  <label>Requested by</label>
                  <input
                    value={form.requestedBy}
                    onChange={(e) => setForm({ ...form, requestedBy: e.target.value })}
                    placeholder="Hiring manager / requester"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Approved by</label>
                  <input
                    value={form.approvedBy}
                    onChange={(e) => setForm({ ...form, approvedBy: e.target.value })}
                    placeholder="Approver name"
                  />
                </div>
              </div>
              <div className="hr-form-row">
                <label>Job description file (PDF, DOC, DOCX)</label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={(e) => setJdFile(e.target.files?.[0] || null)}
                />
                {jdFile && <span className="hr-muted">{jdFile.name}</span>}
              </div>
              <div className="hr-form-row">
                <label>Hiring request email (.eml, .msg, .txt)</label>
                <input
                  type="file"
                  accept=".eml,.msg,.txt,.html,.htm"
                  onChange={(e) => setEmailFile(e.target.files?.[0] || null)}
                />
                {emailFile && <span className="hr-muted">{emailFile.name}</span>}
              </div>
              <div className="hr-form-row">
                <label>Job brief (sent to Metaview)</label>
                <textarea required rows={5} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} placeholder="Describe responsibilities, must-have skills, and context for sourcing…" />
              </div>
              <div className="hr-toolbar">
                <button type="submit" className="hr-btn hr-btn-gold">Create</button>
                <button type="button" className="hr-btn hr-btn-outline" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
