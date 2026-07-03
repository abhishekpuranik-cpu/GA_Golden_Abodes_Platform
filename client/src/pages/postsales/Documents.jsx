import { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import { useDocuments } from '../../hooks/postsales/useDocuments.js';

import { DOC_GROUPS, TYPE_LABELS, primaryStepForDocType } from '../../data/postsales/stepDocs.js';
import { docMatchesQuery, searchVaultDocuments } from '../../lib/postsales/docVaultSearch.js';
import { sortUnitsChronologically } from '../../lib/postsales/unitSort.js';
import { postSalesApi } from '../../lib/postSalesApi.js';

function documentOpenUrl(doc) {
  if (doc?.fileId) return postSalesApi.documentFileUrl(doc.fileId);
  if (doc?.driveLink) return doc.driveLink;
  return null;
}



function statusBadge(status) {

  const map = { pending: 'grey', received: 'blue', verified: 'green', uploaded: 'green', rejected: 'red' };

  return `ps-badge ps-badge-${map[status] || 'grey'}`;

}



export default function Documents() {

  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState('');
  const [unitSearch, setUnitSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ docType: 'booking_form', status: 'uploaded', label: '', file: null });
  const [uploadError, setUploadError] = useState(null);
  const [lineUploading, setLineUploading] = useState(null);

  useEffect(() => {
    postSalesApi.listUnitsLite()
      .then(setUnits)
      .catch(() => setUnits([]))
      .finally(() => setUnitsLoading(false));
  }, []);

  const filteredUnits = useMemo(() => {
    const sorted = sortUnitsChronologically(units);
    const q = unitSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((u) => [u.unitNumber, u.project, u.customerName, u.phase, u.building].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [units, unitSearch]);

  const unitId = selectedUnit || filteredUnits[0]?._id;

  const { documents, loading, error, uploadDocument } = useDocuments(unitId);



  const statusCounts = useMemo(() => {

    const c = {};

    for (const d of documents) c[d.status] = (c[d.status] || 0) + 1;

    return c;

  }, [documents]);



  const clpChecklistDocs = useMemo(() => (
    documents.filter((d) => (d.stepNumber === 12 || d.docType === 'demand_letter_clp' || d.docType === 'architect_certificate' || d.docType === 'supporting_document')
      && (d.clpLetterTaskId || d.checklistIndex != null))
      .filter((d) => docMatchesQuery(d, docSearch, 'Step 12 CLP checklist'))
      .sort((a, b) => (a.milestoneName || '').localeCompare(b.milestoneName || '')
        || (a.checklistIndex ?? 0) - (b.checklistIndex ?? 0))
  ), [documents, docSearch]);

  const searchHits = useMemo(
    () => searchVaultDocuments(documents, docSearch),
    [documents, docSearch],
  );

  const visibleGroups = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    if (!q) return DOC_GROUPS;
    return DOC_GROUPS.map((group) => ({
      ...group,
      types: group.types.filter((type) => {
        const label = TYPE_LABELS[type] || type;
        const doc = documents.find((d) => d.docType === type && !d.clpLetterTaskId && d.checklistIndex == null);
        if (label.toLowerCase().includes(q) || type.includes(q) || group.label.toLowerCase().includes(q)) return true;
        if (doc && docMatchesQuery(doc, q, group.label)) return true;
        return false;
      }),
    })).filter((g) => g.types.length > 0);
  }, [docSearch, documents]);

  const docByType = useMemo(() => {
    const m = {};
    for (const d of documents) {
      if (d.clpLetterTaskId || d.checklistIndex != null) continue;
      m[d.docType] = d;
    }
    return m;
  }, [documents]);

  const smartSearchActive = docSearch.trim().length > 0;



  const handleLineUpload = async (type, file) => {
    if (!file || !unitId) return;
    setLineUploading(type);
    try {
      const stepNumber = primaryStepForDocType(type) || DOC_GROUPS.find((g) => g.types.includes(type))?.step;
      await uploadDocument(file, {
        unitId,
        stepNumber,
        docType: type,
        label: TYPE_LABELS[type],
        status: 'uploaded',
      });
    } finally {
      setLineUploading(null);
    }
  };



  const handleUpload = async (e) => {

    e.preventDefault();

    setUploadError(null);

    if (!uploadForm.file) {

      setUploadError('Choose a file to upload (PDF, image, Word, etc.)');

      return;

    }

    const stepNumber = primaryStepForDocType(uploadForm.docType) || DOC_GROUPS.find((g) => g.types.includes(uploadForm.docType))?.step;

    await uploadDocument(uploadForm.file, {

      unitId,

      stepNumber,

      docType: uploadForm.docType,

      label: uploadForm.label || TYPE_LABELS[uploadForm.docType],

      status: uploadForm.status,

    });

    setShowUpload(false);

    setUploadForm({ docType: 'booking_form', status: 'uploaded', label: '', file: null });

  };



  return (

    <div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>

        <div>

          <h2 style={{ margin: 0 }}>Document vault</h2>

          <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--ps-text-muted)' }}>

            Same records as pipeline step uploads — grouped by SOP step. Upload from a unit pipeline step or here.

          </p>

        </div>

        <button type="button" className="ps-btn ps-btn-primary" onClick={() => setShowUpload(true)} disabled={!unitId}>+ Upload document</button>

      </div>



      <div className="ps-split">

        <div>

          <strong>Units</strong>

          <input
            type="search"
            placeholder="Search unit, project, customer…"
            value={unitSearch}
            onChange={(e) => setUnitSearch(e.target.value)}
            style={{ width: '100%', margin: '8px 0' }}
            aria-label="Search units"
          />

          {unitsLoading && <div className="ps-empty">Loading…</div>}

          {filteredUnits.map((u) => (

            <div

              key={u._id}

              className={`ps-list-item ${unitId === u._id ? 'active' : ''}`}

              onClick={() => setSelectedUnit(u._id)}

            >

              <strong>{u.unitNumber}</strong>

              <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>{u.project} · {u.customerName}</div>

            </div>

          ))}

        </div>



        <div>

          {error && <div className="ps-error">{error}</div>}

          {loading && <div className="ps-empty">Loading documents…</div>}



          {!loading && unitId && (

            <>

              <input
                type="search"
                className="ps-smart-search"
                placeholder="Smart search — file name, doc type, step, milestone, checklist line, status…"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                style={{ width: '100%', marginBottom: 8, padding: '10px 12px', fontSize: '0.95rem' }}
                aria-label="Smart search documents"
              />
              {smartSearchActive && (
                <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)', marginBottom: 12 }}>
                  {searchHits.length
                    ? `${searchHits.length} match${searchHits.length === 1 ? '' : 'es'}`
                    : `No matches for "${docSearch.trim()}"`}
                </div>
              )}

              {smartSearchActive && searchHits.length > 0 && (
                <div className="ps-card" style={{ marginBottom: 16, maxHeight: 280, overflow: 'auto' }}>
                  <strong style={{ display: 'block', marginBottom: 8 }}>Search results</strong>
                  {searchHits.map(({ doc, title, subtitle, typeLabel, step }) => (
                    <div key={doc._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--ps-border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{title}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>{subtitle || typeLabel}</div>
                        <span className={statusBadge(doc.status)}>{doc.status}</span>
                        {step != null && <span className="ps-badge ps-badge-grey" style={{ marginLeft: 6 }}>Step {step}</span>}
                      </div>
                      {documentOpenUrl(doc) ? (
                        <a href={documentOpenUrl(doc)} target="_blank" rel="noreferrer" className="ps-btn">Open</a>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {!smartSearchActive && (
              <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>

                {Object.entries(statusCounts).map(([s, n]) => (

                  <span key={s} className={statusBadge(s)}>{s}: {n}</span>

                ))}

                <Link to={`/app/post-sales/units/${unitId}`} className="ps-btn">Open unit pipeline →</Link>

              </div>



              {clpChecklistDocs.length > 0 && (
                <div className="ps-card" style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong>Step 12 — CLP checklist attachments</strong>
                    <Link to={`/app/post-sales/units/${unitId}?step=12`} className="ps-btn" style={{ fontSize: '0.75rem' }}>Step 12 →</Link>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)', marginTop: 0 }}>
                    Files uploaded from installment checklists — tagged by milestone and checklist line.
                  </p>
                  {clpChecklistDocs.map((doc) => (
                    <div key={doc._id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--ps-border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{doc.milestoneName || 'CLP milestone'}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>
                          Line {(doc.checklistIndex ?? 0) + 1}: {doc.checklistItem || TYPE_LABELS[doc.docType] || doc.docType}
                        </div>
                        <span className={statusBadge(doc.status)}>{doc.status}</span>
                      </div>
                      {documentOpenUrl(doc) ? (
                        <a href={documentOpenUrl(doc)} target="_blank" rel="noreferrer" className="ps-btn">Open</a>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}

              {visibleGroups.map((group) => (

                <div key={group.label} className="ps-card">

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                    <strong>{group.label}</strong>

                    <Link to={`/app/post-sales/units/${unitId}?step=${group.step}`} className="ps-btn" style={{ fontSize: '0.75rem' }}>Step {group.step} →</Link>

                  </div>

                  {group.types.map((type) => {

                    const doc = docByType[type];

                    return (

                      <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--ps-border)' }}>

                        <div style={{ flex: 1, minWidth: 0 }}>

                          <div>{TYPE_LABELS[type]}</div>

                          {doc ? (

                            <>

                              <span className={statusBadge(doc.status)}>{doc.status}</span>

                              {doc.receivedDate && <span style={{ fontSize: '0.75rem', marginLeft: 8 }}>{new Date(doc.receivedDate).toLocaleDateString('en-IN')}</span>}

                            </>

                          ) : (

                            <span className="ps-badge ps-badge-grey">missing</span>

                          )}

                        </div>

                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>

                          {documentOpenUrl(doc) ? (

                            <a href={documentOpenUrl(doc)} target="_blank" rel="noreferrer" className="ps-btn">Open</a>

                          ) : null}

                          <label className="ps-btn" style={{ margin: 0, cursor: lineUploading === type ? 'wait' : 'pointer' }}>

                            {lineUploading === type ? '…' : documentOpenUrl(doc) ? 'Replace' : 'Upload'}

                            <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt" style={{ display: 'none' }} disabled={!!lineUploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLineUpload(type, f); e.target.value = ''; }} />

                          </label>

                        </div>

                      </div>

                    );

                  })}

                </div>

              ))}

              </>
              )}

            </>
          )}

        </div>

      </div>



      {showUpload && (

        <div className="ps-modal-overlay" onClick={() => setShowUpload(false)}>

          <div className="ps-modal" onClick={(e) => e.stopPropagation()}>

            <h3>Upload document</h3>

            <form onSubmit={handleUpload}>

              {uploadError && <div className="ps-error" style={{ marginBottom: 12 }}>{uploadError}</div>}

              <div className="ps-form-group">

                <label>Document type</label>

                <select value={uploadForm.docType} onChange={(e) => setUploadForm((f) => ({ ...f, docType: e.target.value }))}>

                  {DOC_GROUPS.flatMap((g) => g.types).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}

                </select>

              </div>

              <div className="ps-form-group"><label>Label</label><input value={uploadForm.label} onChange={(e) => setUploadForm((f) => ({ ...f, label: e.target.value }))} placeholder={TYPE_LABELS[uploadForm.docType]} /></div>

              <div className="ps-form-group">

                <label>File (PDF, image, Word, Excel…)</label>

                <input

                  type="file"

                  required

                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.txt"

                  onChange={(e) => setUploadForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}

                />

                {uploadForm.file && <div style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--ps-text-muted)' }}>{uploadForm.file.name}</div>}

              </div>

              <div className="ps-form-group">

                <label>Status</label>

                <select value={uploadForm.status} onChange={(e) => setUploadForm((f) => ({ ...f, status: e.target.value }))}>

                  <option value="uploaded">Uploaded</option>

                  <option value="received">Received</option>

                  <option value="verified">Verified</option>

                </select>

              </div>

              <div style={{ display: 'flex', gap: 10 }}>

                <button type="submit" className="ps-btn ps-btn-primary">Save</button>

                <button type="button" className="ps-btn" onClick={() => setShowUpload(false)}>Cancel</button>

              </div>

            </form>

          </div>

        </div>

      )}

    </div>

  );

}

