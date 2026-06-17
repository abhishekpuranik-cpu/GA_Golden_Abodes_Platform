import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUnits } from '../../hooks/postsales/useUnits.js';
import { useDocuments } from '../../hooks/postsales/useDocuments.js';
import { DOC_GROUPS, TYPE_LABELS, primaryStepForDocType } from '../../data/postsales/stepDocs.js';

function statusBadge(status) {
  const map = { pending: 'grey', received: 'blue', verified: 'green', uploaded: 'green', rejected: 'red' };
  return `ps-badge ps-badge-${map[status] || 'grey'}`;
}

export default function Documents() {
  const { units, loading: unitsLoading } = useUnits({});
  const [selectedUnit, setSelectedUnit] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ docType: 'booking_form', driveLink: '', status: 'uploaded', label: '' });

  const unitId = selectedUnit || units[0]?._id;
  const { documents, loading, error, createDocument } = useDocuments(unitId);

  const statusCounts = useMemo(() => {
    const c = {};
    for (const d of documents) c[d.status] = (c[d.status] || 0) + 1;
    return c;
  }, [documents]);

  const docByType = useMemo(() => {
    const m = {};
    for (const d of documents) m[d.docType] = d;
    return m;
  }, [documents]);

  const handleUpload = async (e) => {
    e.preventDefault();
    await createDocument({
      unitId,
      stepNumber: primaryStepForDocType(uploadForm.docType) || DOC_GROUPS.find((g) => g.types.includes(uploadForm.docType))?.step,
      docType: uploadForm.docType,
      label: uploadForm.label || TYPE_LABELS[uploadForm.docType],
      driveLink: uploadForm.driveLink,
      status: uploadForm.status,
    });
    setShowUpload(false);
    setUploadForm({ docType: 'booking_form', driveLink: '', status: 'uploaded', label: '' });
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
          {unitsLoading && <div className="ps-empty">Loading…</div>}
          {units.map((u) => (
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {Object.entries(statusCounts).map(([s, n]) => (
                  <span key={s} className={statusBadge(s)}>{s}: {n}</span>
                ))}
                <Link to={`/app/post-sales/units/${unitId}`} className="ps-btn">Open unit pipeline →</Link>
              </div>

              {DOC_GROUPS.map((group) => (
                <div key={group.label} className="ps-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{group.label}</strong>
                    <Link to={`/app/post-sales/units/${unitId}?step=${group.step}`} className="ps-btn" style={{ fontSize: '0.75rem' }}>Step {group.step} →</Link>
                  </div>
                  {group.types.map((type) => {
                    const doc = docByType[type];
                    return (
                      <div key={type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--ps-border)' }}>
                        <div>
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
                        <div>
                          {doc?.driveLink ? (
                            <a href={doc.driveLink} target="_blank" rel="noreferrer" className="ps-btn">Drive</a>
                          ) : (
                            <button type="button" className="ps-btn" onClick={() => { setUploadForm((f) => ({ ...f, docType: type })); setShowUpload(true); }}>Upload</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {showUpload && (
        <div className="ps-modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Upload document</h3>
            <form onSubmit={handleUpload}>
              <div className="ps-form-group">
                <label>Document type</label>
                <select value={uploadForm.docType} onChange={(e) => setUploadForm((f) => ({ ...f, docType: e.target.value }))}>
                  {DOC_GROUPS.flatMap((g) => g.types).map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div className="ps-form-group"><label>Label</label><input value={uploadForm.label} onChange={(e) => setUploadForm((f) => ({ ...f, label: e.target.value }))} placeholder={TYPE_LABELS[uploadForm.docType]} /></div>
              <div className="ps-form-group"><label>Drive link</label><input required value={uploadForm.driveLink} onChange={(e) => setUploadForm((f) => ({ ...f, driveLink: e.target.value }))} /></div>
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
