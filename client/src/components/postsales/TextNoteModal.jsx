import { useEffect, useRef } from 'react';

export default function TextNoteModal({
  open,
  title,
  value,
  onChange,
  onClose,
  readOnly = false,
  placeholder = '',
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (open && !readOnly && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open, readOnly]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="ps-note-modal-backdrop" onClick={onClose} role="presentation">
      <div className="ps-note-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ps-note-modal-head">
          <strong>{title}</strong>
          <button type="button" className="ps-btn ps-reports-mini-btn" onClick={onClose}>Close</button>
        </div>
        {readOnly ? (
          <div className="ps-note-modal-body">{value || '—'}</div>
        ) : (
          <textarea
            ref={textareaRef}
            className="ps-note-modal-textarea"
            rows={6}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
          />
        )}
        {!readOnly && (
          <div className="ps-note-modal-foot">
            <button type="button" className="ps-btn ps-btn-primary" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

function previewText(text, max = 42) {
  const s = String(text || '').trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function RemarksTableCell({ text, onClickView }) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return <span className="ps-reports-muted">—</span>;
  }
  return (
    <button
      type="button"
      className="ps-reports-remarks-btn"
      title={trimmed}
      onClick={(e) => {
        e.stopPropagation();
        onClickView?.(trimmed);
      }}
    >
      <span className="ps-reports-remarks-icon" aria-hidden>💬</span>
      <span className="ps-reports-remarks-preview">{previewText(trimmed)}</span>
    </button>
  );
}
