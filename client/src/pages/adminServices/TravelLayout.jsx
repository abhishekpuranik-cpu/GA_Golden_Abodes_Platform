import { NavLink, Outlet } from 'react-router-dom';
import { useAdminServices } from './AdminServicesLayout.jsx';
import { visibleTravelScreens } from '../../lib/adminServicesTabs.js';

export default function TravelLayout() {
  const { permissions } = useAdminServices() || { permissions: {} };
  const screens = visibleTravelScreens(permissions);

  if (!permissions.view && !screens.length) {
    return (
      <div className="as-card">
        <h2>Travel &amp; Fuel Claim</h2>
        <p className="as-error">You do not have travel permissions for this app.</p>
      </div>
    );
  }

  return (
    <div>
      <nav className="as-subnav" aria-label="Travel screens" style={{ marginBottom: '1rem' }}>
        {screens.map((s) => (
          <NavLink key={s.id} to={s.path} className={({ isActive }) => (isActive ? 'active' : '')}>
            {s.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
