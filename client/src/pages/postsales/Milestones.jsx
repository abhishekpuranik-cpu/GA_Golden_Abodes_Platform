import { useMemo, useState } from 'react';
import { useMilestones } from '../../hooks/postsales/useMilestones.js';
import { PROJECTS } from '../../data/postsales/steps.js';

export default function Milestones() {
  const { milestones, loading, error, createMilestone, triggerMilestone } = useMilestones({});
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState('');
  const [form, setForm] = useState({ project: 'Golden HQ', tower: '', milestoneName: '', clpPercent: '', completedDate: '', loggedBy: '' });

  const counts = useMemo(() => ({
    pending: milestones.filter((m) => m.demandTriggerStatus === 'pending').length,
    triggered: milestones.filter((m) => m.demandTriggerStatus === 'triggered').length,
    completed: milestones.filter((m) => m.demandTriggerStatus === 'completed').length,
  }), [milestones]);

  const grouped = useMemo(() => {
    const g = { pending: [], triggered: [], completed: [] };
    for (const m of milestones) g[m.demandTriggerStatus]?.push(m);
    return g;
  }, [milestones]);

  const submit = async (e) => {
    e.preventDefault();
    await createMilestone({ ...form, clpPercent: Number(form.clpPercent), completedDate: form.completedDate || new Date() });
    setShowForm(false);
    setForm({ project: 'Golden HQ', tower: '', milestoneName: '', clpPercent: '', completedDate: '', loggedBy: '' });
  };

  const handleTrigger = async (id) => {
    const r = await triggerMilestone(id);
    setToast(`${r.demandsCreated} demand letters created for ${r.unitsAffected} units`);
    setTimeout(() => setToast(''), 4000);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Engineering milestones</h2>

      <div className="ps-kpi-grid">
        <div className="ps-kpi warning"><div className="ps-kpi-label">Pending trigger</div><div className="ps-kpi-value">{counts.pending}</div></div>
        <div className="ps-kpi"><div className="ps-kpi-label">Triggered</div><div className="ps-kpi-value">{counts.triggered}</div></div>
        <div className="ps-kpi"><div className="ps-kpi-label">Completed</div><div className="ps-kpi-value">{counts.completed}</div></div>
      </div>

      <button type="button" className="ps-btn ps-btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(!showForm)}>
        + Log milestone completion
      </button>

      {showForm && (
        <form className="ps-card" onSubmit={submit}>
          <div className="ps-form-group">
            <label>Project</label>
            <select value={form.project} onChange={(e) => setForm((f) => ({ ...f, project: e.target.value }))}>
              {PROJECTS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div className="ps-form-group"><label>Tower</label><input value={form.tower} onChange={(e) => setForm((f) => ({ ...f, tower: e.target.value }))} /></div>
          <div className="ps-form-group"><label>Milestone name</label><input required value={form.milestoneName} onChange={(e) => setForm((f) => ({ ...f, milestoneName: e.target.value }))} /></div>
          <div className="ps-form-group"><label>CLP %</label><input type="number" required value={form.clpPercent} onChange={(e) => setForm((f) => ({ ...f, clpPercent: e.target.value }))} /></div>
          <div className="ps-form-group"><label>Completion date</label><input type="date" value={form.completedDate} onChange={(e) => setForm((f) => ({ ...f, completedDate: e.target.value }))} /></div>
          <div className="ps-form-group"><label>Logged by</label><input value={form.loggedBy} onChange={(e) => setForm((f) => ({ ...f, loggedBy: e.target.value }))} /></div>
          <button type="submit" className="ps-btn ps-btn-primary">Submit milestone</button>
        </form>
      )}

      {error && <div className="ps-error">{error}</div>}
      {loading && <div className="ps-empty">Loading…</div>}
      {toast && <div className="ps-toast">{toast}</div>}

      {['pending', 'triggered', 'completed'].map((status) => (
        <div key={status}>
          <h4 style={{ textTransform: 'capitalize' }}>{status}</h4>
          {(grouped[status] || []).map((m) => (
            <div key={m._id} className="ps-card" style={status === 'pending' ? { background: 'var(--ps-warning-bg)' } : {}}>
              <strong>{m.project} · {m.tower}</strong> — {m.milestoneName}
              <div style={{ fontSize: '0.85rem' }}>CLP {m.clpPercent}% · {m.completedDate ? new Date(m.completedDate).toLocaleDateString('en-IN') : '—'}</div>
              {status === 'pending' && (
                <button type="button" className="ps-btn ps-btn-primary" style={{ marginTop: 8 }} onClick={() => handleTrigger(m._id)}>
                  Trigger demand letters →
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
