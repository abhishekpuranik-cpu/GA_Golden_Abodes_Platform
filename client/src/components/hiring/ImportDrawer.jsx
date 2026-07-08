import { useState, useRef } from 'react';
import { hiringApi } from '../../lib/hiringApi.js';

const CHANNELS = [
  { id: 'naukri', label: 'Naukri' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'apna', label: 'Apna' },
  { id: 'other', label: 'Other' }
];

const ENTITY_TAGS = ['PAD', 'NBD', 'NP', 'GV', 'GAPL', 'Suryakiran'];

export default function ImportDrawer({ open, onClose, requisitionId, defaultEntityTag, onImported }) {
  const [channel, setChannel] = useState('naukri');
  const [entityTag, setEntityTag] = useState(defaultEntityTag || 'PAD');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  if (!open) return null;

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handlePreview(selectedFile = file) {
    if (!selectedFile) {
      setError('Choose a CSV or XLSX file (max 5 MB)');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const data = await hiringApi.previewImport({
        requisitionId,
        entityTag,
        channel,
        file: selectedFile
      });
      setPreview(data);
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!file) {
      setError('Choose a file first');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await hiringApi.importCandidatesFile({
        requisitionId,
        entityTag,
        channel,
        file
      });
      setResult(data);
      onImported?.(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function onFileChange(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview(null);
    setResult(null);
    if (f) handlePreview(f);
  }

  function onDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    handlePreview(f);
  }

  return (
    <div className="hr-modal-backdrop" onClick={handleClose}>
      <div className="hr-modal hr-import-drawer" onClick={(e) => e.stopPropagation()}>
        <h2>Import candidates</h2>
        <p className="hr-muted">Upload Naukri, LinkedIn, Apna, or generic CSV/XLSX (max 5 MB).</p>

        <div className="hr-form-row">
          <label>Channel</label>
          <select value={channel} onChange={(e) => { setChannel(e.target.value); setPreview(null); }}>
            {CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>

        <div className="hr-form-row">
          <label>Entity tag</label>
          <select value={entityTag} onChange={(e) => setEntityTag(e.target.value)}>
            {ENTITY_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div
          className="hr-dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          {file ? <strong>{file.name}</strong> : 'Drop file here or click to browse'}
          <input ref={inputRef} type="file" accept=".csv,.xlsx" hidden onChange={onFileChange} />
        </div>

        {preview && (
          <div className="hr-import-preview">
            <h3>Preview ({Math.min(5, preview.preview?.length || 0)} of {preview.totalRows} rows)</h3>
            {preview.errors?.length > 0 && (
              <div className="hr-import-errors">
                <strong>Parse errors — import will abort:</strong>
                <ul>
                  {preview.errors.map((err, i) => (
                    <li key={i}>Row {err.row}: {err.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            <table className="hr-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Company</th>
                </tr>
              </thead>
              <tbody>
                {(preview.preview || []).map((row) => (
                  <tr key={row.row}>
                    <td>{row.row}</td>
                    <td>{row.name}</td>
                    <td>{row.phone || '—'}</td>
                    <td>{row.currentCompany || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {result && (
          <div className="hr-import-result">
            <strong>Import complete</strong>
            <p>{result.imported} imported · {result.skippedDuplicates} duplicates skipped</p>
            {result.errors?.length > 0 && (
              <ul>
                {result.errors.map((err, i) => (
                  <li key={i}>Row {err.row}: {err.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {error && <p className="hr-error">{error}</p>}

        <div className="hr-toolbar">
          <button type="button" className="hr-btn" disabled={busy || !file} onClick={() => handlePreview()}>
            {busy ? 'Working…' : 'Refresh preview'}
          </button>
          <button
            type="button"
            className="hr-btn hr-btn-gold"
            disabled={busy || !file || preview?.errors?.length > 0}
            onClick={handleImport}
          >
            Import
          </button>
          <button type="button" className="hr-btn hr-btn-outline" onClick={handleClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
