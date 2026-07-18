import { useEffect, useRef, useState } from 'react';

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

export function KpiCard({ label, value, prefix = '', suffix = '' }) {
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
    <div ref={ref} className="ga-kpi-card ga-interactive" style={cardStyle}>
      <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--ga-ink)', fontFamily: 'var(--ga-font-text)' }}>
        {prefix}
        {n}
        {suffix}
      </div>
      <div style={{ marginTop: 6, color: 'var(--ga-body)', fontSize: 12, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

const cardStyle = {
  background: 'var(--ga-paper)',
  border: '1px solid var(--ga-line)',
  borderRadius: 'var(--ga-radius)',
  padding: '16px 18px',
};
