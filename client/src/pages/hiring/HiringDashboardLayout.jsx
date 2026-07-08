import { NavLink, Outlet } from 'react-router-dom';

const DASH_TABS = [
  { path: '/app/hiring/dashboard', label: 'KPIs', end: true },
  { path: '/app/hiring/dashboard/requirements', label: 'Requirements' },
  { path: '/app/hiring/dashboard/activity', label: 'Activity log' }
];

export default function HiringDashboardLayout() {
  return (
    <>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#1B2A4A', marginBottom: '0.75rem' }}>
        Hiring dashboard
      </h2>
      <nav className="hr-subnav">
        {DASH_TABS.map((t) => (
          <NavLink key={t.path} to={t.path} end={t.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
