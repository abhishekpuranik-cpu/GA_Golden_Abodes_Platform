import { useEffect, useMemo, useState } from 'react';

import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';

import { useUnit } from '../../hooks/postsales/useUnits.js';

import { useSteps } from '../../hooks/postsales/useSteps.js';

import { useDocuments } from '../../hooks/postsales/useDocuments.js';

import { useAssignees } from '../../hooks/postsales/useMyTasks.js';

import { STEPS, PHASES, ESCALATION_MATRIX } from '../../data/postsales/steps.js';

import { DOC_GROUPS, TYPE_LABELS, docTypesForStep } from '../../data/postsales/stepDocs.js';

import { formatDueDate, formatSlaTarget, slaCountdown } from '../../lib/postSalesSla.js';

import { getStepTaskKind, defaultAssigneeForKind, TASK_KINDS } from '../../data/postsales/taskKinds.js';

import { postSalesApi } from '../../lib/postSalesApi.js';



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



const ACTION_LABELS = {

  assigned: 'Assigned',

  started: 'Started',

  checklist: 'Checklist',

  document_uploaded: 'Document uploaded',

  completed: 'Completed',

  escalated: 'Escalated',

  note: 'Note',

};



export default function UnitPipeline() {

  const { id } = useParams();

  const [searchParams] = useSearchParams();

  const { user } = useOutletContext() || {};

  const actor = user?.name || user?.email || '';

  const { unit, loading: unitLoading, error: unitError, refresh: refreshUnit } = useUnit(id);

  const { steps, loading: stepsLoading, error: stepsError, updateStep, toggleChecklist } = useSteps(id, actor);

  const { documents, createDocument } = useDocuments(id);

  const { cxTeam, backendTeam } = useAssignees();

  const [selected, setSelected] = useState(1);

  const [tab, setTab] = useState('checklist');

  const [notes, setNotes] = useState('');

  const [assignee, setAssignee] = useState('');

  const [cxExecutive, setCxExecutive] = useState('');

  const [backendExecutive, setBackendExecutive] = useState('');

  const [savingExecs, setSavingExecs] = useState(false);

  const [actionError, setActionError] = useState(null);

  const [docForm, setDocForm] = useState({ docType: 'booking_form', driveLink: '', label: '' });



  useEffect(() => {

    const fromQuery = Number(searchParams.get('step'));

    if (fromQuery >= 1 && fromQuery <= 20) setSelected(fromQuery);

    else if (unit?.currentStepNumber) setSelected(unit.currentStepNumber);

  }, [unit?.currentStepNumber, searchParams]);



  useEffect(() => {

    const rec = steps.find((s) => s.stepNumber === selected);

    const kind = rec?.taskKind || getStepTaskKind(selected);

    setNotes(rec?.notes || '');

    setAssignee(rec?.assignedTo || defaultAssigneeForKind(unit, kind) || '');

  }, [selected, steps, unit?.crmExecutive, unit?.cxExecutive, unit?.backendExecutive]);



  useEffect(() => {

    setCxExecutive(unit?.cxExecutive || '');

    setBackendExecutive(unit?.backendExecutive || '');

  }, [unit?.cxExecutive, unit?.backendExecutive]);



  const stepDef = useMemo(() => STEPS.find((s) => s.number === selected), [selected]);

  const stepRecord = useMemo(() => steps.find((s) => s.stepNumber === selected), [steps, selected]);

  const stepTaskKind = stepRecord?.taskKind || getStepTaskKind(selected);

  const stepKindMeta = TASK_KINDS[stepTaskKind] || TASK_KINDS.cx;

  const suggestedAssignees = stepTaskKind === 'backend' ? backendTeam : cxTeam;

  const fundingType = unit?.customer?.fundingType || unit?.customerId?.fundingType;

  const slaInfo = slaCountdown(stepRecord);



  const stepDocTypes = useMemo(() => docTypesForStep(selected), [selected]);

  const stepDocuments = useMemo(

    () => documents.filter((d) => d.stepNumber === selected || stepDocTypes.includes(d.docType)),

    [documents, selected, stepDocTypes]

  );



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



  const handleAssign = async () => {

    setActionError(null);

    try {

      await updateStep(selected, { assignedTo: assignee });

    } catch (e) {

      setActionError(e.message);

    }

  };



  const handleSaveExecutives = async () => {

    setActionError(null);

    setSavingExecs(true);

    try {

      await postSalesApi.updateUnit(id, { cxExecutive, backendExecutive });

      await refreshUnit();

    } catch (e) {

      setActionError(e.message);

    } finally {

      setSavingExecs(false);

    }

  };



  const handleUseDefaultAssignee = () => {

    setAssignee(defaultAssigneeForKind(unit, stepTaskKind) || '');

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



  const handleDocUpload = async (e) => {

    e.preventDefault();

    setActionError(null);

    try {

      await createDocument({

        unitId: id,

        stepNumber: selected,

        docType: docForm.docType,

        label: docForm.label || TYPE_LABELS[docForm.docType],

        driveLink: docForm.driveLink,

        status: 'uploaded',

        uploadedBy: actor,

      });

      setDocForm((f) => ({ ...f, driveLink: '', label: '' }));

    } catch (err) {

      setActionError(err.message);

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

        {unit.cxExecutive && (
          <span className="ps-chip" style={{ borderColor: TASK_KINDS.cx.color }} title="CX executive">CX: {unit.cxExecutive}</span>
        )}

        {unit.backendExecutive && (
          <span className="ps-chip" style={{ borderColor: TASK_KINDS.backend.color }} title="Backend executive">Backend: {unit.backendExecutive}</span>
        )}

        {unit.crmExecutive && !unit.cxExecutive && !unit.backendExecutive && (
          <span className="ps-chip">{unit.crmExecutive}</span>
        )}

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

                  onClick={() => { setSelected(s.stepNumber); setTab('checklist'); }}

                >

                  <span className={`ps-step-num ${numClass(s.status)}`}>

                    {s.status === 'completed' ? '✓' : s.stepNumber}

                  </span>

                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.stepName}</span>

                  {(() => {
                    const k = TASK_KINDS[s.taskKind || getStepTaskKind(s.stepNumber)] || TASK_KINDS.cx;
                    return (
                      <span className="ps-badge" style={{ fontSize: '0.65rem', background: `${k.color}18`, color: k.color }}>
                        {k.shortLabel}
                      </span>
                    );
                  })()}

                  {(s.status === 'overdue' || s.slaBreach) && <span className="ps-badge ps-badge-red">OVERDUE</span>}

                </div>

              ))}

            </div>

          ))}

        </div>



        <div className="ps-card">

          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>

            <h3 style={{ marginTop: 0 }}>Step {selected}: {stepDef?.name}</h3>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                className="ps-badge"
                style={{ background: `${stepKindMeta.color}18`, color: stepKindMeta.color, border: `1px solid ${stepKindMeta.color}44` }}
              >
                {stepKindMeta.shortLabel} · {stepKindMeta.label}
              </span>

            {stepRecord?.status !== 'completed' && slaInfo && (

              <span className={`ps-badge ps-badge-${slaInfo.tone === 'danger' ? 'red' : slaInfo.tone === 'warning' ? 'amber' : 'blue'}`}>

                {slaInfo.label}

              </span>

            )}
            </div>

          </div>



          <div className="ps-sla-bar">

            <span><strong>SLA target:</strong> {formatSlaTarget(stepDef)}</span>

            <span><strong>Due:</strong> {formatDueDate(stepRecord?.dueDate)}</span>

            {stepRecord?.assignedTo && <span><strong>Assignee:</strong> {stepRecord.assignedTo}</span>}

            {stepRecord?.completedDate && (

              <span><strong>Completed:</strong> {formatDueDate(stepRecord.completedDate)} {stepRecord.completedBy ? `by ${stepRecord.completedBy}` : ''}</span>

            )}

          </div>



          <div className="ps-tabs">

            {['checklist', 'documents', 'details', 'activity', 'escalation'].map((t) => (

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

            </>

          )}



          {tab === 'documents' && (

            <>

              <p style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>

                Uploads here are stored in the same document vault as the Documents tab (linked by unit + step).

              </p>

              {stepDocTypes.length === 0 ? (

                <div className="ps-empty">No standard document placeholders for this step.</div>

              ) : (

                stepDocTypes.map((type) => {

                  const doc = stepDocuments.find((d) => d.docType === type);

                  return (

                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--ps-border)' }}>

                      <div>

                        <strong>{TYPE_LABELS[type]}</strong>

                        <div>{doc ? <span className="ps-badge ps-badge-green">{doc.status}</span> : <span className="ps-badge ps-badge-grey">missing</span>}</div>

                      </div>

                      {doc?.driveLink ? (

                        <a href={doc.driveLink} target="_blank" rel="noreferrer" className="ps-btn">Open</a>

                      ) : null}

                    </div>

                  );

                })

              )}

              {stepRecord?.status !== 'completed' && stepDocTypes.length > 0 && (

                <form onSubmit={handleDocUpload} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--ps-border)' }}>

                  <div className="ps-form-group">

                    <label>Document type</label>

                    <select value={docForm.docType} onChange={(e) => setDocForm((f) => ({ ...f, docType: e.target.value }))}>

                      {stepDocTypes.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}

                    </select>

                  </div>

                  <div className="ps-form-group">

                    <label>Label (optional)</label>

                    <input value={docForm.label} onChange={(e) => setDocForm((f) => ({ ...f, label: e.target.value }))} placeholder={TYPE_LABELS[docForm.docType]} />

                  </div>

                  <div className="ps-form-group">

                    <label>Drive / file link</label>

                    <input required value={docForm.driveLink} onChange={(e) => setDocForm((f) => ({ ...f, driveLink: e.target.value }))} placeholder="https://drive.google.com/..." />

                  </div>

                  <button type="submit" className="ps-btn ps-btn-primary">Save to document vault</button>

                </form>

              )}

              <Link to="/app/post-sales/documents" className="ps-btn" style={{ marginTop: 12, display: 'inline-block' }}>View full document vault →</Link>

            </>

          )}



          {tab === 'details' && (

            <div style={{ fontSize: '0.9rem', lineHeight: 1.8 }}>

              <div><strong>Trigger:</strong> {stepDef?.triggerEvent}</div>

              <div><strong>Default role:</strong> {stepDef?.assignedRole}</div>

              <div><strong>SLA target (SOP):</strong> {formatSlaTarget(stepDef)}</div>

              <div><strong>Due date:</strong> {formatDueDate(stepRecord?.dueDate)} {slaInfo ? `(${slaInfo.label})` : ''}</div>

              {stepDef?.blockedBy?.length > 0 && (

                <div><strong>Blocked by steps:</strong> {stepDef.blockedBy.join(', ')}</div>

              )}

              <div className="ps-form-group" style={{ marginTop: 12 }}>

                <label>Assign to ({stepKindMeta.shortLabel} — {stepKindMeta.roleHint})</label>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

                  <select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={stepRecord?.status === 'completed'} style={{ flex: 1, minWidth: 200 }}>

                    <option value="">— Select person —</option>

                    {suggestedAssignees.map((a) => <option key={a.id} value={a.name || a.email || a.id}>{a.label}</option>)}

                    {assignee && !suggestedAssignees.some((a) => (a.name || a.email || a.id) === assignee) && (
                      <option value={assignee}>{assignee}</option>
                    )}

                  </select>

                  <button type="button" className="ps-btn" disabled={stepRecord?.status === 'completed'} onClick={handleUseDefaultAssignee}>
                    Use default
                  </button>

                  <button type="button" className="ps-btn ps-btn-primary" disabled={stepRecord?.status === 'completed'} onClick={handleAssign}>Save assignee</button>

                </div>

              </div>

              <div className="ps-form-group" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--ps-border)' }}>

                <label>Unit executives (defaults for auto-assign)</label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>

                  <div>
                    <div style={{ fontSize: '0.75rem', color: TASK_KINDS.cx.color, marginBottom: 4 }}>CX executive</div>
                    <input value={cxExecutive} onChange={(e) => setCxExecutive(e.target.value)} placeholder={unit.crmExecutive || 'Name or email'} />
                  </div>

                  <div>
                    <div style={{ fontSize: '0.75rem', color: TASK_KINDS.backend.color, marginBottom: 4 }}>Backend executive</div>
                    <input value={backendExecutive} onChange={(e) => setBackendExecutive(e.target.value)} placeholder={unit.crmExecutive || 'Name or email'} />
                  </div>

                </div>

                <button type="button" className="ps-btn ps-btn-primary" style={{ marginTop: 8 }} disabled={savingExecs} onClick={handleSaveExecutives}>
                  {savingExecs ? 'Saving…' : 'Save executives'}
                </button>

              </div>

              <div className="ps-form-group" style={{ marginTop: 12 }}>

                <label>Notes</label>

                <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={stepRecord?.status === 'completed'} />

              </div>

            </div>

          )}



          {tab === 'activity' && (

            <>

              {stepRecord?.completedDate && (

                <div className="ps-card" style={{ background: 'var(--ps-success-bg)', borderColor: '#a7f3d0' }}>

                  <strong>Step completed</strong>

                  <div style={{ fontSize: '0.85rem' }}>

                    {new Date(stepRecord.completedDate).toLocaleString('en-IN')}

                    {stepRecord.completedBy ? ` · ${stepRecord.completedBy}` : ''}

                  </div>

                </div>

              )}

              {(stepRecord?.activityLog || []).length === 0 && !stepRecord?.completedDate && (

                <div className="ps-empty">No activity logged yet.</div>

              )}

              {[...(stepRecord?.activityLog || [])].reverse().map((entry, i) => (

                <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--ps-border)', fontSize: '0.85rem' }}>

                  <strong>{ACTION_LABELS[entry.action] || entry.action}</strong>

                  <span style={{ color: 'var(--ps-text-muted)', marginLeft: 8 }}>{entry.at ? new Date(entry.at).toLocaleString('en-IN') : ''}</span>

                  {entry.by && <span style={{ marginLeft: 8 }}>· {entry.by}</span>}

                  {entry.detail && <div style={{ color: 'var(--ps-text-muted)', marginTop: 2 }}>{entry.detail}</div>}

                </div>

              ))}

            </>

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

