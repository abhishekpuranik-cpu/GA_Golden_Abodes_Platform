import { useEffect, useMemo, useState } from 'react';

import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom';

import { useUnit } from '../../hooks/postsales/useUnits.js';

import { useSteps } from '../../hooks/postsales/useSteps.js';

import { useDocuments } from '../../hooks/postsales/useDocuments.js';

import { useAssignees } from '../../hooks/postsales/useMyTasks.js';

import { STEPS, PHASES, ESCALATION_MATRIX } from '../../data/postsales/steps.js';

import { TYPE_LABELS, docTypesForStep } from '../../data/postsales/stepDocs.js';
import { formatDueDate, formatSlaTarget, slaCountdown } from '../../lib/postSalesSla.js';
import { getStepTaskKind, defaultAssigneeForKind, TASK_KINDS } from '../../data/postsales/taskKinds.js';
import { postSalesApi } from '../../lib/postSalesApi.js';

function documentOpenUrl(doc) {
  if (doc?.fileId) return postSalesApi.documentFileUrl(doc.fileId);
  if (doc?.driveLink) return doc.driveLink;
  return null;
}



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



const STEP_TABS = ['checklist', 'documents', 'details', 'escalation'];

const TAB_LABELS = {
  checklist: 'Checklist',
  documents: 'Documents',
  details: 'SOP details',
  escalation: 'Escalation',
};

export default function UnitPipeline() {

  const { id } = useParams();

  const [searchParams] = useSearchParams();

  const { user } = useOutletContext() || {};

  const actor = user?.name || user?.email || '';

  const { unit, loading: unitLoading, error: unitError, refresh: refreshUnit } = useUnit(id);

  const { steps, loading: stepsLoading, error: stepsError, updateStep, toggleChecklist, addStepComment } = useSteps(id, actor);

  const { documents, uploadDocument } = useDocuments(id);

  const { cxTeam, backendTeam } = useAssignees();

  const [selected, setSelected] = useState(1);

  const [tab, setTab] = useState('checklist');

  const [notes, setNotes] = useState('');

  const [assignee, setAssignee] = useState('');

  const [actionError, setActionError] = useState(null);

  const [docUploading, setDocUploading] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextActionDate, setNextActionDate] = useState('');
  const [savingCommentAndDate, setSavingCommentAndDate] = useState(false);



  useEffect(() => {

    const fromQuery = Number(searchParams.get('step'));

    if (fromQuery >= 1 && fromQuery <= 20) setSelected(fromQuery);

    else if (unit?.currentStepNumber) setSelected(unit.currentStepNumber);

  }, [unit?.currentStepNumber, searchParams]);



  useEffect(() => {

    const rec = steps.find((s) => s.stepNumber === selected);

    const kind = rec?.taskKind || getStepTaskKind(selected);

    setNotes(rec?.notes || '');
    setNextAction(rec?.nextAction || '');
    setNextActionDate(rec?.nextActionDate ? new Date(rec.nextActionDate).toISOString().slice(0, 10) : '');
    setAssignee(rec?.assignedTo || defaultAssigneeForKind(unit, kind) || '');

  }, [selected, steps, unit?.crmExecutive, unit?.cxExecutive, unit?.backendExecutive]);



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

      await refreshUnit({ silent: true });

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



  const handleLineDocUpload = async (docType, file) => {

    if (!file) return;

    setActionError(null);

    setDocUploading(docType);

    try {

      await uploadDocument(file, {

        unitId: id,

        stepNumber: selected,

        docType,

        label: TYPE_LABELS[docType],

        status: 'uploaded',

        uploadedBy: actor,

      });

    } catch (err) {

      setActionError(err.message);

    } finally {

      setDocUploading(null);

    }

  };



  const handleBulkDocUpload = async (e) => {

    const files = [...(e.target.files || [])];

    e.target.value = '';

    if (!files.length) return;

    const missing = stepDocTypes.filter((type) => !stepDocuments.find((d) => d.docType === type && documentOpenUrl(d)));

    if (!missing.length) {

      setActionError('All document types for this step already have files');

      return;

    }

    setActionError(null);

    setDocUploading('__bulk__');

    try {

      for (let i = 0; i < Math.min(files.length, missing.length); i++) {

        await uploadDocument(files[i], {

          unitId: id,

          stepNumber: selected,

          docType: missing[i],

          label: TYPE_LABELS[missing[i]],

          status: 'uploaded',

          uploadedBy: actor,

        });

      }

    } catch (err) {

      setActionError(err.message);

    } finally {

      setDocUploading(null);

    }

  };



  const handleSaveCommentAndDate = async (e) => {

    e.preventDefault();

    setActionError(null);

    const text = commentText.trim();

    if (!text || !nextActionDate) {

      setActionError('Comment and next action date are required');

      return;

    }

    setSavingCommentAndDate(true);

    try {

      await addStepComment(selected, text);

      await updateStep(selected, {

        nextAction: nextAction.trim(),

        nextActionDate,

      });

      setCommentText('');

    } catch (err) {

      setActionError(err.message);

    } finally {

      setSavingCommentAndDate(false);

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

            {STEP_TABS.map((t) => (

              <button key={t} type="button" className={`ps-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>

                {TAB_LABELS[t] || t}

              </button>

            ))}

          </div>



          {actionError && <div className="ps-error">{actionError}</div>}



          {tab === 'checklist' && (

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 360px)', gap: 24, alignItems: 'start' }}>

              <div>

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

              </div>



              <div style={{ borderLeft: '1px solid var(--ps-border)', paddingLeft: 24 }}>

                <form onSubmit={handleSaveCommentAndDate}>

                  <div className="ps-form-group">

                    <label>Comments *</label>

                    <textarea rows={3} required value={commentText} onChange={(e) => setCommentText(e.target.value)} disabled={stepRecord?.status === 'completed'} placeholder="Log call notes, customer update, internal handoff…" />

                  </div>

                  {(stepRecord?.comments || []).length === 0 ? (

                    <div className="ps-empty" style={{ marginTop: 12, fontSize: '0.85rem' }}>No comments yet.</div>

                  ) : (

                    <div style={{ marginTop: 12, maxHeight: 220, overflow: 'auto' }}>

                      {[...(stepRecord?.comments || [])].reverse().map((c, i) => (

                        <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--ps-border)', fontSize: '0.85rem' }}>

                          <div style={{ color: 'var(--ps-text-muted)', marginBottom: 4, fontSize: '0.75rem' }}>

                            {c.at ? new Date(c.at).toLocaleString('en-IN') : ''}

                            {c.by ? ` · ${c.by}` : ''}

                          </div>

                          <div>{c.text}</div>

                        </div>

                      ))}

                    </div>

                  )}



                <div className="ps-form-group">

                  <label>Next action</label>

                  <textarea rows={2} value={nextAction} onChange={(e) => setNextAction(e.target.value)} disabled={stepRecord?.status === 'completed'} placeholder="What needs to happen next?" />

                </div>



                <div className="ps-form-group">

                  <label>Next action date *</label>

                  <input type="date" required value={nextActionDate} onChange={(e) => setNextActionDate(e.target.value)} disabled={stepRecord?.status === 'completed'} />

                </div>



                <button type="submit" className="ps-btn ps-btn-primary" disabled={stepRecord?.status === 'completed' || savingCommentAndDate || !commentText.trim() || !nextActionDate}>

                  {savingCommentAndDate ? 'Saving…' : 'Save Comment and Date'}

                </button>

                </form>



                <div className="ps-form-group" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--ps-border)' }}>

                  <label>Assignee ({stepKindMeta.shortLabel})</label>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>

                    <select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={stepRecord?.status === 'completed'} style={{ flex: 1, minWidth: 160 }}>

                      <option value="">— Select person —</option>

                      {suggestedAssignees.map((a) => <option key={a.id} value={a.name || a.email || a.id}>{a.label}</option>)}

                      {assignee && !suggestedAssignees.some((a) => (a.name || a.email || a.id) === assignee) && (

                        <option value={assignee}>{assignee}</option>

                      )}

                    </select>

                    <button type="button" className="ps-btn" disabled={stepRecord?.status === 'completed'} onClick={handleUseDefaultAssignee}>Default</button>

                    <button type="button" className="ps-btn" disabled={stepRecord?.status === 'completed'} onClick={handleAssign}>Save</button>

                  </div>

                </div>

              </div>

            </div>

          )}



          {tab === 'documents' && (

            <>

              <p style={{ fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>

                Uploads here are stored in the same document vault as the Documents tab (linked by unit + step).

              </p>

              {stepDocTypes.length === 0 ? (

                <div className="ps-empty">No standard document placeholders for this step.</div>

              ) : (

                <>

                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>

                    <label className="ps-btn ps-btn-primary" style={{ margin: 0, cursor: docUploading === '__bulk__' ? 'wait' : 'pointer' }}>

                      {docUploading === '__bulk__' ? 'Uploading…' : 'Upload all missing'}

                      <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt" style={{ display: 'none' }} disabled={docUploading === '__bulk__'} onChange={handleBulkDocUpload} />

                    </label>

                    <span style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>Pick multiple files — assigned to missing types in list order</span>

                  </div>

                {stepDocTypes.map((type) => {

                  const doc = stepDocuments.find((d) => d.docType === type);

                  return (

                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--ps-border)' }}>

                      <div style={{ flex: '1 1 auto', minWidth: 0 }}>

                        <strong>{TYPE_LABELS[type]}</strong>

                        <div>{doc ? <span className="ps-badge ps-badge-green">{doc.status}</span> : <span className="ps-badge ps-badge-grey">missing</span>}</div>

                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>

                        {documentOpenUrl(doc) ? (

                          <a href={documentOpenUrl(doc)} target="_blank" rel="noreferrer" className="ps-btn">Open</a>

                        ) : null}

                        <label className="ps-btn" style={{ margin: 0, cursor: docUploading === type ? 'wait' : 'pointer' }}>

                          {docUploading === type ? '…' : documentOpenUrl(doc) ? 'Replace' : 'Upload'}

                          <input

                            type="file"

                            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt"

                            style={{ display: 'none' }}

                            disabled={!!docUploading}

                            onChange={(e) => {

                              const f = e.target.files?.[0];

                              if (f) handleLineDocUpload(type, f);

                              e.target.value = '';

                            }}

                          />

                        </label>

                      </div>

                    </div>

                  );

                })}

                </>

              )}

              <Link to="/app/post-sales/documents" className="ps-btn" style={{ marginTop: 12, display: 'inline-block' }}>View full document vault →</Link>

            </>

          )}



          {tab === 'details' && stepDef && (

            <div style={{ fontSize: '0.9rem' }}>

              <p style={{ marginTop: 0, color: 'var(--ps-text-muted)', fontSize: '0.85rem' }}>

                Standard operating procedure for this pipeline step — reference only.

              </p>

              <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 160px) 1fr', gap: '10px 16px', lineHeight: 1.5 }}>

                <dt style={{ color: 'var(--ps-text-muted)' }}>Phase</dt>

                <dd style={{ margin: 0 }}>{PHASES[stepDef.phase]?.label || stepDef.phase}</dd>



                <dt style={{ color: 'var(--ps-text-muted)' }}>Work type</dt>

                <dd style={{ margin: 0 }}>{stepKindMeta.label}</dd>



                <dt style={{ color: 'var(--ps-text-muted)' }}>Trigger</dt>

                <dd style={{ margin: 0 }}>{stepDef.triggerEvent || '—'}</dd>



                <dt style={{ color: 'var(--ps-text-muted)' }}>Default role</dt>

                <dd style={{ margin: 0 }}>{stepDef.assignedRole || '—'}</dd>



                <dt style={{ color: 'var(--ps-text-muted)' }}>SLA target</dt>

                <dd style={{ margin: 0 }}>{formatSlaTarget(stepDef)}</dd>



                {stepDef.blockedBy?.length > 0 && (

                  <>

                    <dt style={{ color: 'var(--ps-text-muted)' }}>Prerequisites</dt>

                    <dd style={{ margin: 0 }}>Complete step(s) {stepDef.blockedBy.join(', ')} before starting</dd>

                  </>

                )}



                {stepDef.escalation && (

                  <>

                    <dt style={{ color: 'var(--ps-text-muted)' }}>Escalation</dt>

                    <dd style={{ margin: 0 }}>{ESCALATION_MATRIX[stepDef.escalation]?.label || stepDef.escalation}</dd>

                  </>

                )}

              </dl>



              {stepDef.checklist?.length > 0 && (

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--ps-border)' }}>

                  <strong>SOP checklist ({stepDef.checklist.length} items)</strong>

                  <ul style={{ margin: '8px 0 0', paddingLeft: 20, color: 'var(--ps-text-muted)', fontSize: '0.85rem' }}>

                    {stepDef.checklist.map((item, i) => <li key={i}>{item}</li>)}

                  </ul>

                </div>

              )}

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

            <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--ps-border)', flexWrap: 'wrap', alignItems: 'flex-end' }}>

              <div className="ps-form-group" style={{ flex: '1 1 240px', marginBottom: 0 }}>

                <label>Completion notes (optional)</label>

                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Brief note when marking complete" />

              </div>

              <button type="button" className="ps-btn ps-btn-primary" onClick={handleComplete}>Mark complete</button>

              <button type="button" className="ps-btn ps-btn-danger" onClick={handleEscalate}>Escalate</button>

            </div>

          )}

        </div>

      </div>

    </div>

  );

}

