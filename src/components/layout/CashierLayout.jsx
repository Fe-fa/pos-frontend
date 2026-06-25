import { Bell, LogOut, Moon, Sun, UserCircle2, ShieldCheck } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function CashierLayout() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { activeStore } = useStore();
  const { theme, toggleTheme } = useTheme();

  const isAdmin   = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canGoBack = isAdmin || isManager;

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleBackToPanel = () => {
    if (isAdmin)   navigate('/admin/dashboard');
    if (isManager) navigate('/admin/manager');
  };

  const activeStoreName = activeStore?.store_name || 'Assigned store';

  return (
    <div className="cashier-shell">
      <header className="cashier-topbar">
        <div className="brand-inline">
          <div className="brand-logo">
            {activeStore?.logo_url ? (
              <img
                src={activeStore.logo_url}
                alt={`${activeStoreName} Logo`}
                className="store-logo-img"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                }}
              />
            ) : null}
            {!activeStore?.logo_url && <span>SP</span>}
          </div>

          <div className="cashier-tools">
            <div>
              <h1>SwiftPOS</h1>
              <p>{activeStoreName}</p>
            </div>
          </div>

          <button type="button" className="icon-button" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <button type="button" className="icon-button">
            <Bell size={18} />
          </button>

          <div className="cashier-user" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <UserCircle2 size={25} />
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
              <span>{user?.full_name || 'Employee'}</span>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: canGoBack
                  ? 'var(--hero-teal-2)'
                  : 'var(--muted)',
              }}>
                {user?.role || 'cashier'}
              </span>
            </div>
          </div>

          {/* Back to panel — admin goes to /admin/dashboard, manager to /admin/manager */}
          {canGoBack && (
            <button
              type="button"
              className="ghost-button"
              onClick={handleBackToPanel}
              title={isAdmin ? 'Back to admin panel' : 'Back to manager panel'}
              style={{ fontSize: 12 }}
            >
              <ShieldCheck size={14} />
              {isAdmin ? 'Admin' : 'Manager'}
            </button>
          )}
        </div>

        <button type="button" className="ghost-button" onClick={handleLogout}>
          <LogOut size={15} />
          <span>Logout</span>
        </button>
      </header>

      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}