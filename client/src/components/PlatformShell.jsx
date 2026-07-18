import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../lib/api.js';
import { VAULT_MODULE_CATALOG, userCanOpenModule, toNewTabHref } from '../lib/vaultModules.js';
import { CommandPalette, useCommandPaletteHotkey } from './CommandPalette.jsx';
import '../theme/ga-shell.css';

function initials(user) {
  const n = String(user?.name || user?.email || 'U').trim();
  const parts = n.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

/**
 * Shared top chrome for in-platform React modules.
 * Does not replace module-internal navigation.
 */
export function PlatformShell({ title, breadcrumb, children, showTopbar = true }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useCommandPaletteHotkey(setPaletteOpen);

  useEffect(() => {
    let alive = true;
    authApi
      .session()
      .then((s) => {
        if (alive) setUser(s?.authenticated ? s.user : null);
      })
      .catch(() => {
        if (alive) setUser(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  const modules = useMemo(() => {
    return VAULT_MODULE_CATALOG.map((m) => {
      const locked = !userCanOpenModule(user, m.id);
      return {
        ...m,
        locked,
        href: m.path,
        external: !!m.external,
      };
    }).filter((m) => m.href);
  }, [user]);

  const accessible = modules.filter((m) => !m.locked && !m.external);

  return (
    <div className="ga-shell">
      {showTopbar ? (
        <header className="ga-topbar">
          <Link to="/" className="ga-topbar-logo" title="App Vault">
            <span className="ga-topbar-mark">G</span>
            <span>GA</span>
          </Link>
          <select
            className="ga-topbar-switch"
            aria-label="Module switcher"
            value={accessible.find((m) => location.pathname.startsWith(m.path))?.path || ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v) navigate(v);
            }}
          >
            <option value="" disabled>
              Switch module
            </option>
            {accessible.map((m) => (
              <option key={m.id} value={m.path}>
                {m.title}
              </option>
            ))}
          </select>
          <div className="ga-topbar-crumb">{breadcrumb || title || ''}</div>
          <div className="ga-topbar-right">
            <button type="button" className="ga-topbar-btn ga-interactive" onClick={() => setPaletteOpen(true)}>
              Search ⌘K
            </button>
            <button type="button" className="ga-avatar" onClick={() => setMenuOpen((v) => !v)} aria-label="User menu">
              {initials(user)}
            </button>
          </div>
          {menuOpen ? (
            <div className="ga-user-menu">
              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--ga-body)' }}>{user?.email || 'Signed in'}</div>
              <Link to="/" onClick={() => setMenuOpen(false)}>
                App Vault
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await authApi.logout();
                  window.location.href = '/access';
                }}
              >
                Sign out
              </button>
            </div>
          ) : null}
        </header>
      ) : null}
      {children}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={modules} />
    </div>
  );
}
