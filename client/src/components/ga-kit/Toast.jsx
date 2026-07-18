export function Toast({ kind = 'info', message }) {
  if (!message) return null;
  const color =
    kind === 'success' ? 'var(--ga-green)' : kind === 'error' ? 'var(--ga-orange-hi)' : 'var(--ga-navy)';
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 90,
        background: 'var(--ga-paper)',
        border: `1px solid ${color}`,
        color: 'var(--ga-ink)',
        borderLeft: `4px solid ${color}`,
        borderRadius: 'var(--ga-radius)',
        padding: '12px 14px',
        boxShadow: 'var(--ga-shadow-card)',
        maxWidth: 360,
        fontSize: 13,
      }}
    >
      {message}
    </div>
  );
}
