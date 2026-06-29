import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { Bell, Coffee, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { useTheme } from '../../contexts/ThemeContext';
import DynamicSidebar from '../../components/layout/DynamicSidebar';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const { stores, storeId, setStoreId } = useStore();
  const { theme, toggleTheme } = useTheme();

  const isAdmin = user?.role === 'admin';
  const isDashboard =
    location.pathname === '/admin/dashboard' || location.pathname === '/admin/manager';

  const currentStore = useMemo(
    () => stores.find((store) => String(store.store_id) === String(storeId)) || null,
    [stores, storeId]
  );

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const outletContext = useMemo(
    () => ({
      selectedStore: currentStore,
      activeStore: currentStore,
      selectedStoreId: storeId || null,
      stores,
    }),
    [currentStore, storeId, stores]
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-logo">
            <Coffee size={20} />
          </div>
          <div>
            <p className="brand-store-name">{currentStore?.store_name || 'All Stores'}</p>
            <p>{isAdmin ? 'System Admin' : 'Store Manager'}</p>
          </div>
        </div>

        <DynamicSidebar />

        <button
          className="ghost-button"
          onClick={handleLogout}
          style={{ margin: '12px 14px 0' }}
        >
          <LogOut size={16} />
          Logout
        </button>
      </aside>

      <section className="main-shell">
        {isDashboard ? (
          <header className="topbar topbar-lumiere">
            <div>
              <h2>Good morning, {user?.first_name || 'there'}</h2>
              <p>
                {isAdmin
                  ? 'Monitor all stores from one workspace.'
                  : "Here's how the store is doing today."}
              </p>
            </div>

            <div className="topbar-actions">
              <button
                className="ghost-button sidebar-pos-button"
                onClick={() => navigate('/cashier/pos')}
              >
                Open POS
              </button>

              <div className="store-switcher-panel">
                <select
                  className="select-input slim"
                  value={storeId ?? ''}
                  onChange={(e) => setStoreId(e.target.value)}
                  disabled={!stores.length}
                >
                  {isAdmin ? <option value="">All Stores</option> : null}
                  {!stores.length ? <option value="">No store</option> : null}
                  {stores.map((store) => (
                    <option key={store.store_id} value={store.store_id}>
                      {store.store_name}
                    </option>
                  ))}
                </select>
              </div>

              <button className="icon-button" onClick={toggleTheme} title="Toggle theme">
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>

              <button className="icon-button" title="Notifications">
                <Bell size={18} />
              </button>
            </div>
          </header>
        ) : null}

        <main className="page-content">
          <Outlet key={`store-scope-${storeId || 'all'}`} context={outletContext} />
        </main>
      </section>
    </div>
  );
}
