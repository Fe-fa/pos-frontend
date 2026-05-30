import { Bell, LogOut, Moon, Sun, UserCircle2 } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function CashierLayout() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { activeStore } = useStore(); 
  const { theme, toggleTheme } = useTheme();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  const activeStoreName = activeStore?.store_name || 'Assigned store';

  return (
    <div className="cashier-shell">
      <header className="cashier-topbar">
        
        {/* Left Brand Content Side */}
        <div className="brand-inline">
          <div className="brand-logo">
            {activeStore?.logo_url ? (
              <img 
                src={activeStore.logo_url} 
                alt={`${activeStoreName} Logo`} 
                className="store-logo-img"
                onError={(e) => {
                  e.target.style.display = 'none';
                  if (e.target.nextSibling) {
                    e.target.nextSibling.style.display = 'block';
                  }
                }}
              />
            ) : null}
            {!activeStore?.logo_url && <span>SP</span>}
          </div>
          
          <div>
            <h1>SwiftPOS</h1>
            <p>{activeStoreName}</p>
          </div>
        </div>

        {/* Right Tools Action Side */}
        <div className="cashier-tools">
          <span className="eyebrow">
            {user?.role || 'Cashier'}
          </span>

          <button type="button" className="icon-button" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <button type="button" className="icon-button" aria-label="Notifications">
            <Bell size={18} />
          </button>

          <div className="cashier-user">
            <UserCircle2 size={20} />
            <span>{user?.full_name || 'Employee'}</span>
          </div>

          <button type="button" className="ghost-button" onClick={handleLogout}>
            <LogOut size={15} /> 
            <span>Logout</span>
          </button>
        </div>

      </header>

      {/* Main Content Area */}
      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}