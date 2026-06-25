/**
 * Maps admin route paths → the permission required to visit them.
 * null means "no permission check — authenticated users always see it."
 */
export const ROUTE_PERMISSIONS = {
  '/admin/dashboard':      'page.dashboard',
  '/admin/manager':        'page.dashboard',   
  '/admin/billings':       'page.billings',
  '/admin/categories':     'page.categories',
  '/admin/customers':      'page.customers',
  '/admin/products':       'page.products',
  '/admin/inventory':      'page.inventory',
  '/admin/orders':         'page.orders',
  '/admin/users':          'page.users',
  '/admin/cashiers':       'page.cashiers',
  '/admin/stores':         'page.stores',
  '/admin/settings':       'page.settings',
  '/admin/access-control': 'page.access_control',
  '/admin/payments':       'page.billings',     
  '/admin/reports':        'page.reports',
};

export const SIDEBAR_NAV = [
  // ── Main ────────────────────────────────────────────────────────────────
  {
    group: null,
    items: [
      { label: 'Dashboard',      path: '/admin/dashboard',  permission: 'page.dashboard',      icon: 'LayoutDashboard' },
      { label: 'Manager',        path: '/admin/manager',    permission: 'page.dashboard',      icon: 'BarChart2',    roles: ['manager'] },
    ],
  },

  // ── Store operations ─────────────────────────────────────────────────────
  {
    group: 'Operations',
    items: [
      { label: 'POS',            path: '/cashier/pos',      permission: 'pos.access',          icon: 'ShoppingCart' },
      { label: 'Billings',       path: '/admin/billings',   permission: 'page.billings',       icon: 'Receipt' },
      { label: 'Orders',         path: '/admin/orders',     permission: 'page.orders',         icon: 'ClipboardList' },
      { label: 'Payments',       path: '/admin/payments',   permission: 'page.billings',       icon: 'CreditCard' },
      { label: 'Customers',      path: '/admin/customers',  permission: 'page.customers',      icon: 'Users' },
    ],
  },

  // ── Catalog ──────────────────────────────────────────────────────────────
  {
    group: 'Catalog',
    items: [
      { label: 'Products',       path: '/admin/products',   permission: 'page.products',       icon: 'Package' },
      { label: 'Categories',     path: '/admin/categories', permission: 'page.categories',     icon: 'Tag' },
      { label: 'Inventory',      path: '/admin/inventory',  permission: 'page.inventory',      icon: 'Warehouse' },
    ],
  },

  // ── People ───────────────────────────────────────────────────────────────
  {
    group: 'People',
    items: [
      { label: 'Users',          path: '/admin/users',      permission: 'page.users',          icon: 'UserCog' },
      { label: 'Cashiers',       path: '/admin/cashiers',   permission: 'page.cashiers',       icon: 'ScanLine' },
      { label: 'Stores',         path: '/admin/stores',     permission: 'page.stores',         icon: 'Store' },
    ],
  },

  // ── System ───────────────────────────────────────────────────────────────
  {
    group: 'System',
    items: [
      { label: 'Access Control', path: '/admin/access-control', permission: 'page.access_control', icon: 'ShieldCheck' },
      { label: 'Settings',       path: '/admin/settings',   permission: 'page.settings',       icon: 'Settings' },
    ],
  },
];

/**
 * Filters SIDEBAR_NAV items visible to a given user.
 * @param {Function} can       - AuthContext `can(permission)` function
 * @param {string}   role      - user.role
 * @param {boolean}  isAdmin   - shortcut: admins see everything
 */
export function visibleNav(can, role, isAdmin) {
  return SIDEBAR_NAV
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        // role-restricted items (e.g. manager dashboard tile)
        if (item.roles && !item.roles.includes(role) && !isAdmin) return false;
        // permission check
        if (item.permission === null) return true;
        return can(item.permission);
      }),
    }))
    .filter((group) => group.items.length > 0);
}