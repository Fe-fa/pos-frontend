import api from '../lib/api';

const buildConfig = ({ storeId, signal, page } = {}) => {
  const config = {};
  const params = {};

  if (storeId) params.store_id = storeId;
  if (page && page > 1) params.page = page;

  if (Object.keys(params).length) config.params = params;
  if (signal) config.signal = signal;

  return config;
};

const dashboardService = {
  // ── Super Admin ──────────────────────────────────────────────────────
  async getSuperAdminSummary({ storeId, signal } = {}) {
    const response = await api.get('/dashboard/super-admin', buildConfig({ storeId, signal }));
    return response.data;
  },

  async getSuperAdminTrends({ storeId, signal } = {}) {
    const response = await api.get(
      '/dashboard/super-admin/trends',
      buildConfig({ storeId, signal })
    );
    return response.data;
  },

  async getSuperAdminOperations({ storeId, signal } = {}) {
    const response = await api.get(
      '/dashboard/super-admin/operations',
      buildConfig({ storeId, signal })
    );
    return response.data;
  },

  async getSuperAdminSubscriptions({ storeId, signal } = {}) {
    const response = await api.get(
      '/dashboard/super-admin/subscriptions',
      buildConfig({ storeId, signal })
    );
    return response.data;
  },

  async getSuperAdminSecurity({ storeId, signal, page } = {}) {
    const response = await api.get(
      '/dashboard/super-admin/security',
      buildConfig({ storeId, signal, page })
    );
    return response.data;
  },

  async initializeSuperAdminDashboard({
    storeId,
    signal,
    onSectionStart,
    onSectionSuccess,
  } = {}) {
    const results = {};

    const run = async (key, executor) => {
      onSectionStart?.(key);
      const payload = await executor();
      results[key] = payload;
      onSectionSuccess?.(key, payload);
      return payload;
    };

    await run('summary', () =>
      dashboardService.getSuperAdminSummary({ storeId, signal })
    );

    await run('trends', () =>
      dashboardService.getSuperAdminTrends({ storeId, signal })
    );

    await run('operations', () =>
      dashboardService.getSuperAdminOperations({ storeId, signal })
    );

    await run('subscriptions', () =>
      dashboardService.getSuperAdminSubscriptions({ storeId, signal })
    );

    await run('security', () =>
      dashboardService.getSuperAdminSecurity({ storeId, signal, page: 1 })
    );

    return results;
  },

  // ── Manager ──────────────────────────────────────────────────────────
  async getManagerSummary({ storeId, signal } = {}) {
    const response = await api.get('/dashboard/manager', buildConfig({ storeId, signal }));
    return response.data;
  },

  async getManagerTrends({ storeId, signal } = {}) {
    const response = await api.get(
      '/dashboard/manager/trends',
      buildConfig({ storeId, signal })
    );
    return response.data;
  },

  async getManagerActivity({ storeId, signal } = {}) {
    const response = await api.get(
      '/dashboard/manager/activity',
      buildConfig({ storeId, signal })
    );
    return response.data;
  },

  /**
   * Optimized manager initialization:
   * 1) Load summary first (it carries the most important KPIs)
   * 2) Load trends + activity in parallel after summary
   */
  async initializeManagerDashboard({
    storeId,
    signal,
    onSectionStart,
    onSectionSuccess,
  } = {}) {
    const results = {};

    const run = async (key, executor) => {
      onSectionStart?.(key);
      const payload = await executor();
      results[key] = payload;
      onSectionSuccess?.(key, payload);
      return payload;
    };

    // 1) Summary first
    await run('summary', () =>
      dashboardService.getManagerSummary({ storeId, signal })
    );

    // 2) Trends + activity in parallel
    const trendsPromise = run('trends', () =>
      dashboardService.getManagerTrends({ storeId, signal })
    );

    const activityPromise = run('activity', () =>
      dashboardService.getManagerActivity({ storeId, signal })
    );

    await Promise.all([trendsPromise, activityPromise]);

    return results;
  },
};

export { dashboardService };
export default dashboardService;
