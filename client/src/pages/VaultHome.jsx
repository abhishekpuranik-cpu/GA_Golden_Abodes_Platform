import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../lib/api.js';
import { APP_IDS } from '../appRegistry.js';
import { VaultAskAi } from '../components/ask/VaultAskAi.jsx';
import { buildVaultHubAskContext } from '../lib/vaultAskContextBuilders.js';
import { StatusPill } from '../components/ga-kit/StatusPill.jsx';
import { CommandPalette, useCommandPaletteHotkey } from '../components/CommandPalette.jsx';
import {
  VAULT_MODULE_CATALOG,
  greetingForNow,
  firstNameFromUser,
  userCanOpenModule,
  platformEnvTag,
  toNewTabHref,
  pickDeskModules,
  loadDeskIds,
  saveDeskIds,
} from '../lib/vaultModules.js';
import { VaultAttentionInbox } from '../components/VaultAttentionInbox.jsx';
import '../theme/ga-vault.css';
import '../theme/ga-shell.css';

const VAULT_LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer' };
const GA_LOGO_SRC = '/brand/ga-logo.png';
const VAULT_EXEC_VERSION = '20260511-exec-progress-roadmap';
const VAULT_PRE_VERSION = '20260817-v23-two-column-tasks';
const EXEC_URL_LS_KEY = 'ga_execution_dashboard_url';
const PRE_URL_LS_KEY = 'ga_preconstruction_url';
const V2_URL_LS_KEY = 'ga_v2_url';
const V1_URL_LS_KEY = 'ga_v1_cashflow_url';
const SALES_URL_LS_KEY = 'ga_sales_url';
const KPI_URL_LS_KEY = 'ga_marketing_kpi_url';
const VAULT_HTML_URL_LS_KEY = 'ga_vault_html_url';
const DEFAULT_EXECUTION_DASHBOARD_URL = '';
const DEFAULT_PRECONSTRUCTION_URL = '';

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

function normalizePreconstructionUrl(url) {
  const clean = String(url || '').trim();
  if (!clean) return '';
  try {
    const u = new URL(clean, window.location.origin);
    const sameHost = u.origin === window.location.origin;
    const onBundledPath = u.pathname.startsWith('/preconstruction');
    if (sameHost && !onBundledPath) return `${window.location.origin}/preconstruction/`;
    return u.href;
  } catch {
    return clean;
  }
}

function bundledPreconstructionUrl() {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/preconstruction/`;
}

function withVersionParam(url, key, value) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw, window.location.origin);
    u.searchParams.set(key, value);
    return u.toString();
  } catch {
    const sep = raw.indexOf('?') >= 0 ? '&' : '?';
    return `${raw}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function initials(user) {
  const n = String(user?.name || user?.email || 'U').trim();
  const parts = n.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

/** Every app opens in a new browser tab. Drag uses the wrap — anchors must not be draggable. */
function ModuleCard({
  mod,
  locked,
  href,
  deskMode,
  canDrag,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  dragging,
  dragOver,
  suppressClickRef,
}) {
  const status = locked ? 'LOCKED' : mod.status || 'LIVE';
  const body = (
    <>
      <div className="ga-module-top">
        <div className="ga-module-glyph" aria-hidden>
          {mod.icon || mod.glyph}
        </div>
        <StatusPill status={status} label={status} />
      </div>
      <h3 className="ga-module-name">{mod.title}</h3>
      <p className="ga-module-purpose">{mod.purpose}</p>
    </>
  );

  const classNames = [
    'ga-module-card',
    locked || !href ? 'locked' : 'ga-interactive',
    'ga-reveal',
    deskMode ? 'ga-module-card--desk' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const wrapClass = [
    'ga-module-card-wrap',
    canDrag ? 'ga-module-card-wrap--draggable' : '',
    deskMode ? 'ga-module-card-wrap--desk' : '',
    dragging ? 'is-dragging' : '',
    dragOver ? 'is-drag-over' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const dragProps = canDrag
    ? {
        draggable: true,
        onDragStart: (e) => {
          // Prevent the browser from treating this as a URL/link drag.
          e.stopPropagation();
          onDragStart?.(e, mod.id, deskMode ? 'desk' : 'catalog');
        },
        onDragOver: (e) => onDragOver?.(e, mod.id, deskMode ? 'desk' : 'catalog'),
        onDrop: (e) => onDrop?.(e, mod.id, deskMode ? 'desk' : 'catalog'),
        onDragEnd: () => onDragEnd?.(),
      }
    : {};

  if (locked || !href) {
    return (
      <div className={`${wrapClass} ${classNames}`.trim()} aria-disabled="true" title="Not assigned to your account" {...dragProps}>
        {body}
      </div>
    );
  }

  return (
    <div className={wrapClass} {...dragProps}>
      <a
        href={toNewTabHref(href)}
        {...VAULT_LINK_PROPS}
        className={classNames}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        onClick={(e) => {
          if (suppressClickRef?.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClickRef.current = false;
          }
        }}
      >
        {body}
      </a>
    </div>
  );
}

export default function VaultHome() {
  const [auth, setAuth] = useState({ checked: false, authenticated: false, user: null });
  const [cashflowVersion, setCashflowVersion] = useState('live');
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
  const [apiOk, setApiOk] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deskOrder, setDeskOrder] = useState(() => loadDeskIds());
  const [dragId, setDragId] = useState(null);
  const [dragSource, setDragSource] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [deskDropActive, setDeskDropActive] = useState(false);
  const suppressClickRef = useRef(false);
  useCommandPaletteHotkey(setPaletteOpen);

  const v3Url = '/app/org-planner';
  useEffect(() => {
    try {
      window.localStorage.removeItem('ga_v3_url');
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

  const resolvedHref = useMemo(
    () => ({
      [APP_IDS.POST_SALES]: '/app/post-sales',
      [APP_IDS.HIRING]: '/app/hiring',
      [APP_IDS.ADMIN_SERVICES]: '/app/admin-services',
      [APP_IDS.DM_SPV_GOVERNANCE]: '/app/dm-governance',
      v3_project_acquisition: v3Url,
      v2_resource_planner: v2Url,
      v1_cashflow: cashflowHref,
      finance_kpi: '/legacy/GA_Finance_KPI.html',
      sales_dashboard: salesHref,
      marketing_kpi: kpiHref,
      execution: execVersionedUrl,
      preconstruction: preVersionedUrl,
      admin_security: '/admin/security',
    }),
    [v2Url, cashflowHref, salesHref, kpiHref, execVersionedUrl, preVersionedUrl]
  );

  const modules = useMemo(() => {
    return VAULT_MODULE_CATALOG.map((m) => {
      const locked = !userCanOpenModule(auth.user, m.id);
      const href = resolvedHref[m.id] || m.path || '';
      return { ...m, locked, href, external: true };
    });
  }, [auth.user, resolvedHref]);

  const deskModules = useMemo(() => pickDeskModules(modules, deskOrder), [modules, deskOrder]);
  const deskIdSet = useMemo(() => new Set(deskModules.map((m) => m.id)), [deskModules]);
  const allModules = useMemo(() => modules.filter((m) => !deskIdSet.has(m.id)), [modules, deskIdSet]);

  function persistDesk(nextIds) {
    const cleaned = (nextIds || []).map(String).filter(Boolean);
    setDeskOrder(cleaned);
    saveDeskIds(cleaned);
  }

  function readDragId(e) {
    if (dragId) return dragId;
    try {
      return e.dataTransfer.getData('text/plain') || null;
    } catch {
      return null;
    }
  }

  function onCardDragStart(e, id, source) {
    suppressClickRef.current = true;
    setDragId(id);
    setDragSource(source);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.setData('application/x-ga-desk-source', source);
    } catch {
      /* ignore */
    }
  }

  function onCardDragOver(e, id, zone) {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      /* ignore */
    }
    if (zone === 'desk') {
      setDeskDropActive(true);
      if (dragOverId !== id) setDragOverId(id);
    }
  }

  function onCardDrop(e, targetId, zone) {
    e.preventDefault();
    e.stopPropagation();
    const fromId = readDragId(e);
    const fromSource =
      dragSource ||
      (() => {
        try {
          return e.dataTransfer.getData('application/x-ga-desk-source') || null;
        } catch {
          return null;
        }
      })();
    setDragId(null);
    setDragSource(null);
    setDragOverId(null);
    setDeskDropActive(false);
    if (!fromId) return;

    if (zone === 'catalog') {
      // Drop onto All modules → unpin from desk
      if (fromSource === 'desk' || deskOrder.includes(fromId)) {
        persistDesk(deskOrder.filter((x) => x !== fromId));
      }
      return;
    }

    // Desk zone: pin from catalog, or reorder within desk
    if (fromId === targetId && fromSource === 'desk') return;
    const without = deskOrder.filter((x) => x !== fromId);
    if (!targetId) {
      persistDesk([...without, fromId]);
      return;
    }
    const at = without.indexOf(targetId);
    if (at < 0) persistDesk([...without, fromId]);
    else {
      without.splice(at, 0, fromId);
      persistDesk(without);
    }
  }

  function onDeskSectionDragOver(e) {
    e.preventDefault();
    setDeskDropActive(true);
    setDragOverId(null);
  }

  function onDeskSectionDrop(e) {
    onCardDrop(e, null, 'desk');
  }

  function onCatalogSectionDragOver(e) {
    if (dragSource === 'desk' || (dragId && deskOrder.includes(dragId))) {
      e.preventDefault();
    }
  }

  function onCatalogSectionDrop(e) {
    onCardDrop(e, null, 'catalog');
  }

  function onCardDragEnd() {
    setDragId(null);
    setDragSource(null);
    setDragOverId(null);
    setDeskDropActive(false);
    // Keep suppress briefly so the trailing click after a drag does not open the app.
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 80);
  }

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
          pre: typeof v.preconstructionUrl === 'string' ? v.preconstructionUrl : '',
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
    return <div style={{ padding: 24, color: 'var(--ga-body)' }}>Checking session…</div>;
  }

  if (!auth.authenticated) {
    return (
      <div className="ga-vault">
        <div className="ga-vault-main" style={{ textAlign: 'center', paddingTop: '12vh' }}>
          <img
            src={GA_LOGO_SRC}
            alt="Golden Abodes"
            className="ga-vault-brand-logo ga-vault-brand-logo--hero"
            width={220}
            height={72}
            decoding="async"
          />
          <div className="ga-vault-eyebrow-row" style={{ justifyContent: 'center', marginTop: 28 }}>
            <span className="ga-vault-accent" aria-hidden />
            <div className="ga-vault-eyebrow">GOLDEN ABODES · APP VAULT</div>
          </div>
          <h1 style={{ fontFamily: 'var(--ga-font-display)', fontSize: 36, margin: '0 0 12px' }}>Login required</h1>
          <p style={{ color: 'var(--ga-body)' }}>Please sign in to open your assigned apps, projects, and tabs.</p>
          <Link to="/access" className="ga-vault-link">
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const greet = `${greetingForNow()}, ${firstNameFromUser(auth.user)}.`;
  const dateLabel = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const paletteItems = modules.map((m) => ({
    id: m.id,
    title: m.title,
    purpose: m.purpose,
    href: toNewTabHref(m.href),
    locked: m.locked || !m.href,
    external: true,
  }));

  return (
    <div className="ga-vault">
      <header className="ga-vault-topbar">
        <a href="/" className="ga-vault-brand" onClick={(e) => e.preventDefault()}>
          <img
            src={GA_LOGO_SRC}
            alt="Golden Abodes"
            className="ga-vault-brand-logo"
            width={168}
            height={56}
            decoding="async"
          />
          <span className="ga-vault-env">{platformEnvTag()}</span>
        </a>

        <button type="button" className="ga-vault-search" onClick={() => setPaletteOpen(true)} aria-label="Search modules">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <span>Search modules &amp; records.</span>
          <kbd>⌘K</kbd>
        </button>

        <VaultAttentionInbox enabled={!!auth.authenticated} />

        <button
          type="button"
          className="ga-vault-avatar"
          aria-label="Account menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {initials(auth.user)}
        </button>
        {menuOpen ? (
          <div className="ga-vault-user-menu" role="menu">
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--ga-body)' }}>{auth.user?.email}</div>
            {apiOk !== null ? (
              <div style={{ padding: '4px 12px 8px', fontSize: 11, color: apiOk ? '#1f7a4d' : '#b42318' }}>
                {apiOk ? 'MongoDB online' : 'API / Mongo unreachable'}
              </div>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                setMenuOpen(false);
                await authApi.logout();
                window.location.href = '/access';
              }}
            >
              Logout
            </button>
          </div>
        ) : null}
      </header>

      <div className="ga-vault-main">
        <div className="ga-vault-hero ga-reveal">
          <div className="ga-vault-eyebrow-row">
            <span className="ga-vault-accent" aria-hidden />
            <div className="ga-vault-eyebrow">GOLDEN ABODES · APP VAULT</div>
          </div>
          <div className="ga-vault-greet-row">
            <h1>{greet}</h1>
            <p className="ga-vault-date">{dateLabel}</p>
          </div>
          {auth.user?.allowedProjects?.length ? (
            <p className="ga-vault-meta">Projects: {auth.user.allowedProjects.join(', ')}</p>
          ) : null}
        </div>

        <section
          className={`ga-vault-section ga-vault-section--desk${deskDropActive ? ' is-drop-target' : ''}`}
          onDragOver={onDeskSectionDragOver}
          onDrop={onDeskSectionDrop}
          onDragLeave={() => setDeskDropActive(false)}
        >
          <div className="ga-vault-section-head">
            <h2>Your desk</h2>
            <p className="ga-vault-section-hint">Drag apps to pin, rearrange, or drag away to unpin</p>
          </div>
          {deskModules.length ? (
            <div className="ga-vault-grid ga-stagger">
              {deskModules.map((m) => (
                <ModuleCard
                  key={m.id}
                  mod={m}
                  locked={m.locked || !m.href}
                  href={m.href}
                  deskMode
                  canDrag={!m.locked && !!m.href}
                  onDragStart={onCardDragStart}
                  onDragOver={onCardDragOver}
                  onDrop={onCardDrop}
                  onDragEnd={onCardDragEnd}
                  dragging={dragId === m.id}
                  dragOver={dragOverId === m.id && dragId !== m.id}
                  suppressClickRef={suppressClickRef}
                />
              ))}
            </div>
          ) : (
            <p className="ga-vault-desk-empty">Your desk is empty — drag an app here from All modules.</p>
          )}
        </section>

        <section
          className="ga-vault-section"
          onDragOver={onCatalogSectionDragOver}
          onDrop={onCatalogSectionDrop}
        >
          <h2>All modules</h2>
          <div className="ga-vault-grid ga-stagger">
            {allModules.map((m) => (
              <ModuleCard
                key={m.id}
                mod={m}
                locked={m.locked || !m.href}
                href={m.href}
                canDrag={!m.locked && !!m.href}
                onDragStart={onCardDragStart}
                onDragOver={onCardDragOver}
                onDrop={onCardDrop}
                onDragEnd={onCardDragEnd}
                dragging={dragId === m.id}
                dragOver={false}
                suppressClickRef={suppressClickRef}
              />
            ))}
          </div>
          <div className="ga-vault-tools-row">
            <button
              type="button"
              className="ga-vault-mini"
              onClick={() => setCustomDashboardUrl('Construction Execution Dashboard', EXEC_URL_LS_KEY, setExecCustomUrl)}
            >
              Set Execution URL
            </button>
            <button
              type="button"
              className="ga-vault-mini"
              onClick={() => setCustomDashboardUrl('PreConstruction', PRE_URL_LS_KEY, setPreCustomUrl)}
            >
              Set PreConstruction URL
            </button>
            <button
              type="button"
              className="ga-vault-mini"
              onClick={() => setCustomDashboardUrl('V2 Resource Planner', V2_URL_LS_KEY, setV2CustomUrl)}
            >
              Set V2 URL
            </button>
            <button
              type="button"
              className="ga-vault-mini"
              onClick={() => setCustomDashboardUrl('V1 Cashflow Tracker', V1_URL_LS_KEY, setV1CustomUrl)}
            >
              Set V1 URL
            </button>
            {userCanOpenModule(auth.user, 'sales_dashboard') ? (
              <button
                type="button"
                className="ga-vault-mini"
                onClick={() => setCustomDashboardUrl('Sales dashboard', SALES_URL_LS_KEY, setSalesCustomUrl)}
              >
                Set Sales URL
              </button>
            ) : null}
            {userCanOpenModule(auth.user, 'marketing_kpi') ? (
              <button
                type="button"
                className="ga-vault-mini"
                onClick={() => setCustomDashboardUrl('Marketing KPIs', KPI_URL_LS_KEY, setKpiCustomUrl)}
              >
                Set Marketing URL
              </button>
            ) : null}
            <a href={toNewTabHref(vaultHtmlHref)} {...VAULT_LINK_PROPS} className="ga-vault-mini" style={{ display: 'inline-flex', alignItems: 'center' }}>
              Original vault HTML
            </a>
            <button
              type="button"
              className="ga-vault-mini"
              onClick={() => setCustomDashboardUrl('Original vault HTML', VAULT_HTML_URL_LS_KEY, setVaultHtmlCustomUrl)}
            >
              Set vault HTML URL
            </button>
            {linkAgentLastSync ? (
              <span className="ga-vault-meta" style={{ alignSelf: 'center' }}>
                Link agent #{linkAgentTick} · {linkAgentLastSync}
              </span>
            ) : null}
          </div>
        </section>

        <VaultAskAi
          appId="vault"
          appLabel="App Vault"
          exampleKey="vault"
          title="Ask across your apps"
          buildContext={() => buildVaultHubAskContext([...(auth.user?.allowedApps || [])])}
        />
      </div>

      <footer className="ga-vault-foot">
        <div className="ga-vault-foot-inner">
          <span>© Golden Abodes · Internal platform</span>
          <span>{platformEnvTag()}</span>
        </div>
      </footer>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={paletteItems} />
    </div>
  );
}
