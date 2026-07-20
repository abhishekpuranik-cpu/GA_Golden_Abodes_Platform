import '../../theme/ga-module.css';

/**
 * Conic-gradient progress ring. `value`/`max` drive the fill percentage;
 * `label` renders under the numeral inside the ring.
 */
export function ProgressRing({ value = 0, max = 100, label, color }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100)) : 0;
  const style = color ? { '--ga-ring-pct': pct, '--ga-ring-color': color } : { '--ga-ring-pct': pct };
  return (
    <div className="ga-ring" style={style} role="img" aria-label={`${label || 'Progress'}: ${Math.round(pct)}%`}>
      <div className="ga-ring-inner">
        <div className="ga-ring-value">{Math.round(pct)}%</div>
        {label ? <div className="ga-ring-label">{label}</div> : null}
      </div>
    </div>
  );
}
