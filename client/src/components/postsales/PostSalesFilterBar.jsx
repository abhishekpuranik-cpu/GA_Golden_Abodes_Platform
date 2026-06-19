import { Link } from 'react-router-dom';
import { PROJECTS } from '../../data/postsales/steps.js';

export default function PostSalesFilterBar({
  project,
  phase,
  building,
  onProjectChange,
  onPhaseChange,
  onBuildingChange,
  options,
  extra,
  onClear,
}) {
  const projectList = options?.projects?.length
    ? options.projects
    : PROJECTS.map((p) => p.name);

  return (
    <div className="ps-filter-bar">
      <select value={project} onChange={(e) => onProjectChange(e.target.value)} aria-label="Project">
        <option value="">All projects</option>
        {projectList.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={phase} onChange={(e) => onPhaseChange(e.target.value)} aria-label="Phase" disabled={!project && !options?.phases?.length}>
        <option value="">All phases</option>
        {(options?.phases || []).map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={building} onChange={(e) => onBuildingChange(e.target.value)} aria-label="Building">
        <option value="">All buildings</option>
        {(options?.buildings || []).map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      {(project || phase || building) && onClear ? (
        <button type="button" className="ps-btn" onClick={onClear}>Clear</button>
      ) : null}
      {extra}
      <Link to="/app/post-sales/inventory" className="ps-btn" style={{ fontSize: '0.8rem', textDecoration: 'none' }} title="Add or edit projects, phases, buildings">
        ⚙ Inventory
      </Link>
    </div>
  );
}
