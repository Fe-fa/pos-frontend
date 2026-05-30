import {
  Bell,
  Boxes,
  Coffee,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  ReceiptText,
  Settings,
  ShoppingBasket,
  Store,
  Sun,
  Users,
  Warehouse,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { useTheme } from '../../contexts/ThemeContext';

const adminNavItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/stores', label: 'Stores', icon: Store },
  { to: '/admin/users', label: 'Users & Access', icon: Users },
  { to: '/admin/categories', label: 'Categories', icon: Boxes },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/inventory', label: 'Inventory', icon: Warehouse },
  { to: '/admin/billings', label: 'Billings', icon: ReceiptText },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBasket },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/access-control', label: 'Access Control', icon: Users },
];

const managerNavItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Cashiers', icon: Users },
  { to: '/admin/customers', label: 'Customers', icon: Users },
  { to: '/admin/categories', label: 'Categories', icon: Boxes },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/inventory', label: 'Inventory', icon: Warehouse },
  { to: '/admin/billings', label: 'Billings', icon: ReceiptText },
  { to: '/admin/orders', label: 'Orders', icon: ShoppingBasket },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user } = useAuth();
  const { stores, storeId, setStoreId } = useStore();
  const { theme, toggleTheme } = useTheme();

  const isAdmin = user?.role === 'admin';
  const navItems = isAdmin ? adminNavItems : managerNavItems;

  // Evaluates to true ONLY when looking at the dashboard route
  const isDashboard = location.pathname === '/admin/dashboard';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-logo">
            <Coffee size={20} />
          </div>
          <div>
            <h1>swiftstock</h1>
            <p>{isAdmin ? 'System Admin' : 'Store Manager'}</p>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <section className="main-shell">
        {/* The entire header element will only render if isDashboard is true */}
        {isDashboard && (
          <header className="topbar topbar-lumiere">
            <div>
              <h2>Good morning, {user?.first_name || 'there'}</h2>
              <p>{isAdmin ? 'Monitor all stores from one workspace.' : "Here's how the café is doing today.."}</p>
            </div>

            <div className="topbar-actions">
                      <button className="ghost-button sidebar-pos-button" onClick={() => navigate('/cashier')}>
          Open POS
        </button>
              <div className="store-switcher-panel">
                <select
                  className="select-input slim"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  disabled={!stores.length}
                >
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

              <button className="ghost-button" onClick={handleLogout}>
                <LogOut size={16} />
                Logout
              </button>
            </div>
          </header>
        )}

        <main className="page-content">
          <Outlet />
        </main>
      </section>
    </div>
  );
}