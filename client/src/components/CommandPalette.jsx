import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../theme/ga-shell.css';

function fuzzyScore(query, text) {
  const q = String(query || '').trim().toLowerCase();
  const t = String(text || '').toLowerCase();
  if (!q) return 1;
  if (t.includes(q)) return 2 + (t.startsWith(q) ? 1 : 0);
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i += 1) {
    if (t[i] === q[qi]) qi += 1;
  }
  return qi === q.length ? 1 : 0;
}

/**
 * Module-name command palette only (no federated endpoints exist).
 * items: [{ id, title, purpose, href, locked }]
 */
export function CommandPalette({ open, onClose, items = [] }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    return items
      .map((it) => ({
        ...it,
        score: Math.max(fuzzyScore(q, it.title), fuzzyScore(q, it.purpose) * 0.5),
      }))
      .filter((it) => it.score > 0)
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 12);
  }, [items, q]);

  useEffect(() => {
    if (!open) return undefined;
    setQ('');
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus?.(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const hit = filtered[active];
        if (hit && !hit.locked && hit.href) openItem(hit);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, active, onClose]);

  function openItem(hit) {
    if (!hit?.href || hit.locked) return;
    onClose?.();
    if (hit.external) {
      window.open(hit.href, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(hit.href);
  }

  if (!open) return null;

  return (
    <div className="ga-palette-scrim" onClick={onClose} role="presentation">
      <div className="ga-palette" role="dialog" aria-modal="true" aria-label="Search apps" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          placeholder="Search apps… (Esc to close)"
          aria-label="Search apps"
        />
        <div className="ga-palette-list">
          {filtered.length ? (
            filtered.map((it, idx) => (
              <button
                key={it.id}
                type="button"
                className={`ga-palette-item${idx === active ? ' active' : ''}`}
                disabled={!!it.locked}
                onMouseEnter={() => setActive(idx)}
                onClick={() => openItem(it)}
              >
                <strong>
                  {it.title}
                  {it.locked ? ' · Locked' : ''}
                </strong>
                <span>{it.purpose}</span>
              </button>
            ))
          ) : (
            <div className="ga-palette-empty">No matching apps</div>
          )}
        </div>
      </div>
    </div>
  );
}

export function useCommandPaletteHotkey(setOpen) {
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && String(e.key || '').toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);
}
