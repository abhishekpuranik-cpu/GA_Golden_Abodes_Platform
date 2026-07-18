import { STATUS_TONE } from './statusMap.js';
import '../../theme/ga-shell.css';

export function StatusPill({ status, label }) {
  const key = String(status || '').toLowerCase();
  const tone = STATUS_TONE[key] || STATUS_TONE.default;
  const text = label || String(status || '—');
  return <span className={`ga-status-pill ${tone}`}>{text}</span>;
}
