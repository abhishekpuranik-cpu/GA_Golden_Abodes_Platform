import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { toNewTabHref } from '../lib/vaultModules.js';

/**
 * Vault attention inbox — bell + slide-over with actionable items.
 */
export function VaultAttentionInbox({ enabled }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [badge, setBadge] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setLoading(true);
    apiFetch('/api/vault/attention')
      .then(({ ok, data }) => {
        if (!alive || !ok) return;
        setItems(data.items || []);
        setBadge(Number(data.badge) || 0);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        className="ga-vault-attn-btn"
        aria-label={badge ? `${badge} items need attention` : 'Attention inbox'}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.7 1.7 0 0 0 3.4 0" />
        </svg>
        {badge > 0 ? <span className="ga-vault-attn-badge">{badge > 99 ? '99+' : badge}</span> : null}
      </button>

      {open ? (
        <div className="ga-vault-attn-overlay" role="presentation" onClick={() => setOpen(false)}>
          <aside
            className="ga-vault-attn-panel"
            role="dialog"
            aria-label="Needs your attention"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="ga-vault-attn-head">
              <div>
                <h2>Needs your attention</h2>
                <p>Approvals, tasks, and exceptions across the vault.</p>
              </div>
              <button type="button" className="ga-vault-attn-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </header>

            <div className="ga-vault-attn-body">
              {loading && <p className="ga-vault-attn-empty">Loading…</p>}
              {!loading && !items.length && (
                <div className="ga-vault-attn-empty-card">
                  <strong>You&apos;re clear</strong>
                  <p>No pending approvals or flagged items right now.</p>
                </div>
              )}
              {!loading && items.map((it) => (
                <a
                  key={it.id}
                  className="ga-vault-attn-item"
                  href={toNewTabHref(it.href)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  <div className="ga-vault-attn-item-top">
                    <span className={`ga-vault-attn-kind ga-vault-attn-kind--${it.kind || 'task'}`}>
                      {it.kind || 'task'}
                    </span>
                    {it.count != null ? <span className="ga-vault-attn-count">{it.count}</span> : null}
                  </div>
                  <strong>{it.title}</strong>
                  <p>{it.detail}</p>
                  <span className="ga-vault-attn-go">Open →</span>
                </a>
              ))}
            </div>

            <footer className="ga-vault-attn-foot">
              <Link to="/app/admin-services/travel/approvals" onClick={() => setOpen(false)}>
                Travel approvals
              </Link>
              <Link to="/app/post-sales/my-tasks" onClick={() => setOpen(false)}>
                Post-Sales tasks
              </Link>
            </footer>
          </aside>
        </div>
      ) : null}
    </>
  );
}
