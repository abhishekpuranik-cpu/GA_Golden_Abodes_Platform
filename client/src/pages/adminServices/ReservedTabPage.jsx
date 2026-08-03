export default function ReservedTabPage({ name = 'Reserved' }) {
  return (
    <div className="as-card">
      <h2>{name}</h2>
      <p className="as-muted">Reserved for a future release. Registry entry only — no models or routes yet.</p>
    </div>
  );
}
