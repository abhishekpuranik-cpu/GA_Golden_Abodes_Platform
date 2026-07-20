export function Drawer({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div style={scrim} onClick={onClose} role="presentation">
      <aside
        className="ga-drawer-slide"
        style={panel}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <strong style={{ fontFamily: 'var(--ga-font-display)', fontSize: 22 }}>{title}</strong>
          <button type="button" onClick={onClose} style={closeBtn} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </aside>
    </div>
  );
}

const scrim = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(33,38,49,.5)',
  zIndex: 70,
};

const panel = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: 'min(420px, 100%)',
  height: '100%',
  background: 'var(--ga-paper)',
  borderLeft: '1px solid var(--ga-line)',
  boxShadow: 'var(--ga-shadow-card)',
  padding: 18,
  overflow: 'auto',
};

const closeBtn = {
  border: '1px solid var(--ga-line)',
  background: 'var(--ga-paper)',
  borderRadius: 'var(--ga-radius)',
  width: 32,
  height: 32,
  cursor: 'pointer',
};
