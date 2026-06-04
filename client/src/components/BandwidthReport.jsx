import { useMemo } from 'react';

function heatColor(pct) {
  if (pct >= 50) return 'rgba(179, 46, 30, 0.35)';
  if (pct >= 25) return 'rgba(200, 154, 58, 0.35)';
  if (pct > 0) return 'rgba(27, 94, 158, 0.25)';
  return 'transparent';
}

export function BandwidthReport({ report, loading, error }) {
  const { people, projects, matrix } = report || { people: [], projects: [], matrix: {} };
  const projectNames = useMemo(
    () => (projects || []).map((p) => (typeof p === 'string' ? p : p.name)).filter(Boolean),
    [projects]
  );

  if (loading) return <div className="bwr-loading">Loading bandwidth report…</div>;
  if (error) return <div className="bwr-error">{error}</div>;
  if (!people.length) {
    return (
      <div className="bwr-empty">
        No assignees on open tasks yet. Set assignees on PreConstruction tasks to populate this report.
      </div>
    );
  }

  return (
    <div className="bwr-wrap">
      <p className="bwr-desc">
        Share of each project&apos;s <strong>open tasks</strong> assigned to each person (co-assignees split weight
        equally). Rows = people · Columns = projects.
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
              <th className="bwr-th-sum">Peak</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const row = matrix[person] || {};
              const vals = projectNames.map((n) => row[n] || 0);
              const peak = vals.length ? Math.max(...vals) : 0;
              return (
                <tr key={person}>
                  <td className="bwr-td-person">{person}</td>
                  {projectNames.map((name) => {
                    const pct = row[name] || 0;
                    return (
                      <td
                        key={name}
                        className="bwr-td-cell"
                        style={{ background: heatColor(pct) }}
                        title={`${person} · ${name}: ${pct}%`}
                      >
                        {pct > 0 ? `${pct}%` : '—'}
                      </td>
                    );
                  })}
                  <td className="bwr-td-sum">{peak > 0 ? `${peak}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
