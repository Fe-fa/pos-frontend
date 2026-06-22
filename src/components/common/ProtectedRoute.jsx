import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getUserHomePath, userHasStoreAssignment } from '../../utils/helpers';

function hasRole(user, allowedRoles) {
  if (!allowedRoles?.length) return true;
  return allowedRoles.includes(user?.role);
}

export default function ProtectedRoute({
  allowedRoles = [],
  requireStoreAssignment = false,
  requirePermission = null,
  children = null,
}) {
  const { user, loading, isAuthenticated, can } = useAuth();
  const location = useLocation();

  // if (loading) {
  //   return <div className="page-loader">Loading workspace...</div>;
  // }

  // Not authenticated → always go to login, never home
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Cashier without store → pending approval
  if (
    user?.role === 'cashier' &&
    !userHasStoreAssignment(user) &&
    location.pathname !== '/pending-approval'
  ) {
    return <Navigate to="/pending-approval" replace />;
  }

  if (requireStoreAssignment && user?.role !== 'admin' && !userHasStoreAssignment(user)) {
    return <Navigate to="/pending-approval" replace />;
  }

  // Wrong role → login (security: don't reveal home path)
  if (allowedRoles.length && !hasRole(user, allowedRoles)) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // No permission → redirect to their home, not login
  // They ARE authenticated, just don't have access to this specific page
  if (requirePermission && user?.role !== 'admin' && !can(requirePermission)) {
    return <Navigate to={getUserHomePath(user)} replace />;
  }

  return children ?? <Outlet />;
}