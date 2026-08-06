import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminServices } from './AdminServicesLayout.jsx';

/** Staff screens; Approvals also open to designated L1/L2 approvers. */
export default function StaffOnly() {
  const { permissions } = useAdminServices() || { permissions: {} };
  const loc = useLocation();
  const isApprovals = /\/approvals\/?$/.test(loc.pathname);
  const ok = permissions?.staff
    || (isApprovals && (permissions?.approver || permissions?.approve));
  if (!ok) {
    return <Navigate to="/app/admin-services/travel/log" replace />;
  }
  return <Outlet />;
}
