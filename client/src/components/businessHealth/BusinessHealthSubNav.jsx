import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/app/dm-governance', label: 'Overview', end: true },
  { to: '/app/dm-governance/calendar', label: 'Portfolio calendar', end: false }
];

export default function BusinessHealthSubNav() {
  return (
    <nav className="dm-bh-subnav" aria-label="Business Health sections">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
