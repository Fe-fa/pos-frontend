import {
  Bell, Boxes, Coffee, LayoutDashboard, LogOut,
  Moon, Package, ReceiptText, Settings,
  ShoppingBasket, Store, Sun, Users, Warehouse,
} from 'lucide-react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { useTheme } from '../../contexts/ThemeContext';

// Admin nav — all pages, no permission filter needed (admin has everything)
const adminNavItems = [
  { to: '/admin/dashboard',      label: 'Dashboard',      icon: LayoutDashboard, permission: 'page.dashboard'      },
  { to: '/admin/stores',         label: 'Stores',         icon: Store,           permission: 'page.stores'         },
  { to: '/admin/users',          label: 'Users & Access', icon: Users,           permission: 'page.users'          },
  { to: '/admin/categories',     label: 'Categories',     icon: Boxes,           permission: 'page.categories'     },
  { to: '/admin/customers',      label: 'Customers',      icon: Users,           permission: 'page.customers'      },
  { to: '/admin/products',       label: 'Products',       icon: Package,         permission: 'page.products'       },
  { to: '/admin/inventory',      label: 'Inventory',      icon: Warehouse,       permission: 'page.inventory'      },
  { to: '/admin/billings',       label: 'Billings',       icon: ReceiptText,     permission: 'page.billings'       },
  { to: '/admin/orders',         label: 'Orders',         icon: ShoppingBasket,  permission: 'page.orders'         },
  { to: '/admin/settings',       label: 'Settings',       icon: Settings,        permission: 'page.settings'       },
  { to: '/admin/access-control', label: 'Access Control', icon: Users,           permission: 'page.access_control' },
];

// Manager/cashier nav — page.* controls visibility, *.manage controls actions inside the page
const managerNavItems = [
  { to: '/admin/manager',    label: 'Dashboard',  icon: LayoutDashboard, permission: 'page.dashboard'  },
  { to: '/admin/users',      label: 'Users',      icon: Users,           permission: 'page.users'      },
  { to: '/admin/cashiers',   label: 'Cashiers',   icon: Users,           permission: 'page.cashiers'   },
  { to: '/admin/customers',  label: 'Customers',  icon: Users,           permission: 'page.customers'  },
  { to: '/admin/categories', label: 'Categories', icon: Boxes,           permission: 'page.categories' },
  { to: '/admin/products',   label: 'Products',   icon: Package,         permission: 'page.products'   },
  { to: '/admin/inventory',  label: 'Inventory',  icon: Warehouse,       permission: 'page.inventory'  },
  { to: '/admin/billings',   label: 'Billings',   icon: ReceiptText,     permission: 'page.billings'   },
  { to: '/admin/orders',     label: 'Orders',     icon: ShoppingBasket,  permission: 'page.orders'     },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, user, can } = useAuth();
  const { stores, storeId, setStoreId } = useStore();
  const { theme, toggleTheme } = useTheme();

  const isAdmin = user?.role === 'admin';
  const isDashboard = location.pathname === '/admin/dashboard';

  // Both admin and manager/cashier now filter by page.* permissions.
  // Admin has all page.* permissions from the seeder so nothing is hidden.
  // Manager/cashier only see pages their role grants.
  const navItems = (isAdmin ? adminNavItems : managerNavItems).filter(
    (item) => !item.permission || can(item.permission)
  );

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

          <button className="ghost-button" onClick={handleLogout}>
            <LogOut size={16} />
            Logout
          </button>
        </nav>
      </aside>

      <section className="main-shell">
        {isDashboard && (
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
                onClick={() => navigate('/cashier')}
              >
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