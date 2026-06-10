import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../components/common/ProtectedRoute';
import AdminLayout from '../components/layout/AdminLayout';
import CashierLayout from '../components/layout/CashierLayout';
import { useAuth } from '../contexts/AuthContext';
import AdminBillingsPage from '../pages/admin/AdminBillingsPage';
import AdminCategoriesPage from '../pages/admin/AdminCategoriesPage';
import AdminCustomersPage from '../pages/admin/AdminCustomersPage';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import AdminInventoryPage from '../pages/admin/AdminInventoryPage';
import AdminOrdersPage from '../pages/admin/AdminOrdersPage';
import AdminProductsPage from '../pages/admin/AdminProductsPage';
import AdminSettingsPage from '../pages/admin/AdminSettingsPage';
import AdminStoresPage from '../pages/admin/AdminStoresPage';
import AdminUsersPage from '../pages/admin/AdminUsersPage';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage';
import LoginPage from '../pages/auth/LoginPage';
import PendingApprovalPage from '../pages/auth/PendingApprovalPage';
import RegisterPage from '../pages/auth/RegisterPage';
import ResetPasswordPage from '../pages/auth/ResetPasswordPage';
import CashierPosPage from '../pages/cashier/CashierPosPage';
import { getUserHomePath } from '../utils/helpers';
import AdminAccessControlPage from '../pages/admin/AdminAccessControlPage';
import AdminCashiersPage from '../pages/admin/AdminCashiersPage';
import ManagerDashboardPage from '../pages/admin/ManagerDashboardPage';


function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={getUserHomePath(user)} replace />;
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<ProtectedRoute allowedRoles={['cashier']} />}>
        <Route path="/pending-approval" element={<PendingApprovalPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['admin', 'manager']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="manager" element={<ManagerDashboardPage />} />
          <Route path="categories" element={<AdminCategoriesPage />} />
          <Route path="customers" element={<AdminCustomersPage />} />
          <Route path="products" element={<AdminProductsPage />} />
          <Route path="inventory" element={<AdminInventoryPage />} />
          <Route path="billings" element={<AdminBillingsPage />} />
          <Route path="orders" element={<AdminOrdersPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="/admin/cashiers" element={<AdminCashiersPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="stores" element={<AdminStoresPage />} />
          <Route path="access-control" element={<AdminAccessControlPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['cashier', 'admin', 'manager']} requireStoreAssignment />}>
        <Route path="/cashier" element={<CashierLayout />}>
          <Route index element={<Navigate to="pos" replace />} />
          <Route path="pos" element={<CashierPosPage />} />
        </Route>
      </Route>

      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
