export default function EmptyState({ title, hint, action }) {
  return (
    <div className="hr-empty">
      <p><strong>{title}</strong></p>
      {hint && <p className="hr-muted">{hint}</p>}
      {action}
    </div>
  );
}
