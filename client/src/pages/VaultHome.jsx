import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../lib/api.js';
import { VAULT_PLATFORM_APPS, canOpenVaultApp } from '../lib/vaultCatalog.js';
import { APP_IDS } from '../appRegistry.js';

const VAULT_LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer' };

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
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
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

/** Avoid Vault → Vault loops when a bad browser URL points at the platform root. */
function normalizePreconstructionUrl(url) {
  const clean = String(url || '').trim();
  if (!clean) return '';
  try {
    const u = new URL(clean, window.location.origin);
    const sameHost = u.origin === window.location.origin;
    const onBundledPath = u.pathname.startsWith('/preconstruction');
    if (sameHost && !onBundledPath) {
      return `${window.location.origin}/preconstruction/`;
    }
    return u.href;
  } catch {
    return clean;
  }
}

function bundledPreconstructionUrl() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/preconstruction/`;
}

/** Keep empty by default in cloud; set explicit URLs via env vars when those apps are deployed. */
const DEFAULT_EXECUTION_DASHBOARD_URL = '';
const DEFAULT_PRECONSTRUCTION_URL = '';
/** Cache-bust query on Construction Execution Dashboard URL from Vault (?v=…). Bump when UI ships; may differ from in-app `GA_DASHBOARD_VERSION`. */
const VAULT_EXEC_VERSION = '20260511-exec-progress-roadmap';
const VAULT_PRE_VERSION = '20260711-mark-complete';
const EXEC_URL_LS_KEY = 'ga_execution_dashboard_url';
const PRE_URL_LS_KEY = 'ga_preconstruction_url';
const V3_URL_LS_KEY = 'ga_v3_url';
const V2_URL_LS_KEY = 'ga_v2_url';
const V1_URL_LS_KEY = 'ga_v1_cashflow_url';
const SALES_URL_LS_KEY = 'ga_sales_url';
const KPI_URL_LS_KEY = 'ga_marketing_kpi_url';
const VAULT_HTML_URL_LS_KEY = 'ga_vault_html_url';

export default function VaultHome() {
  const [auth, setAuth] = useState({ checked: false, authenticated: false, user: null });
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
  const v3Url = '/app/org-planner';
  useEffect(() => {
    try {
      window.localStorage.removeItem(V3_URL_LS_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  const v2Url = String(v2CustomUrl || '').trim() || '/app/resource-planner';
  const cashflowBase = String(v1CustomUrl || '').trim() || '/legacy/GA_Cashflow_V1.html';
  const cashflowHref = withVersionParam(cashflowBase, 'v', cashflowVersion);
  const salesUrl = String(salesCustomUrl || '').trim() || '/legacy/ga_sales_dashboard.html';
  const kpiUrl = String(kpiCustomUrl || '').trim() || '/legacy/GA_MarketingSales_KPI_Dashboard.html';
  const vaultHtmlUrl = String(vaultHtmlCustomUrl || '').trim() || '/legacy/Golden_Abodes_App_Vault.html';
  /** Same freshness token as Cashflow (`CF_VERSION` probe) so legacy links update without hard refresh. */
  const salesHref = withVersionParam(salesUrl, 'v', cashflowVersion);
  const kpiHref = withVersionParam(kpiUrl, 'v', cashflowVersion);
  const vaultHtmlHref = withVersionParam(vaultHtmlUrl, 'v', cashflowVersion);
  const execUrl =
    String(vaultFromApi.execution || '').trim() ||
    externalUrl('VITE_EXECUTION_DASHBOARD_URL') ||
    String(execCustomUrl || '').trim() ||
    DEFAULT_EXECUTION_DASHBOARD_URL;
  const preUrl = normalizePreconstructionUrl(
    String(vaultFromApi.pre || '').trim() ||
      externalUrl('VITE_PRECONSTRUCTION_URL') ||
      String(preCustomUrl || '').trim() ||
      bundledPreconstructionUrl() ||
      DEFAULT_PRECONSTRUCTION_URL
  );
  const execVersionedUrl = withVersionParam(execUrl, 'v', VAULT_EXEC_VERSION);
  const preVersionedUrl = withVersionParam(preUrl, 'v', VAULT_PRE_VERSION);
  const execEnabled = !!execVersionedUrl;
  const preEnabled = !!preVersionedUrl;
  const [apiOk, setApiOk] = useState(null);
  const acl = useMemo(() => {
    const a = new Set((auth.user?.allowedApps || []).map((x) => String(x)));
    const platformApps = VAULT_PLATFORM_APPS.filter((app) => canOpenVaultApp(app.appId, a));
    const featuredPlatform = platformApps.find((app) => app.featured) || platformApps[0] || null;
    return {
      v3: a.has('v3_project_acquisition'),
      v2: a.has('v2_resource_planner'),
      v1: a.has('v1_cashflow'),
      sales: a.has('sales_dashboard'),
      kpi: a.has('marketing_kpi'),
      pre: a.has('preconstruction'),
      exec: a.has('execution'),
      dm: a.has(APP_IDS.DM_SPV_GOVERNANCE),
      postSales: canOpenVaultApp(APP_IDS.POST_SALES, a),
      platformApps,
      featuredPlatform,
      // Finance KPI legacy app (GA_Finance_KPI.html) admin UI uses `finance_kpi_admin`; read-only uses `finance_kpi`.
      finkpi: a.has('finance_kpi') || a.has('finance_kpi_admin') || a.has('admin_security') || (auth.user?.permissions || []).includes('manage_security'),
      admin: a.has('admin_security') || (auth.user?.permissions || []).includes('manage_security')
    };
  }, [auth.user, auth.authenticated]);

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
    authApi
      .session()
      .then((s) => {
        if (!alive) return;
        setAuth({ checked: true, authenticated: !!s?.authenticated, user: s?.user || null });
      })
      .catch(() => {
        if (alive) setAuth({ checked: true, authenticated: false, user: null });
      });
    return () => {
      alive = false;
    };
  }, []);

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
    if (!auth.authenticated) return undefined;
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
  }, [auth.authenticated]);

  useEffect(() => {
    if (!auth.authenticated) return undefined;
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
  }, [auth.authenticated, linkAgentTick]);

  if (!auth.checked) {
    return <div style={{ padding: 24, color: '#94a3b8' }}>Checking session…</div>;
  }
  if (!auth.authenticated) {
    return (
      <div style={{ maxWidth: 720, margin: '10vh auto', padding: 24, textAlign: 'center' }}>
        <h2>Login required</h2>
        <p style={{ color: 'var(--muted)' }}>Please sign in to open your assigned apps, projects, and tabs.</p>
        <Link to="/access" style={{ color: '#93c5fd' }}>
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div className="vault-shell" style={{ maxWidth: 1180, margin: '0 auto', padding: '36px 20px 80px' }}>
      <header style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ marginBottom: 8, color: '#bfdbfe', fontSize: 13 }}>
          Signed in as <strong>{auth.user?.email}</strong>
          {' · '}
          <button
            type="button"
            style={{ ...miniBtn, padding: '4px 8px', fontSize: 11 }}
            onClick={async () => {
              await authApi.logout();
              window.location.href = '/access';
            }}
          >
            Logout
          </button>
          {acl.admin ? (
            <>
              {' · '}
              <Link to="/admin/security" style={{ color: '#93c5fd' }}>
                Admin Security
              </Link>
            </>
          ) : null}
          {acl.featuredPlatform ? (
            <>
              {' · '}
              <Link to={acl.featuredPlatform.path} style={{ color: '#93c5fd', fontWeight: 600 }}>
                {acl.featuredPlatform.title}
              </Link>
            </>
          ) : null}
        </div>
        {auth.user?.allowedProjects?.length ? (
          <div style={{ marginBottom: 10, color: '#94a3b8', fontSize: 12 }}>
            Projects: {auth.user.allowedProjects.join(', ')}
          </div>
        ) : null}
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

      {acl.featuredPlatform ? (
        <section style={{ marginBottom: 32 }}>
          <div style={{ ...grid, gridTemplateColumns: '1fr', maxWidth: 720, margin: '0 auto 0' }}>
            <a
              href={acl.featuredPlatform.path}
              {...VAULT_LINK_PROPS}
              style={{
                ...card,
                border: '1px solid rgba(96,165,250,0.45)',
                background: 'linear-gradient(135deg, rgba(24,95,165,0.22) 0%, rgba(13,148,136,0.12) 100%)',
                boxShadow: '0 12px 40px rgba(24,95,165,0.15)'
              }}
            >
              <strong style={{ color: '#93c5fd', fontSize: 13, letterSpacing: '0.06em' }}>
                PLATFORM · {acl.featuredPlatform.badge.toUpperCase()}
              </strong>
              <div style={{ fontSize: 'clamp(1.35rem, 3vw, 1.65rem)', fontWeight: 700, marginTop: 8 }}>
                {acl.featuredPlatform.title}
              </div>
              <p style={{ color: '#cbd5e1', fontSize: 14, margin: '12px 0 0', lineHeight: 1.55, maxWidth: 560 }}>
                {acl.featuredPlatform.description}
              </p>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 16,
                  padding: '10px 18px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #60a5fa, #185FA5)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14
                }}
              >
                Open app →
              </span>
            </a>
          </div>
        </section>
      ) : null}

      {acl.platformApps.length ? (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
            Platform modules (React — deployed with this vault)
          </h2>
          <div style={grid}>
            {acl.platformApps
              .filter((app) => !acl.featuredPlatform || app.appId !== acl.featuredPlatform.appId)
              .map((app) => (
              <a key={app.appId} href={app.path} {...VAULT_LINK_PROPS} style={{ ...card, border: `1px solid ${app.badgeColor}33` }}>
                <strong style={{ color: app.badgeColor, fontSize: 13 }}>{app.badge}</strong>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{app.title}</div>
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>{app.description}</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Planner suite (legacy HTML tools)
        </h2>
        <div style={grid}>
          {acl.v3 ? <a href={v3Url} {...VAULT_LINK_PROPS} style={card}>
            <strong style={{ color: 'var(--gold)', fontSize: 13 }}>V3</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Project Acquisition</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Org resource planner — opens in a synced frame. Data keys mirror API_Tool localStorage.
            </p>
          </a> : null}
          {acl.v2 ? <a href={v2Url} {...VAULT_LINK_PROPS} style={card}>
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
          </a> : null}
          {acl.v1 ? <a href={cashflowHref} {...VAULT_LINK_PROPS} style={card}>
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
          </a> : null}
          {acl.finkpi ? <a href="/legacy/GA_Finance_KPI.html" {...VAULT_LINK_PROPS} style={card}>
            <strong style={{ color: 'var(--gold)', fontSize: 13 }}>F&amp;A</strong>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Finance KPI &amp; Governance</div>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
              Accounting &amp; Finance KPIs, compliance calendar, registers, monthly scoring and appraisals.
              Opens <code>/legacy/GA_Finance_KPI.html</code>.
            </p>
          </a> : null}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Sales &amp; post-booking operations
        </h2>
        <div style={grid}>
          {acl.sales ? (
            <a href={salesHref} {...VAULT_LINK_PROPS} style={card}>
              <strong style={{ color: 'var(--teal)', fontSize: 13 }}>Legacy HTML</strong>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Sales dashboard</div>
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
                Marketing &amp; sales command centre — inventory, bookings, and CRM post-sales import.
              </p>
            </a>
          ) : null}
          {acl.kpi ? (
            <a href={kpiHref} {...VAULT_LINK_PROPS} style={card}>
              <strong style={{ color: 'var(--teal)', fontSize: 13 }}>Legacy HTML</strong>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>Marketing KPIs</div>
              <p style={{ color: 'var(--muted)', fontSize: 13, margin: '10px 0 0', lineHeight: 1.45 }}>
                Marketing and sales KPI dashboard.
              </p>
            </a>
          ) : null}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Construction dashboards (standalone React)
        </h2>
        <div style={grid}>
          {acl.exec ? <a href={execEnabled ? execVersionedUrl : '#'} {...(execEnabled ? VAULT_LINK_PROPS : {})} style={card}>
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
          </a> : null}
          {acl.pre ? <a href={preEnabled ? preVersionedUrl : '#'} {...(preEnabled ? VAULT_LINK_PROPS : {})} style={card}>
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
          </a> : null}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 14px' }}>
          Legacy HTML (optional direct open)
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {acl.sales ? <a href={salesHref} {...VAULT_LINK_PROPS} style={{ color: 'var(--teal)' }}>
            Sales dashboard
          </a> : null}
          {acl.sales ? <button type="button" onClick={() => setCustomDashboardUrl('Sales dashboard', SALES_URL_LS_KEY, setSalesCustomUrl)} style={miniBtn}>
            Set URL for this browser
          </button> : null}
          {acl.sales && acl.kpi ? <span style={{ color: 'var(--muted)' }}>·</span> : null}
          {acl.kpi ? <a href={kpiHref} {...VAULT_LINK_PROPS} style={{ color: 'var(--teal)' }}>
            Marketing KPIs
          </a> : null}
          {acl.kpi ? <button type="button" onClick={() => setCustomDashboardUrl('Marketing KPIs', KPI_URL_LS_KEY, setKpiCustomUrl)} style={miniBtn}>
            Set URL for this browser
          </button> : null}
          <span style={{ color: 'var(--muted)' }}>·</span>
          <a href={vaultHtmlHref} {...VAULT_LINK_PROPS} style={{ color: 'var(--teal)' }}>
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
