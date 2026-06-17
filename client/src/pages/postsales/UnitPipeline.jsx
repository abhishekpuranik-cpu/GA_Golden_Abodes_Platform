import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useUnit } from '../../hooks/postsales/useUnits.js';
import { useSteps } from '../../hooks/postsales/useSteps.js';
import { STEPS, PHASES, ESCALATION_MATRIX } from '../../data/postsales/steps.js';

function fmt(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

function numClass(status) {
  if (status === 'completed') return 'completed';
  if (status === 'overdue') return 'overdue';
  if (status === 'in_progress') return 'in_progress';
  return 'pending';
}

export default function UnitPipeline() {
  const { id } = useParams();
  const { unit, loading: unitLoading, error: unitError, refresh: refreshUnit } = useUnit(id);
  const { steps, loading: stepsLoading, error: stepsError, updateStep, toggleChecklist } = useSteps(id);
  const [selected, setSelected] = useState(1);
  const [tab, setTab] = useState('checklist');
  const [notes, setNotes] = useState('');
  const [actionError, setActionError] = useState(null);

  useEffect(() => {
    if (unit?.currentStepNumber) setSelected(unit.currentStepNumber);
  }, [unit?.currentStepNumber]);

  const stepDef = useMemo(() => STEPS.find((s) => s.number === selected), [selected]);
  const stepRecord = useMemo(() => steps.find((s) => s.stepNumber === selected), [steps, selected]);
  const fundingType = unit?.customer?.fundingType || unit?.customerId?.fundingType;

  const grouped = useMemo(() => {
    const g = {};
    for (const s of steps) {
      if (!g[s.phase]) g[s.phase] = [];
      g[s.phase].push(s);
    }
    return g;
  }, [steps]);

  const breachCount = steps.filter((s) => s.slaBreach || s.status === 'overdue').length;
  const doneCount = stepRecord?.checklist?.filter((c) => c.done).length || 0;
  const totalCheck = stepRecord?.checklist?.length || 0;

  const handleComplete = async () => {
    setActionError(null);
    try {
      await updateStep(selected, { status: 'completed', notes });
      await refreshUnit();
      if (selected < 20) setSelected(selected + 1);
    } catch (e) {
      setActionError(e.message);
    }
  };

  const handleEscalate = async () => {
    setActionError(null);
    try {
      const rule = stepDef?.escalation ? ESCALATION_MATRIX[stepDef.escalation] : null;
      await updateStep(selected, {
        escalatedTo: rule?.label || 'Management',
        escalationReason: `Escalation: ${stepDef?.escalation}`,
      });
    } catch (e) {
      setActionError(e.message);
    }
  };

  if (unitLoading || stepsLoading) return <div className="ps-empty">Loading pipeline…</div>;
  if (unitError || stepsError) return <div className="ps-error">{unitError || stepsError}</div>;
  if (!unit) return <div className="ps-empty">Unit not found</div>;

  const customer = unit.customer || unit.customerId;

  return (
    <div>
      <div className="ps-header-bar">
        <Link to="/app/post-sales/units" className="ps-btn">← Back</Link>
        <strong>{unit.project} · {unit.unitNumber}</strong>
        <span className="ps-chip">{customer?.name}</span>
        <span className="ps-chip">{unit.entity}</span>
        <span className="ps-chip">{unit.crmExecutive}</span>
        <span className="ps-badge ps-badge-blue">{fundingType === 'self_funded' ? 'Self-funded' : 'Home loan'}</span>
        <span className="ps-badge ps-badge-grey">{unit.paymentPlan}</span>
        <span className="ps-chip">{fmt(unit.totalCost)}</span>
        {breachCount > 0 && <span className="ps-badge ps-badge-red">{breachCount} SLA breach</span>}
      </div>

      <div className="ps-pipeline-layout">
        <div className="ps-step-list">
          {Object.entries(grouped).map(([phase, phaseSteps]) => (
            <div key={phase}>
              <div className="ps-phase-header" style={{ color: PHASES[phase]?.color }}>
                {PHASES[phase]?.label || phase}
              </div>
              {phaseSteps.map((s) => (
                <div
                  key={s.stepNumber}
                  className={`ps-step-row ${selected === s.stepNumber ? 'active' : ''}`}
                  style={selected === s.stepNumber ? { borderLeftColor: PHASES[s.phase]?.color } : {}}
                  onClick={() => { setSelected(s.stepNumber); setTab('checklist'); setNotes(s.notes || ''); }}
                >
                  <span className={`ps-step-num ${numClass(s.status)}`}>
                    {s.status === 'completed' ? '✓' : s.stepNumber}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.stepName}</span>
                  {(s.status === 'overdue' || s.slaBreach) && <span className="ps-badge ps-badge-red">OVERDUE</span>}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="ps-card">
          <h3 style={{ marginTop: 0 }}>Step {selected}: {stepDef?.name}</h3>

          <div className="ps-tabs">
            {['checklist', 'details', 'escalation'].map((t) => (
              <button key={t} type="button" className={`ps-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {actionError && <div className="ps-error">{actionError}</div>}

          {tab === 'checklist' && (
            <>
              {stepDef?.fundingTypeSplit && (
                <div className="ps-card" style={{ background: 'var(--ps-accent-soft)', marginBottom: 12 }}>
                  {fundingType === 'self_funded' ? 'Self-funded flow' : 'Home loan flow'}
                </div>
              )}
              <div style={{ fontSize: '0.85rem', marginBottom: 8 }}>{doneCount}/{totalCheck} complete</div>
              <div className="ps-progress"><div className="ps-progress-fill" style={{ width: totalCheck ? `${(doneCount / totalCheck) * 100}%` : '0%' }} /></div>
              {(stepRecord?.checklist || []).map((item, i) => (
                <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 0', cursor: stepRecord?.status === 'completed' ? 'default' : 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!item.done}
                    disabled={stepRecord?.status === 'completed'}
                    onChange={(e) => toggleChecklist(selected, i, e.target.checked)}
                  />
                  <span style={{ textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--ps-text-muted)' : 'inherit' }}>{item.item}</span>
                </label>
              ))}
              {stepDef?.clearanceSequence && (
                <div style={{ marginTop: 16 }}>
                  <strong>Clearance sequence</strong>
                  <div style={{ marginTop: 8 }}>
                    {stepDef.clearanceSequence.map((c, i) => (
                      <span key={c}>
                        <span className="ps-chip">{c}</span>
                        {i < stepDef.clearanceSequence.length - 1 && ' → '}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {stepDef?.defectCategories && (
                <div style={{ marginTop: 16 }}>
                  <strong>DLP categories</strong>
                  <div className="ps-grid-2" style={{ marginTop: 8 }}>
                    {stepDef.defectCategories.map((d) => (
                      <div key={d.type} className="ps-card" style={{ margin: 0 }}>
                        <strong>{d.label}</strong>
                        <div style={{ fontSize: '0.8rem' }}>{d.dlp}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ps-text-muted)' }}>{d.examples}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {tab === 'details' && (
            <div style={{ fontSize: '0.9rem', lineHeight: 1.8 }}>
              <div><strong>Trigger:</strong> {stepDef?.triggerEvent}</div>
              <div><strong>Assigned role:</strong> {stepDef?.assignedRole}</div>
              <div><strong>SLA:</strong> {stepDef?.slaDays ? `${stepDef.slaDays} ${stepDef.slaUnit}` : stepDef?.slaAck ? `Ack ${stepDef.slaAck}d / Resolve ${stepDef.slaResolution}d` : '—'}</div>
              {stepDef?.blockedBy?.length > 0 && (
                <div><strong>Blocked by steps:</strong> {stepDef.blockedBy.join(', ')}</div>
              )}
              <div className="ps-form-group" style={{ marginTop: 12 }}>
                <label>Notes</label>
                <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={stepRecord?.status === 'completed'} />
              </div>
            </div>
          )}

          {tab === 'escalation' && (
            <>
              {stepDef?.escalation && (
                <div className="ps-card" style={{ background: 'var(--ps-warning-bg)', borderColor: '#fde68a' }}>
                  <strong>This step:</strong> {ESCALATION_MATRIX[stepDef.escalation]?.label}
                </div>
              )}
              <h4>Escalation matrix</h4>
              {Object.entries(ESCALATION_MATRIX).map(([key, val]) => (
                <div key={key} style={{ padding: '6px 0', borderBottom: '1px solid var(--ps-border)', fontSize: '0.85rem' }}>
                  <span className="ps-badge ps-badge-grey">L{val.level}</span> {val.label}
                </div>
              ))}
            </>
          )}

          {stepRecord?.status !== 'completed' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--ps-border)' }}>
              <button type="button" className="ps-btn ps-btn-primary" onClick={handleComplete}>Mark complete</button>
              <button type="button" className="ps-btn ps-btn-danger" onClick={handleEscalate}>Escalate</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
