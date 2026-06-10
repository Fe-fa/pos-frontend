import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getUserHomePath, userHasStoreAssignment } from '../../utils/helpers';

function hasRole(user, allowedRoles) {
  if (!allowedRoles?.length) return true;
  return allowedRoles.includes(user?.role);
}

export default function ProtectedRoute({ allowedRoles = [], requireStoreAssignment = false }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page-loader">Loading workspace...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Cashiers only — never block admin/manager for missing store
  if (
    user?.role === 'cashier' &&
    !userHasStoreAssignment(user) &&
    location.pathname !== '/pending-approval'
  ) {
    return <Navigate to="/pending-approval" replace />;
  }

  // Admin bypasses store assignment gate entirely
  if (requireStoreAssignment && user?.role !== 'admin' && !userHasStoreAssignment(user)) {
    return <Navigate to="/pending-approval" replace />;
  }

  if (!hasRole(user, allowedRoles)) {
    return <Navigate to={getUserHomePath(user)} replace />;
  }

  return <Outlet />;
}