import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAdminServices } from './AdminServicesLayout.jsx';
import { visibleTravelScreens } from '../../lib/adminServicesTabs.js';

export default function TravelLayout() {
  const ctx = useAdminServices() || {};
  const { permissions = {}, counts = {} } = ctx;
  const screens = visibleTravelScreens(permissions);

  if (!permissions.view && !screens.length) {
    return (
      <div className="as-card">
        <h2>Travel &amp; Fuel Claim</h2>
        <p className="as-error">
          You do not have access to Travel Expenses yet. Ask an admin to assign the
          {' '}<strong>Travel Expenses · M9</strong> app (<code>admin_services</code>) to your account in Admin Security.
        </p>
      </div>
    );
  }

  if (!screens.length) {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <nav className="as-subnav" aria-label="Travel screens">
        {screens.map((s) => (
          <NavLink key={s.id} to={s.path} className={({ isActive }) => (isActive ? 'active' : '')}>
            {s.label}
            {s.id === 'approvals' && counts.travel ? (
              <span className="as-badge">{counts.travel}</span>
            ) : null}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
