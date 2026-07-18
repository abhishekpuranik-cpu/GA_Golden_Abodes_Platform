export function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div style={scrim} onClick={onClose} role="presentation">
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <strong style={{ fontFamily: 'var(--ga-font-display)', fontSize: 22 }}>{title}</strong>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const scrim = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(33,38,49,.5)',
  zIndex: 70,
  display: 'grid',
  placeItems: 'center',
  padding: 16,
};

const panel = {
  width: 'min(560px, 100%)',
  background: 'var(--ga-paper)',
  borderRadius: 'var(--ga-radius)',
  border: '1px solid var(--ga-line)',
  boxShadow: 'var(--ga-shadow-card)',
  padding: 18,
};

const closeBtn = {
  border: '1px solid var(--ga-line)',
  background: 'var(--ga-paper)',
  borderRadius: 'var(--ga-radius)',
  width: 32,
  height: 32,
  cursor: 'pointer',
};
