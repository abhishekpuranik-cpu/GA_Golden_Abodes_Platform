import { EmptyState } from './EmptyState.jsx';

export function DataTable({ columns = [], rows = [], loading = false, emptyTitle = 'No rows', emptyBody }) {
  if (loading) {
    return <div style={{ padding: 18, color: 'var(--ga-body)', fontSize: 13 }}>Loading…</div>;
  }
  if (!rows.length) {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }
  return (
    <div style={{ overflow: 'auto', border: '1px solid var(--ga-line)', borderRadius: 'var(--ga-radius)', background: 'var(--ga-paper)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={th}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.id || idx} style={{ background: idx % 2 ? 'rgba(243,244,247,.55)' : 'transparent' }}>
              {columns.map((c) => (
                <td key={c.key} style={td}>
                  {typeof c.render === 'function' ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = {
  position: 'sticky',
  top: 0,
  background: 'var(--ga-paper)',
  textAlign: 'left',
  fontSize: 11.5,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--ga-body)',
  padding: '12px 14px',
  borderBottom: '1px solid var(--ga-line)',
};

const td = {
  padding: '12px 14px',
  borderBottom: '1px solid var(--ga-line)',
  fontSize: 13,
  color: 'var(--ga-ink)',
};
