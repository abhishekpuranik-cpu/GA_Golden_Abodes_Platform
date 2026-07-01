import { useMemo, useState } from 'react';
import { useTickets } from '../../hooks/postsales/useTickets.js';
import { useUnitsLite } from '../../hooks/postsales/useUnits.js';
import { ESCALATION_MATRIX } from '../../data/postsales/steps.js';
import { postSalesApi } from '../../lib/postSalesApi.js';

export default function Tickets() {
  const [filter, setFilter] = useState('all');
  const params = useMemo(() => {
    if (filter === 'breach') return { slaBreach: 'true' };
    if (filter === 'all') return {};
    if (['open', 'acknowledged', 'in_progress', 'resolved', 'escalated', 'closed'].includes(filter)) return { status: filter };
    return { type: filter };
  }, [filter]);

  const { tickets, ackBreachCount, resBreachCount, loading, error, createTicket, updateTicket, refresh } = useTickets(params);
  const { units } = useUnitsLite({});
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ unitId: '', type: 'query', category: 'other', description: '', raisedBy: '', channel: 'call' });

  const loadDetail = async (id) => {
    setSelected(id);
    const d = await postSalesApi.getTicket(id);
    setDetail(d);
  };

  const act = async (body) => {
    await updateTicket(selected, body);
    await loadDetail(selected);
    refresh();
  };

  const submitNew = async (e) => {
    e.preventDefault();
    const t = await createTicket(newForm);
    setShowNew(false);
    loadDetail(t._id);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Customer tickets</h2>
      <div style={{ marginBottom: 12, fontSize: '0.85rem' }}>
        <span className="ps-badge ps-badge-red">Ack breaches: {ackBreachCount}</span>{' '}
        <span className="ps-badge ps-badge-amber">Resolution breaches: {resBreachCount}</span>
      </div>

      <div className="ps-split">
        <div>
          <div className="ps-filter-bar" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            {['all', 'open', 'breach', 'query', 'grievance', 'defect'].map((f) => (
              <button key={f} type="button" className={`ps-btn ${filter === f ? 'ps-btn-primary' : ''}`} style={{ width: '100%' }} onClick={() => setFilter(f)}>
                {f === 'breach' ? 'SLA breach' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {loading && <div className="ps-empty">Loading…</div>}
          {error && <div className="ps-error">{error}</div>}
          {tickets.map((t) => (
            <div key={t._id} className={`ps-list-item ${selected === t._id ? 'active' : ''}`} onClick={() => loadDetail(t._id)}>
              <div><span className="ps-badge ps-badge-blue">{t.ticketNumber}</span> <span className="ps-badge ps-badge-grey">{t.type}</span></div>
              <div style={{ fontSize: '0.8rem' }}>{t.project} · {t.unitNumber}</div>
              <div style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
              {t.ackSlaBreach && <span className="ps-badge ps-badge-red">Ack breach</span>}
              {t.resolutionSlaBreach && <span className="ps-badge ps-badge-amber">Res breach</span>}
            </div>
          ))}
          <button type="button" className="ps-btn ps-btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={() => setShowNew(true)}>+ New ticket</button>
        </div>

        <div>
          {!detail && <div className="ps-empty">Select a ticket</div>}
          {detail && (
            <div className="ps-card">
              <h3 style={{ marginTop: 0 }}>{detail.ticketNumber}</h3>
              <div>{detail.unit?.project} · {detail.unit?.unitNumber} — {detail.customerName}</div>
              <div style={{ marginTop: 8 }}>
                <span className="ps-badge ps-badge-grey">{detail.type}</span>
                <span className="ps-badge ps-badge-blue">{detail.status}</span>
              </div>

              {(detail.ackSlaBreach || detail.resolutionSlaBreach) && (
                <div className="ps-card" style={{ background: 'var(--ps-danger-bg)', marginTop: 12 }}>
                  <strong>SLA breach warning</strong>
                  <div style={{ fontSize: '0.85rem' }}>{ESCALATION_MATRIX.customer_grievance?.label}</div>
                </div>
              )}

              <p style={{ marginTop: 12 }}>{detail.description}</p>

              <div className="ps-card" style={{ fontSize: '0.85rem' }}>
                <div>Raised: {detail.raisedAt ? new Date(detail.raisedAt).toLocaleString('en-IN') : '—'} by {detail.raisedBy}</div>
                <div>Acknowledged: {detail.acknowledgedAt ? new Date(detail.acknowledgedAt).toLocaleString('en-IN') : '—'}</div>
                <div>Resolved: {detail.resolvedAt ? new Date(detail.resolvedAt).toLocaleString('en-IN') : '—'}</div>
                <div>Assigned: {detail.assignedTo || '—'} · {detail.department || '—'}</div>
                {detail.defectType && <div>Defect: {detail.defectType} · DLP expires {detail.dlpExpiryDate ? new Date(detail.dlpExpiryDate).toLocaleDateString('en-IN') : '—'}</div>}
              </div>

              <div className="ps-grid-2" style={{ marginTop: 12 }}>
                <div className={`ps-card ${detail.ackSlaBreach ? 'danger' : ''}`} style={{ background: detail.ackSlaBreach ? 'var(--ps-danger-bg)' : 'var(--ps-success-bg)' }}>
                  <strong>Ack SLA (24h)</strong>
                  <div>{detail.ackSlaBreach ? 'Breached' : 'OK'}</div>
                </div>
                <div className={`ps-card`} style={{ background: detail.resolutionSlaBreach ? 'var(--ps-danger-bg)' : 'var(--ps-success-bg)' }}>
                  <strong>Resolution SLA (7d)</strong>
                  <div>{detail.resolutionSlaBreach ? 'Breached' : 'OK'}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                <button type="button" className="ps-btn" onClick={() => act({ status: 'acknowledged', by: 'CRM' })}>Mark acknowledged</button>
                <button type="button" className="ps-btn" onClick={() => act({ status: 'in_progress', by: 'CRM' })}>In progress</button>
                <button type="button" className="ps-btn ps-btn-primary" onClick={() => act({ status: 'resolved', by: 'CRM' })}>Mark resolved</button>
                <button type="button" className="ps-btn ps-btn-danger" onClick={() => act({ escalatedTo: 'Department Head', by: 'CRM' })}>Escalate</button>
                <select onChange={(e) => act({ assignedTo: e.target.value, by: 'CRM' })} defaultValue="">
                  <option value="">Assign to…</option>
                  <option value="Priya Sharma">Priya Sharma</option>
                  <option value="Ankit Desai">Ankit Desai</option>
                  <option value="Neha Patil">Neha Patil</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <div className="ps-modal-overlay" onClick={() => setShowNew(false)}>
          <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
            <h3>New ticket</h3>
            <form onSubmit={submitNew}>
              <div className="ps-form-group">
                <label>Unit</label>
                <select required value={newForm.unitId} onChange={(e) => setNewForm((f) => ({ ...f, unitId: e.target.value }))}>
                  <option value="">Select unit</option>
                  {units.map((u) => <option key={u._id} value={u._id}>{u.project} · {u.unitNumber}</option>)}
                </select>
              </div>
              <div className="ps-form-group">
                <label>Type</label>
                <select value={newForm.type} onChange={(e) => setNewForm((f) => ({ ...f, type: e.target.value }))}>
                  <option value="query">Query</option>
                  <option value="grievance">Grievance</option>
                  <option value="defect">Defect</option>
                </select>
              </div>
              <div className="ps-form-group">
                <label>Category</label>
                <select value={newForm.category} onChange={(e) => setNewForm((f) => ({ ...f, category: e.target.value }))}>
                  {['payment', 'documentation', 'construction', 'legal', 'other'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {newForm.type === 'defect' && (
                <div className="ps-form-group">
                  <label>Defect type</label>
                  <select value={newForm.defectType || 'finishing'} onChange={(e) => setNewForm((f) => ({ ...f, defectType: e.target.value }))}>
                    <option value="structural">Structural</option>
                    <option value="finishing">Finishing</option>
                    <option value="services">Services</option>
                  </select>
                </div>
              )}
              <div className="ps-form-group"><label>Description</label><textarea required rows={3} value={newForm.description} onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))} /></div>
              <div className="ps-form-group"><label>Raised by</label><input value={newForm.raisedBy} onChange={(e) => setNewForm((f) => ({ ...f, raisedBy: e.target.value }))} /></div>
              <div className="ps-form-group">
                <label>Channel</label>
                <select value={newForm.channel} onChange={(e) => setNewForm((f) => ({ ...f, channel: e.target.value }))}>
                  {['call', 'email', 'whatsapp', 'helpdesk'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="submit" className="ps-btn ps-btn-primary">Create ticket</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
