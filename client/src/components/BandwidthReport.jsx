import { useMemo } from 'react';

function heatColor(pct, allocated) {
  if (!allocated) return 'transparent';
  if (pct >= 60) return 'rgba(179, 46, 30, 0.4)';
  if (pct >= 35) return 'rgba(200, 154, 58, 0.38)';
  if (pct > 0) return 'rgba(27, 94, 158, 0.28)';
  return 'rgba(255, 255, 255, 0.04)';
}

function sumRow(row, projectNames) {
  return projectNames.reduce((s, n) => s + (row[n] || 0), 0);
}

export function BandwidthReport({ report, loading, error }) {
  const { people, projects, matrix, personMeta } = report || {
    people: [],
    projects: [],
    matrix: {},
    personMeta: {}
  };
  const projectNames = useMemo(
    () => (projects || []).map((p) => (typeof p === 'string' ? p : p.name)).filter(Boolean),
    [projects]
  );

  if (loading) return <div className="bwr-loading">Loading bandwidth report…</div>;
  if (error) return <div className="bwr-error">{error}</div>;
  if (!people.length) {
    return (
      <div className="bwr-empty">
        Assign projects to users in Admin (checkbox list below), and ensure tasks have assignees or process
        roles. Bandwidth splits each person&apos;s <strong>100%</strong> across their allocated projects.
      </div>
    );
  }

  return (
    <div className="bwr-wrap">
      <p className="bwr-desc">
        <strong>Inter-project bandwidth</strong> — each row totals <strong>100%</strong>. Projects come from
        Admin assignment; split uses open in-scope work (you as assignee, matching process role, or department
        head on that phase). One allocated project → 100% there. Multiple projects → share by activity load
        (task duration); if no open load yet, split equally.
      </p>
      <div className="bwr-scroll">
        <table className="bwr-table">
          <thead>
            <tr>
              <th className="bwr-th-person">Person</th>
              {projectNames.map((name) => (
                <th key={name} className="bwr-th-proj" title={name}>
                  <span className="bwr-th-text">{name}</span>
                </th>
              ))}
              <th className="bwr-th-sum">Σ 100%</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const row = matrix[person] || {};
              const meta = personMeta?.[person] || {};
              const allocatedSet = new Set(meta.allocatedProjects || []);
              const total = sumRow(row, projectNames);
              const subtitle = meta.adminAllocated
                ? `${meta.projectCount || allocatedSet.size} project${(meta.projectCount || 0) !== 1 ? 's' : ''} assigned · ${meta.splitMode === 'single' ? '100% single' : meta.splitMode === 'equal' ? 'equal split' : 'by activity load'}`
                : `Workload only (set Admin projects) · ${meta.splitMode || ''}`;
              return (
                <tr key={person}>
                  <td className="bwr-td-person">
                    <span className="bwr-person-name">{person}</span>
                    <span className={`bwr-person-meta${meta.adminAllocated ? '' : ' warn'}`}>{subtitle}</span>
                    {meta.totalOpenDays > 0 ? (
                      <span className="bwr-person-load">{meta.totalOpenDays}d open in-scope</span>
                    ) : null}
                  </td>
                  {projectNames.map((name) => {
                    const allocated = allocatedSet.has(name);
                    const pct = allocated ? row[name] || 0 : null;
                    const load = meta.openLoadByProject?.[name];
                    return (
                      <td
                        key={name}
                        className={`bwr-td-cell${allocated ? '' : ' na'}`}
                        style={{ background: heatColor(pct || 0, allocated) }}
                        title={
                          allocated
                            ? `${person} · ${name}: ${pct}% of bandwidth${load != null ? ` · ${load}d open load` : ''}`
                            : `${person} not assigned to ${name} in Admin`
                        }
                      >
                        {allocated ? (pct > 0 ? `${pct}%` : '0%') : '—'}
                      </td>
                    );
                  })}
                  <td className="bwr-td-sum" title="Should total 100% across allocated projects">
                    {Math.round(total * 10) / 10}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
