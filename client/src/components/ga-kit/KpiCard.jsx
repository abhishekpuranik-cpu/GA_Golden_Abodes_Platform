import { useEffect, useRef, useState } from 'react';
import '../../theme/ga-module.css';

function useCountUp(value, enabled) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setN(Number(value) || 0);
      return undefined;
    }
    const target = Number(value) || 0;
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      setN(Math.round(target * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, enabled]);
  return n;
}

/** `tone` picks the accent-spine color: orange (default) | navy | green | salmon. */
export function KpiCard({ label, value, prefix = '', suffix = '', tone = 'orange' }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setSeen(true);
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const n = useCountUp(value, seen);
  return (
    <div ref={ref} className={`ga-kpi-card ga-kpi ga-interactive tone-${tone}`}>
      <div className="ga-kpi-value">
        {prefix}
        {n}
        {suffix}
      </div>
      <div className="ga-kpi-label">{label}</div>
    </div>
  );
}
