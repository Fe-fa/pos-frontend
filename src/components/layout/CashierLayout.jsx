import { Bell, LogOut, Moon, Search, Sun, UserCircle2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function CashierLayout() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const { activeStore } = useStore();
  const { theme, toggleTheme } = useTheme();

  // Added state and ref for the search input
  const [search, setSearch] = useState('');
  const searchInputRef = useRef(null);

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

        {/* Left Side Group: Logo + Action Tools combined inside brand-inline */}
        <div className="brand-inline">
          <div className="brand-logo">
            {activeStore?.logo_url ? (
              <img
                src={activeStore.logo_url}
                alt={`${activeStoreName} Logo`}
                className="store-logo-img"
                onError={(e) => {
                  // Fixed: Removed TypeScript type casting
                  e.target.style.display = 'none';
                  if (e.target.nextSibling) {
                    e.target.nextSibling.style.display = 'block';
                  }
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
          <button type="button" className="icon-button" onClick={toggleTheme} aria-label="Toggle Theme">
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <button type="button" className="icon-button" aria-label="Notifications">
            <Bell size={18} />
          </button>
          <div className="cashier-user" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <UserCircle2 size={25} />
            <span>{user?.full_name || 'Employee'}</span>
          </div>
        </div>
        <button type="button" className="ghost-button" onClick={handleLogout}>
          <LogOut size={15} />
          <span>Logout</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main className="page-content">
        <Outlet />
      </main>
    </div>
  );
}
