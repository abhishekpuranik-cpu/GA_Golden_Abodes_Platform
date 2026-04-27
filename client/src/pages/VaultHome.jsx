import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const card = {
  display: 'block',
  padding: '22px 24px',
  borderRadius: 14,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  textDecoration: 'none',
  color: 'inherit',
  transition: 'transform 0.15s, border-color 0.15s'
};

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 18,
  maxWidth: 1100,
  margin: '0 auto'
};

function externalUrl(envKey) {
  const v = import.meta.env[envKey];
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

/** Default dev URLs (override in `client/.env` / `.env.development` for production or other ports). */
const DEFAULT_EXECUTION_DASHBOARD_URL = 'http://localhost:5173/';
const DEFAULT_PRECONSTRUCTION_URL = 'http://localhost:5181/';

export default function VaultHome() {
  const execUrl = externalUrl('VITE_EXECUTION_DASHBOARD_URL') || DEFAULT_EXECUTION_DASHBOARD_URL;
  const preUrl = externalUrl('VITE_PRECONSTRUCTION_URL') || DEFAULT_PRECONSTRUCTION_URL;
  const [apiOk, setApiOk] = useState(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((j) => {
        if (alive) setApiOk(!!j?.ok && !!j?.mongo);
      })
      .catch(() => {
        if (alive) setApiOk(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 20px 80px' }}>
      <header style={{ textAlign: 'center', marginBottom: 40 }}>
        {apiOk !== null ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 14,
              padding: '6px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              background: apiOk ? 'rgba(13,148,136,0.2)' : 'rgba(239,68,68,0.15)',
              color: apiOk ? '#5eead4' : '#fca5a5',
              border: `1px solid ${apiOk ? 'rgba(45,212,191,0.35)' : 'rgba(248,113,113,0.35)'}`
            }}
          >
            <span style={{ opacity: 0.85 }}>API</span>
            {apiOk ? 'MongoDB online' : 'API / Mongo unreachable'}
          </div>
        ) : null}
        <h1
          style={{
            fontFamily: '"Playfair Display", Georgia, serif',
            fontSize: 'clamp(2rem, 4vw, 2.75rem)',
            fontWeight: 700,
            margin: '0 0 10px',
            color: '#f8fafc'
          }}
        >
          Golden Abodes
        </h1>
        <p style={{ color: 'var(--muted)', margin: 0, fontSize: 15 }}>
          App Vault — planner tools, cloud sync, and linked construction dashboards
        </p>
      </header>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Planner suite (legacy HTML tools)
        </h2>
        <div style={grid}>
          <Link to="/app/org-planner" style={card}>
            <strong style={{ color: 'var(--gold)', fontSize: 13 }}>V3</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Project Acquisition</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Org resource planner — opens in a synced frame. Data keys mirror API_Tool localStorage.
            </p>
          </Link>
          <Link to="/app/resource-planner" style={card}>
            <strong style={{ color: 'var(--gold)', fontSize: 13 }}>V2</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Resource Planner</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Capacity, allocations, and links to V3 project list via shared storage keys.
            </p>
          </Link>
          <a href="/legacy/GA_Cashflow_V1.html" target="_blank" rel="noopener noreferrer" style={card}>
            <strong style={{ color: 'var(--gold)', fontSize: 13 }}>V1</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Cashflow Tracker</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Opens the updated legacy HTML V1 from <code>/legacy/GA_Cashflow_V1.html</code>.
            </p>
          </a>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Construction dashboards (standalone React)
        </h2>
        <div style={grid}>
          <a href={execUrl} target="_blank" rel="noopener noreferrer" style={card}>
            <strong style={{ color: 'var(--blue)', fontSize: 13 }}>React</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Construction Execution Dashboard</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Default: port 5173. Opens in a new tab: <span style={{ wordBreak: 'break-all' }}>{execUrl}</span>
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.4 }}>
              Override with <code style={{ color: 'var(--gold)' }}>VITE_EXECUTION_DASHBOARD_URL</code> in{' '}
              <code style={{ color: 'var(--gold)' }}>client/.env</code> if the app runs elsewhere.
            </p>
          </a>
          <a href={preUrl} target="_blank" rel="noopener noreferrer" style={card}>
            <strong style={{ color: 'var(--teal)', fontSize: 13 }}>React</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>PreConstruction</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Default: port 5181. Opens: <span style={{ wordBreak: 'break-all' }}>{preUrl}</span>
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.4 }}>
              Override with <code style={{ color: 'var(--gold)' }}>VITE_PRECONSTRUCTION_URL</code> in{' '}
              <code style={{ color: 'var(--gold)' }}>client/.env</code>.
            </p>
          </a>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Legacy HTML (optional direct open)
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <a href="/legacy/ga_sales_dashboard.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>
            Sales dashboard
          </a>
          <span style={{ color: 'var(--muted)' }}>·</span>
          <a
            href="/legacy/GA_MarketingSales_KPI_Dashboard.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--teal)' }}
          >
            Marketing KPIs
          </a>
          <span style={{ color: 'var(--muted)' }}>·</span>
          <a href="/legacy/Golden_Abodes_App_Vault.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>
            Original vault HTML
          </a>
        </div>
      </section>
    </div>
  );
}
