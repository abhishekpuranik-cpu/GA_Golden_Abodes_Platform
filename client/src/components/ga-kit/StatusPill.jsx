import { STATUS_TONE } from './statusMap.js';
import '../../theme/ga-shell.css';

export function StatusPill({ status, label }) {
  const key = String(status || '').toLowerCase();
  const tone = STATUS_TONE[key] || STATUS_TONE.default;
  const text = label || String(status || '—');
  const showLock = key === 'directors' || key === 'locked';
  return (
    <span className={`ga-status-pill ${tone}`}>
      {showLock ? (
        <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden focusable="false" style={{ marginRight: 4, verticalAlign: '-1px' }}>
          <path
            fill="currentColor"
            d="M17 8h-1V6a4 4 0 1 0-8 0v2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2Zm-7-2a2 2 0 1 1 4 0v2h-4V6Zm7 14H7V10h10v10Z"
          />
        </svg>
      ) : null}
      {text}
    </span>
  );
}
