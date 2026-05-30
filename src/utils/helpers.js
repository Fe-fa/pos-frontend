export function readJSON(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function currency(amount, code = 'KES') {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: code || 'KES',
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));
}

export function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-KE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

export function hasPermission(user, permission) {
  return user?.permissions?.includes(permission);
}

export function hasRole(user, roles = []) {
  return roles.includes(user?.role);
}

export function extractList(payload) {
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

export function normalizeStores(user) {
  const buckets = [
    ...(Array.isArray(user?.stores) ? user.stores : []),
    ...(user?.default_store ? [user.default_store] : []),
  ];

  const seen = new Set();

  return buckets.filter((store) => {
    const id = String(store?.store_id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function userHasStoreAssignment(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return normalizeStores(user).length > 0 || !!user.default_store_id;
}

export function getUserHomePath(user) {
  if (!user) return '/login';
  if (user.role === 'cashier') {
    return userHasStoreAssignment(user) ? '/cashier/pos' : '/pending-approval';
  }
  return '/admin/dashboard';
}
const openCreateModal = () => {
  resetForm();
  setShowModal(true);
};

const closeModal = () => {
  setShowModal(false);
  resetForm();
};

