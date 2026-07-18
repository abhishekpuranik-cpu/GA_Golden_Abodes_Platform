export function FormField({ label, error, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      {label ? (
        <span style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 600, color: 'var(--ga-body)' }}>
          {label}
        </span>
      ) : null}
      {children}
      {error ? <span style={{ display: 'block', marginTop: 6, color: 'var(--ga-orange-hi)', fontSize: 12 }}>{error}</span> : null}
    </label>
  );
}
