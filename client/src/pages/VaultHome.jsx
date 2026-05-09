import { useEffect, useState } from 'react';

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

function localUrl(key) {
  try {
    const v = window.localStorage.getItem(key);
    return typeof v === 'string' && v.trim() ? v.trim() : '';
  } catch {
    return '';
  }
}

/** Keep empty by default in cloud; set explicit URLs via env vars when those apps are deployed. */
const DEFAULT_EXECUTION_DASHBOARD_URL = '';
const DEFAULT_PRECONSTRUCTION_URL = '';
const VAULT_EXEC_VERSION = '20260509-2';
const VAULT_PRE_VERSION = '20260506';
const EXEC_URL_LS_KEY = 'ga_execution_dashboard_url';
const PRE_URL_LS_KEY = 'ga_preconstruction_url';
const V3_URL_LS_KEY = 'ga_v3_url';
const V2_URL_LS_KEY = 'ga_v2_url';
const V1_URL_LS_KEY = 'ga_v1_cashflow_url';
const SALES_URL_LS_KEY = 'ga_sales_url';
const KPI_URL_LS_KEY = 'ga_marketing_kpi_url';
const VAULT_HTML_URL_LS_KEY = 'ga_vault_html_url';

export default function VaultHome() {
  const [cashflowVersion, setCashflowVersion] = useState('live');
  const [v3CustomUrl, setV3CustomUrl] = useState(() => localUrl(V3_URL_LS_KEY));
  const [v2CustomUrl, setV2CustomUrl] = useState(() => localUrl(V2_URL_LS_KEY));
  const [v1CustomUrl, setV1CustomUrl] = useState(() => localUrl(V1_URL_LS_KEY));
  const [salesCustomUrl, setSalesCustomUrl] = useState(() => localUrl(SALES_URL_LS_KEY));
  const [kpiCustomUrl, setKpiCustomUrl] = useState(() => localUrl(KPI_URL_LS_KEY));
  const [vaultHtmlCustomUrl, setVaultHtmlCustomUrl] = useState(() => localUrl(VAULT_HTML_URL_LS_KEY));
  const [execCustomUrl, setExecCustomUrl] = useState(() => localUrl(EXEC_URL_LS_KEY));
  const [preCustomUrl, setPreCustomUrl] = useState(() => localUrl(PRE_URL_LS_KEY));
  const [vaultFromApi, setVaultFromApi] = useState(() => ({ execution: '', pre: '' }));
  const [linkAgentTick, setLinkAgentTick] = useState(0);
  const [linkAgentLastSync, setLinkAgentLastSync] = useState('');
  const v3Url = String(v3CustomUrl || '').trim() || '/app/org-planner';
  const v2Url = String(v2CustomUrl || '').trim() || '/app/resource-planner';
  const cashflowBase = String(v1CustomUrl || '').trim() || '/legacy/GA_Cashflow_V1.html';
  const cashflowHref = withVersionParam(cashflowBase, 'v', cashflowVersion);
  const salesUrl = String(salesCustomUrl || '').trim() || '/legacy/ga_sales_dashboard.html';
  const kpiUrl = String(kpiCustomUrl || '').trim() || '/legacy/GA_MarketingSales_KPI_Dashboard.html';
  const vaultHtmlUrl = String(vaultHtmlCustomUrl || '').trim() || '/legacy/Golden_Abodes_App_Vault.html';
  const execUrl =
    String(vaultFromApi.execution || '').trim() ||
    externalUrl('VITE_EXECUTION_DASHBOARD_URL') ||
    String(execCustomUrl || '').trim() ||
    DEFAULT_EXECUTION_DASHBOARD_URL;
  const preUrl =
    String(vaultFromApi.pre || '').trim() ||
    externalUrl('VITE_PRECONSTRUCTION_URL') ||
    String(preCustomUrl || '').trim() ||
    DEFAULT_PRECONSTRUCTION_URL;
  const execVersionedUrl = withVersionParam(execUrl, 'v', VAULT_EXEC_VERSION);
  const preVersionedUrl = withVersionParam(preUrl, 'v', VAULT_PRE_VERSION);
  const execEnabled = !!execVersionedUrl;
  const preEnabled = !!preVersionedUrl;
  const [apiOk, setApiOk] = useState(null);

  function setCustomDashboardUrl(label, lsKey, setValue) {
    const next = window.prompt(`${label} URL\n\nExample: https://your-app.onrender.com`, localUrl(lsKey) || 'https://');
    if (next == null) return;
    const clean = String(next).trim();
    if (!clean) {
      try {
        window.localStorage.removeItem(lsKey);
      } catch {
        /* ignore */
      }
      setValue('');
      return;
    }
    if (!/^https?:\/\//i.test(clean)) {
      window.alert('Please enter a full URL starting with http:// or https://');
      return;
    }
    try {
      window.localStorage.setItem(lsKey, clean);
    } catch {
      /* ignore */
    }
    setValue(clean);
  }

  useEffect(() => {
    let alive = true;
    fetch('/api/health')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setApiOk(!!j?.ok && !!j?.mongo);
        const v = j?.vault || {};
        setVaultFromApi({
          execution: typeof v.executionDashboardUrl === 'string' ? v.executionDashboardUrl : '',
          pre: typeof v.preconstructionUrl === 'string' ? v.preconstructionUrl : ''
        });
      })
      .catch(() => {
        if (alive) setApiOk(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    async function syncAgent() {
      try {
        await fetch('/api/health', { cache: 'no-store' });
      } catch {
        /* ignore */
      } finally {
        if (!alive) return;
        setLinkAgentTick((x) => x + 1);
        setLinkAgentLastSync(new Date().toLocaleString('en-IN'));
      }
    }
    syncAgent();
    const id = window.setInterval(syncAgent, 30000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => {
    let alive = true;
    fetch(`/legacy/GA_Cashflow_V1.html?probe=${Date.now()}`, { cache: 'no-store' })
      .then((r) => r.text())
      .then((html) => {
        if (!alive) return;
        const m = String(html || '').match(/var\s+CF_VERSION\s*=\s*(\d+)/);
        setCashflowVersion(m && m[1] ? m[1] : String(Date.now()));
      })
      .catch(() => {
        if (alive) setCashflowVersion(String(Date.now()));
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
        <div
          style={{
            marginTop: 10,
            display: 'inline-flex',
            gap: 8,
            alignItems: 'center',
            fontSize: 12,
            color: '#bfdbfe',
            border: '1px solid rgba(59,130,246,0.35)',
            padding: '6px 10px',
            borderRadius: 999
          }}
          title="Auto-syncs app links and latest cashflow version every 30s"
        >
          <span>Frontend Link Agent: Active</span>
          <span style={{ opacity: 0.8 }}>sync #{linkAgentTick}</span>
          <span style={{ opacity: 0.8 }}>{linkAgentLastSync ? `last ${linkAgentLastSync}` : ''}</span>
        </div>
      </header>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Planner suite (legacy HTML tools)
        </h2>
        <div style={grid}>
          <a href={v3Url} target={isExternalUrl(v3Url) ? '_blank' : undefined} rel="noopener noreferrer" style={card}>
            <strong style={{ color: 'var(--gold)', fontSize: 13 }}>V3</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Project Acquisition</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Org resource planner — opens in a synced frame. Data keys mirror API_Tool localStorage.
            </p>
            <p style={{ margin: '8px 0 0' }}>
              <button type="button" onClick={() => setCustomDashboardUrl('V3 Project Acquisition', V3_URL_LS_KEY, setV3CustomUrl)} style={miniBtn}>
                Set URL for this browser
              </button>
            </p>
          </a>
          <a href={v2Url} target={isExternalUrl(v2Url) ? '_blank' : undefined} rel="noopener noreferrer" style={card}>
            <strong style={{ color: 'var(--gold)', fontSize: 13 }}>V2</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Resource Planner</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Capacity, allocations, and links to V3 project list via shared storage keys.
            </p>
            <p style={{ margin: '8px 0 0' }}>
              <button type="button" onClick={() => setCustomDashboardUrl('V2 Resource Planner', V2_URL_LS_KEY, setV2CustomUrl)} style={miniBtn}>
                Set URL for this browser
              </button>
            </p>
          </a>
          <a href={cashflowHref} target="_blank" rel="noopener noreferrer" style={card}>
            <strong style={{ color: 'var(--gold)', fontSize: 13 }}>V1</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Cashflow Tracker</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Opens the latest V1 HTML from <code>/legacy/GA_Cashflow_V1.html</code>.
            </p>
            <p style={{ margin: '8px 0 0' }}>
              <button type="button" onClick={() => setCustomDashboardUrl('V1 Cashflow Tracker', V1_URL_LS_KEY, setV1CustomUrl)} style={miniBtn}>
                Set URL for this browser
              </button>
            </p>
          </a>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Construction dashboards (standalone React)
        </h2>
        <div style={grid}>
          <a href={execEnabled ? execVersionedUrl : '#'} target={execEnabled ? '_blank' : undefined} rel="noopener noreferrer" style={card}>
            <strong style={{ color: 'var(--blue)', fontSize: 13 }}>React</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Construction Execution Dashboard</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              {execUrl ? (
                <>
                  Opens in a new tab: <span style={{ wordBreak: 'break-all' }}>{execVersionedUrl}</span>
                </>
              ) : (
                'Ask your admin to set EXECUTION_DASHBOARD_URL or VITE_EXECUTION_DASHBOARD_URL on Render, or use “Set URL for this browser”.'
              )}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.4 }}>
              Team-wide URLs: server env <code style={{ color: 'var(--gold)' }}>EXECUTION_DASHBOARD_URL</code> (no redeploy needed) or
              build-time <code style={{ color: 'var(--gold)' }}>VITE_EXECUTION_DASHBOARD_URL</code> in{' '}
              <code style={{ color: 'var(--gold)' }}>client/.env</code>.
            </p>
            <p style={{ margin: '8px 0 0' }}>
              <button
                type="button"
                onClick={() => setCustomDashboardUrl('Construction Execution Dashboard', EXEC_URL_LS_KEY, setExecCustomUrl)}
                style={miniBtn}
              >
                Set URL for this browser
              </button>
            </p>
          </a>
          <a href={preEnabled ? preVersionedUrl : '#'} target={preEnabled ? '_blank' : undefined} rel="noopener noreferrer" style={card}>
            <strong style={{ color: 'var(--teal)', fontSize: 13 }}>React</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>PreConstruction</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              {preUrl ? (
                <>
                  Opens: <span style={{ wordBreak: 'break-all' }}>{preVersionedUrl}</span>
                </>
              ) : (
                'Ask your admin to set PRECONSTRUCTION_APP_URL or VITE_PRECONSTRUCTION_URL on Render, or use “Set URL for this browser”.'
              )}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.4 }}>
              Team-wide URL: server env <code style={{ color: 'var(--gold)' }}>PRECONSTRUCTION_APP_URL</code> or build-time{' '}
              <code style={{ color: 'var(--gold)' }}>VITE_PRECONSTRUCTION_URL</code> in{' '}
              <code style={{ color: 'var(--gold)' }}>client/.env</code>.
            </p>
            <p style={{ margin: '8px 0 0' }}>
              <button
                type="button"
                onClick={() => setCustomDashboardUrl('PreConstruction', PRE_URL_LS_KEY, setPreCustomUrl)}
                style={miniBtn}
              >
                Set URL for this browser
              </button>
            </p>
          </a>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Legacy HTML (optional direct open)
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <a href={salesUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>
            Sales dashboard
          </a>
          <button type="button" onClick={() => setCustomDashboardUrl('Sales dashboard', SALES_URL_LS_KEY, setSalesCustomUrl)} style={miniBtn}>
            Set URL for this browser
          </button>
          <span style={{ color: 'var(--muted)' }}>·</span>
          <a
            href={kpiUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--teal)' }}
          >
            Marketing KPIs
          </a>
          <button type="button" onClick={() => setCustomDashboardUrl('Marketing KPIs', KPI_URL_LS_KEY, setKpiCustomUrl)} style={miniBtn}>
            Set URL for this browser
          </button>
          <span style={{ color: 'var(--muted)' }}>·</span>
          <a href={vaultHtmlUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>
            Original vault HTML
          </a>
          <button type="button" onClick={() => setCustomDashboardUrl('Original vault HTML', VAULT_HTML_URL_LS_KEY, setVaultHtmlCustomUrl)} style={miniBtn}>
            Set URL for this browser
          </button>
        </div>
      </section>
    </div>
  );
}

const miniBtn = {
  border: '1px solid rgba(148, 163, 184, 0.7)',
  background: 'rgba(15, 23, 42, 0.2)',
  color: '#e2e8f0',
  padding: '6px 10px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600
};

function withVersionParam(url, key, value) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw);
    u.searchParams.set(key, value);
    return u.toString();
  } catch {
    const sep = raw.indexOf('?') >= 0 ? '&' : '?';
    return `${raw}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}
function isExternalUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}
