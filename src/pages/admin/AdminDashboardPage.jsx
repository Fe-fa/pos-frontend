import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  CircleDollarSign,
  Package,
  Users,
} from 'lucide-react';
import { billingService } from '../../services/billingService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { productService } from '../../services/productService';
import { userService } from '../../services/userService';
import { currency, formatDateTime } from '../../utils/helpers';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';

const extractList = (response) => {
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
};

const paidStatuses = ['paid', 'partial'];

function MetricCard({ icon: Icon, label, value, caption, tone = 'brown' }) {
  return (
    <article className={`metric-card metric-tone-${tone}`}>
      <div className="metric-card-top">
        <p className="metric-label-alignment">{label}</p>
        <div className="metric-icon-badge">
          <Icon size={20} />
        </div>
      </div>
      
      <h3>{value}</h3>
      <span>{caption}</span>
    </article>
  );
}

function buildLast7DaysSeries(billings) {
  const today = new Date();
  const map = new Map();

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString(undefined, { weekday: 'short' });
    map.set(key, { key, label, amount: 0 });
  }

  billings.forEach((billing) => {
    if (!billing?.billing_date) return;
    const key = new Date(billing.billing_date).toISOString().slice(0, 10);
    if (!map.has(key)) return;
    const row = map.get(key);
    row.amount += Number(billing.paid_amount || billing.total || 0);
  });

  return Array.from(map.values());
}

function MiniBars({ series, currencyCode }) {
  const max = Math.max(...series.map((item) => item.amount), 1);

  return (
    <div className="mini-bars">
      {series.map((item) => (
        <div key={item.key} className="mini-bar-col">
          <span className="mini-bar-value">{currency(item.amount, currencyCode)}</span>
          <div className="mini-bar-track">
            <div
              className="mini-bar-fill"
              style={{ height: `${Math.max((item.amount / max) * 100, item.amount ? 12 : 4)}%` }}
            />
          </div>
          <strong>{item.label}</strong>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { stores, storeId, activeStore } = useStore();
  const [dashboard, setDashboard] = useState({
    products: 0,
    customers: 0,
    staff: [],
    allBillings: [],
    allInventory: [],
    recent: [],
    storePerformance: [],
    last7Days: [],
    revenue: 0,
    orders: 0,
    avgTicket: 0,
    outstanding: 0,
  });
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    async function loadDashboard() {
      if (!isAdmin && !storeId) return;

      setLoading(true);
      try {
        const scopedStores = isAdmin
          ? stores
          : stores.filter((store) => String(store.store_id) === String(storeId));

        const scopedStoreIds = scopedStores.map((store) => Number(store.store_id)).filter(Boolean);

        const [
          productsRes,
          customersRes,
          usersRes,
          ...restResponses
        ] = await Promise.all([
          productService.list({ per_page: 10 }),
          customerService.list({ per_page: 10 }),
          userService.list({
            per_page: 10,
            ...(isAdmin ? {} : { store_id: storeId }),
          }),
          ...scopedStoreIds.map((id) => billingService.list({ per_page: 10, store_id: id })),
          ...scopedStoreIds.map((id) => inventoryService.list({ per_page: 10, store_id: id })),
        ]);

        const billingResponses = restResponses.slice(0, scopedStoreIds.length);
        const inventoryResponses = restResponses.slice(scopedStoreIds.length);

        const allBillings = billingResponses.flatMap((response, index) =>
          extractList(response).map((item) => ({
            ...item,
            store_id: item.store_id ?? scopedStoreIds[index],
          }))
        );

        const allInventory = inventoryResponses.flatMap((response, index) =>
          extractList(response).map((item) => ({
            ...item,
            store_id: item.store_id ?? scopedStoreIds[index],
          }))
        );

        const recent = [...allBillings]
          .sort((a, b) => new Date(b.billing_date || 0) - new Date(a.billing_date || 0))
          .slice(0, 8);

        // 👇 FIX 1: Filter unified baseline dataset for paid metrics calculation
        const paidOrders = allBillings.filter((item) => paidStatuses.includes(item.status));

        const revenue = paidOrders.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0);

        // 👇 FIX 2: Calculate average using matching records
        const avgTicket = paidOrders.length > 0
            ? revenue / paidOrders.length
            : 0;

        const outstanding = allBillings.filter((item) => Number(item.balance_due || 0) > 0).length;

        const storePerformance = scopedStores
          .map((store) => {
            const storeBillings = allBillings.filter(
              (item) => String(item.store_id) === String(store.store_id)
            );
            const storeInventory = allInventory.filter(
              (item) => String(item.store_id) === String(store.store_id)
            );
            const storeRevenue = storeBillings
              .filter((item) => paidStatuses.includes(item.status))
              .reduce((sum, item) => sum + Number(item.paid_amount || 0), 0);

            return {
              store_id: store.store_id,
              store_name: store.store_name,
              location: store.location || store.physical_address || '—',
              revenue: storeRevenue,
              orders: storeBillings.filter((item) => item.status !== 'draft').length, // Exclude drafts from total count
              outstanding: storeBillings.filter((item) => Number(item.balance_due || 0) > 0).length,
              lowStock: storeInventory.filter(
                (item) => Number(item.quantity || 0) <= Number(item.reorder_level || 0)
              ).length,
            };
          })
          .sort((a, b) => b.revenue - a.revenue);

        const last7Days = buildLast7DaysSeries(
          isAdmin
            ? allBillings
            : allBillings.filter((item) => String(item.store_id) === String(storeId))
        );

        setDashboard({
          products: extractList(productsRes).length,
          customers: extractList(customersRes).length,
          staff: extractList(usersRes).filter((item) => item.role !== 'admin'),
          allBillings,
          allInventory,
          recent,
          storePerformance,
          last7Days,
          revenue,
          orders: paidOrders.length, // 👇 FIX 3: Display total successful payments count (20 instead of 30)
          avgTicket,
          outstanding,
        });
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
    // 👇 Added activeStore to dependencies array to refresh on store swap toggle
  }, [isAdmin, storeId, stores, activeStore]); 

  const currentCurrency = activeStore?.currency || stores?.[0]?.currency || 'KES';

  const lowStockRows = useMemo(() => {
    return dashboard.allInventory
      .filter((row) => Number(row.quantity || 0) <= Number(row.reorder_level || 0))
      .slice(0, 8);
  }, [dashboard.allInventory]);

  if (loading) return <div className="page-loader">Preparing dashboard…</div>;

  return (
    <section className="stack-lg">
      <div className="metrics-grid">
        {isAdmin ? (
          <>
            <MetricCard
              icon={Building2}
              label="Stores"
              value={stores.length}
            />
            <MetricCard
              icon={BarChart3}
              label="Orders"
              value={dashboard.orders}
          
            />
            <MetricCard
              icon={CircleDollarSign}
              label="Collected"
              value={currency(dashboard.revenue, currentCurrency)}
              tone="gold"
            />
            <MetricCard
              icon={Package}
              label="Outstanding"
              value={dashboard.outstanding}
              tone="soft"
            />
          </>
        ) : (
          <>
            <MetricCard
              icon={CircleDollarSign}
              label="Collected revenue"
              value={currency(dashboard.revenue, currentCurrency)}
              tone="gold"
            />
            <MetricCard
              icon={BarChart3}
              label="Orders"
              value={dashboard.orders}
            />
            <MetricCard
              icon={CircleDollarSign}
              label="Avg. ticket"
              value={currency(dashboard.avgTicket, currentCurrency)}
            />
            <MetricCard
              icon={Users}
              label="Active team"
              value={dashboard.staff.filter((row) => row.is_active).length}
              tone="soft"
            />
          </>
        )}
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>Sales · last 7 days</h3>
              <p>
                {isAdmin
                  ? 'Combined collection trend for all stores'
                  : `Daily trend for ${activeStore?.store_name || 'the active store'}`}
              </p>
            </div>
          </div>
          <MiniBars series={dashboard.last7Days} currencyCode={currentCurrency} />
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <h3>{isAdmin ? 'Store performance' : 'Low stock watch'}</h3>
              <p>
                {isAdmin
                  ? 'Quick comparison of revenue and operational pressure by store'
                  : 'Items that reached or passed reorder level'}
              </p>
            </div>
          </div>

          <div className="list-stack">
            {isAdmin ? (
              dashboard.storePerformance.length ? (
                dashboard.storePerformance.map((store) => (
                  <div key={store.store_id} className="list-row">
                    <div>
                      <strong>{store.store_name}</strong>
                      <p>{store.location}</p>
                    </div>
                    <div className="align-right">
                      <strong>{currency(store.revenue, currentCurrency)}</strong>
                      <p>{store.orders} orders · {store.lowStock} low stock · {store.outstanding} balances</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">No store metrics yet.</p>
              )
            ) : lowStockRows.length ? (
              lowStockRows.map((row) => (
                <div key={row.inventory_id} className="list-row">
                  <div>
                    <strong>{row.product?.product_name || `Product #${row.product_id}`}</strong>
                    <p>Reorder level {row.reorder_level || 0}</p>
                  </div>
                  <div className="align-right">
                    <strong>{row.quantity}</strong>
                    <p>Units remaining</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No low stock items right now.</p>
            )}
          </div>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>Recent billing activity</h3>
            </div>
          </div>

          <div className="list-stack">
            {dashboard.recent.length ? (
              dashboard.recent.map((billing) => (
                <div key={billing.billing_id} className="list-row">
                  <div>
                    <strong>{billing.invnumber || `Draft #${billing.billing_id}`}</strong>
                    <p>{billing.customer?.full_name || 'Walk-in customer'}</p>
                  </div>
                  <div className="align-right">
                    <strong>{currency(billing.total, currentCurrency)}</strong>
                    <p>{formatDateTime(billing.billing_date)}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No billing activity yet.</p>
            )}
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <h3>{isAdmin ? 'Operations snapshot' : 'Team snapshot'}</h3>
              <p>{isAdmin ? 'Top-level counts from the workspace' : 'Users assigned to your store scope'}</p>
            </div>
          </div>

          <div className="info-grid">
            <div className="info-tile compact">
              <strong>Products</strong>
              <span>{dashboard.products} catalog items</span>
            </div>
            <div className="info-tile compact">
              <strong>Customers</strong>
              <span>{dashboard.customers} saved profiles</span>
            </div>
            <div className="info-tile compact">
              <strong>Users</strong>
              <span>{dashboard.staff.length} accessible team members</span>
            </div>
            <div className="info-tile compact">
              <strong>Open balances</strong>
              <span>{dashboard.outstanding} records need follow-up</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
