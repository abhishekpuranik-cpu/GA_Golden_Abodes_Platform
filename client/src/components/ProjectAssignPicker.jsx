import { useMemo } from 'react';

/**
 * Checkbox list for allowedProjects (stores project names).
 * @param {{ projects: { name: string, status?: string, assignable?: boolean, loc?: string }[], value: string[], onChange: (names: string[]) => void }} props
 */
export function ProjectAssignPicker({ projects, value, onChange }) {
  const selected = useMemo(() => new Set(value || []), [value]);
  const assignable = useMemo(() => (projects || []).filter((p) => p.assignable !== false), [projects]);

  const toggle = (name) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange([...next].sort((a, b) => a.localeCompare(b)));
  };

  const addAllAssignable = () => {
    const names = assignable.map((p) => p.name);
    onChange([...new Set([...(value || []), ...names])].sort((a, b) => a.localeCompare(b)));
  };

  const clearAll = () => onChange([]);

  return (
    <div className="pap">
      <div className="pap-actions">
        <button type="button" className="pap-btn" onClick={addAllAssignable}>
          Add all active
        </button>
        <button type="button" className="pap-btn pap-btn-ghost" onClick={clearAll}>
          Clear
        </button>
        <span className="pap-count">
          {selected.size} selected · {assignable.length} assignable
        </span>
      </div>
      <p className="pap-hint">
        Add all includes Pre-Construction / Acquired only — excludes Pipeline, Evaluation (non-adopted), and
        completed / Under Construction.
      </p>
      <div className="pap-list" role="group" aria-label="Assign projects">
        {(projects || []).map((p) => {
          const on = selected.has(p.name);
          const dim = p.assignable === false;
          return (
            <label key={p.id || p.name} className={`pap-item${on ? ' on' : ''}${dim ? ' dim' : ''}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(p.name)} />
              <span className="pap-item-body">
                <span className="pap-name">{p.name}</span>
                {p.loc ? <span className="pap-loc">{p.loc}</span> : null}
                <span className="pap-status">{p.status || '—'}</span>
                {dim ? <span className="pap-tag">Not in Add all</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {!projects?.length ? <div className="pap-empty">No projects in PreConstruction workspace yet.</div> : null}
    </div>
  );
}
