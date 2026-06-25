import {
  BarChart2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  Receipt,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  UserCog,
  Users,
  Warehouse,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { visibleNav } from '../../config/routePermissions';

const ICON_MAP = {
  LayoutDashboard,
  BarChart2,
  ShoppingCart,
  Receipt,
  ClipboardList,
  CreditCard,
  Users,
  Package,
  Tag,
  Warehouse,
  UserCog,
  ScanLine,
  Store,
  ShieldCheck,
  Settings,
};

function NavIcon({ name, size = 16 }) {
  const Component = ICON_MAP[name];
  return Component ? <Component size={size} /> : null;
}

/**
 * Drop-in sidebar nav that auto-filters links based on user permissions.
 * Replaces any static <nav> in AdminLayout.
 *
 * Usage:
 *   import DynamicSidebar from '../components/layout/DynamicSidebar';
 *   // inside AdminLayout JSX:
 *   <DynamicSidebar />
 */
export default function DynamicSidebar({ className = '' }) {
  const { user, can } = useAuth();
  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const groups  = visibleNav(can, user.role, isAdmin);

  return (
    <nav className={`sidebar-nav ${className}`.trim()} aria-label="Main navigation">
      {groups.map((group, gi) => (
        <div key={group.group ?? `g${gi}`} className="sidebar-group">
          {group.group && (
            <p className="sidebar-group-label">{group.group}</p>
          )}

          <ul className="sidebar-group-list">
            {group.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'sidebar-link--active' : ''}`.trim()
                  }
                  end={item.path === '/admin/dashboard'}
                >
                  <NavIcon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}