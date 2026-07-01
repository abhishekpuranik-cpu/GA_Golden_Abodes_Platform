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
  loadingOptions = false,
}) {
  const projectList = options?.projects?.length
    ? options.projects
    : PROJECTS.map((p) => p.name);

  const phaseDisabled = !project || loadingOptions;
  const buildingDisabled = !project || loadingOptions;

  return (
    <div className="ps-filter-bar">
      <select
        className="ps-filter-select"
        value={project}
        onChange={(e) => onProjectChange(e.target.value)}
        aria-label="Project"
      >
        <option value="">All projects</option>
        {projectList.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select
        className="ps-filter-select"
        value={phase}
        onChange={(e) => onPhaseChange(e.target.value)}
        aria-label="Phase"
        disabled={phaseDisabled}
        title={phaseDisabled && !project ? 'Select a project first' : undefined}
      >
        <option value="">{loadingOptions && project ? 'Loading phases…' : 'All phases'}</option>
        {(options?.phases || []).map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select
        className="ps-filter-select"
        value={building}
        onChange={(e) => onBuildingChange(e.target.value)}
        aria-label="Building"
        disabled={buildingDisabled}
        title={buildingDisabled && !project ? 'Select a project first' : undefined}
      >
        <option value="">{loadingOptions && project ? 'Loading buildings…' : 'All buildings'}</option>
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
