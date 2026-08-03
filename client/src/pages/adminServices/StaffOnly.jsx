import { Navigate, Outlet } from 'react-router-dom';
import { useAdminServices } from './AdminServicesLayout.jsx';

/** Staff-only travel screens (verify / approvals / locations / setup). */
export default function StaffOnly() {
  const { permissions } = useAdminServices() || { permissions: {} };
  if (!permissions?.staff) {
    return <Navigate to="/app/admin-services/travel/log" replace />;
  }
  return <Outlet />;
}
