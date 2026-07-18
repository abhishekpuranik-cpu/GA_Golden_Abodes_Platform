export function EmptyState({ title = 'Nothing here yet', body, action }) {
  return (
    <div style={wrap}>
      <div style={glyph}>∅</div>
      <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--ga-font-display)', fontSize: 22 }}>{title}</h3>
      {body ? <p style={{ margin: '0 0 14px', color: 'var(--ga-body)', fontSize: 13 }}>{body}</p> : null}
      {action || null}
    </div>
  );
}

const wrap = {
  textAlign: 'center',
  padding: '36px 20px',
  background: 'var(--ga-paper)',
  border: '1px solid var(--ga-line)',
  borderRadius: 'var(--ga-radius)',
};

const glyph = {
  width: 44,
  height: 44,
  margin: '0 auto 12px',
  borderRadius: 'var(--ga-radius)',
  background: '#f7f1ea',
  color: 'var(--ga-navy)',
  display: 'grid',
  placeItems: 'center',
  fontWeight: 700,
};
