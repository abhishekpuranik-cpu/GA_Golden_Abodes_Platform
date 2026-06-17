import { useMemo, useState } from 'react';
import { useUnits } from '../../hooks/postsales/useUnits.js';
import { useDocuments } from '../../hooks/postsales/useDocuments.js';

const DOC_GROUPS = [
  { label: 'Booking (Step 1)', step: 1, types: ['booking_form', 'cost_sheet', 'payment_receipt'] },
  { label: 'KYC (Steps 1, 5)', step: 5, types: ['pan_card', 'aadhaar_card', 'photograph', 'address_proof', 'marital_proof'] },
  { label: 'Loan (Step 4)', step: 4, types: ['loan_application', 'approved_plan', 'rera_certificate', 'loan_sanction_letter', 'allotment_letter'] },
  { label: 'Agreement (Steps 6, 8)', step: 6, types: ['agreement_draft', 'registered_agreement', 'self_declaration'] },
  { label: 'TDS (Step 9)', step: 9, types: ['form_26QB', 'form_16B', 'tds_challan'] },
  { label: 'Disbursement (Steps 10, 11)', step: 10, types: ['noc', 'handover_letter'] },
  { label: 'Demand (Step 12)', step: 12, types: ['demand_letter_clp', 'architect_certificate'] },
  { label: 'Possession (Steps 14, 15)', step: 14, types: ['oc_cc', 'possession_checklist', 'possession_letter', 'possession_acknowledgement', 'index_ii'] },
  { label: 'CHS (Steps 16–18)', step: 16, types: ['chs_application', 'chs_registration_cert', 'society_bank_account_details', 'maintenance_reconciliation_stmt'] },
];

const TYPE_LABELS = Object.fromEntries([
  ...DOC_GROUPS.flatMap((g) => g.types.map((t) => [t, t.replace(/_/g, ' ')])),
]);

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
  const { documents, loading, error, createDocument, updateDocument } = useDocuments(unitId);

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
      stepNumber: DOC_GROUPS.find((g) => g.types.includes(uploadForm.docType))?.step,
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Document vault</h2>
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
              </div>

              {DOC_GROUPS.map((group) => (
                <div key={group.label} className="ps-card">
                  <strong>{group.label}</strong>
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
