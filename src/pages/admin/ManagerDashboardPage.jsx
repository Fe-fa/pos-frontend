import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  Receipt,
  ShoppingCart,
  Store,
} from 'lucide-react';
import { billingService } from '../../services/billingService';
import { customerService } from '../../services/customerService';
import { inventoryService } from '../../services/inventoryService';
import { userService } from '../../services/userService';
import { currency, formatDateTime } from '../../utils/helpers';
import { useStore } from '../../contexts/StoreContext';

const PAGE_SIZE = 200;
const paidStatuses = ['paid', 'partial'];
const pendingStatuses = ['draft', 'parked', 'quote', 'pending'];

const extractList = (response) => {
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
};

const extractMeta = (response) =>
  response?.data?.meta || response?.meta || response?.pagination || null;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
const isPaidStatus = (value) => paidStatuses.includes(normalizeStatus(value));
const isPendingStatus = (value) => pendingStatuses.includes(normalizeStatus(value));

const dateOnlyKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const shiftDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const isSameDay = (value, compareDate = new Date()) => {
  const a = dateOnlyKey(value);
  const b = dateOnlyKey(compareDate);
  return a && b && a === b;
};

const getBillingDate = (billing) =>
  billing?.billing_date || billing?.created_at || billing?.updated_at || null;

const getBillingTotal = (billing) =>
  toNumber(billing?.total || billing?.grand_total || billing?.total_amount || 0);

const getPaidAmount = (billing) => {
  const explicit = Number(
    billing?.paid_amount ?? billing?.amount_paid ?? billing?.total_paid
  );

  if (Number.isFinite(explicit)) return explicit;
  if (isPaidStatus(billing?.status)) return getBillingTotal(billing);
  return 0;
};

const getBalanceDue = (billing) => {
  const explicit = Number(billing?.balance_due ?? billing?.balance);
  if (Number.isFinite(explicit)) return explicit;
  return Math.max(getBillingTotal(billing) - getPaidAmount(billing), 0);
};

const getBillingItems = (billing) => {
  if (Array.isArray(billing?.items)) return billing.items;
  if (Array.isArray(billing?.billing_items)) return billing.billing_items;
  if (Array.isArray(billing?.products)) return billing.products;
  if (Array.isArray(billing?.lines)) return billing.lines;
  return [];
};

const getItemName = (item) =>
  item?.product?.product_name ||
  item?.product_name ||
  item?.name ||
  item?.title ||
  (item?.product_id ? `Product #${item.product_id}` : 'Unnamed item');

const getItemKey = (item) =>
  String(item?.product_id || item?.sku || item?.item_id || item?.id || getItemName(item));

const getItemQty = (item) =>
  toNumber(item?.quantity || item?.qty || item?.units || item?.count || 0);

const getItemAmount = (item) => {
  const explicit = Number(
    item?.total ?? item?.line_total ?? item?.amount ?? item?.subtotal
  );

  if (Number.isFinite(explicit)) return explicit;
  return getItemQty(item) * toNumber(item?.unit_price || item?.price || 0);
};

const getCashierLabel = (billing, usersMap) => {
  const directName =
    billing?.cashier?.full_name ||
    billing?.cashier?.name ||
    billing?.user?.full_name ||
    billing?.user?.name ||
    billing?.served_by_name ||
    billing?.cashier_name ||
    billing?.processed_by_name;

  if (directName) return directName;

  const directId =
    billing?.cashier_id || billing?.user_id || billing?.processed_by || billing?.created_by;

  if (directId && usersMap.has(String(directId))) {
    return usersMap.get(String(directId));
  }

  return 'Unknown cashier';
};

const getRegisterLabel = (billing) =>
  billing?.register_name ||
  billing?.till_name ||
  billing?.terminal_name ||
  billing?.register_code ||
  billing?.till_code ||
  (billing?.register_id ? `Register #${billing.register_id}` : null) ||
  (billing?.till_id ? `Till #${billing.till_id}` : null) ||
  'POS Terminal';

const getCustomerCreatedDate = (customer) =>
  customer?.created_at ||
  customer?.createdAt ||
  customer?.registered_at ||
  customer?.registration_date ||
  null;

const getPointsIssued = (row) =>
  toNumber(
    row?.loyalty_points_issued ||
      row?.loyalty_points_earned ||
      row?.points_earned ||
      row?.points_awarded ||
      0
  );

const getPointsRedeemed = (row) =>
  toNumber(
    row?.loyalty_points_redeemed ||
      row?.points_redeemed ||
      row?.redeemed_points ||
      0
  );

const calcDelta = (current, previous) => {
  const diff = toNumber(current) - toNumber(previous);

  if (!previous && !current) {
    return { diff: 0, percent: 0, direction: 'neutral', label: 'No change' };
  }

  if (!previous && current > 0) {
    return { diff, percent: 100, direction: 'up', label: 'Started today' };
  }

  const percent = previous ? (diff / previous) * 100 : 0;

  return {
    diff,
    percent,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
    label:
      diff === 0
        ? 'No change'
        : `${Math.abs(percent).toFixed(1)}% vs comparison`,
  };
};

async function fetchAllFromList(service, params = {}) {
  const firstResponse = await service.list({ page: 1, per_page: PAGE_SIZE, ...params });
  const firstRows = extractList(firstResponse);
  const meta = extractMeta(firstResponse);

  const currentPage = Number(meta?.current_page || meta?.page || 1);
  const lastPage = Number(meta?.last_page || meta?.total_pages || 1);

  if (!lastPage || lastPage <= 1 || currentPage >= lastPage) {
    return firstRows;
  }

  const pages = Array.from(
    { length: lastPage - currentPage },
    (_, index) => currentPage + index + 1
  );

  const restResponses = await Promise.all(
    pages.map((page) => service.list({ page, per_page: PAGE_SIZE, ...params }))
  );

  return [...firstRows, ...restResponses.flatMap((response) => extractList(response))];
}

function buildLast7DaysSeries(billings) {
  const today = new Date();
  const map = new Map();

  for (let i = 6; i >= 0; i -= 1) {
    const date = shiftDays(today, -i);
    const key = dateOnlyKey(date);
    const label = date.toLocaleDateString(undefined, { weekday: 'short' });
    map.set(key, { key, label, amount: 0 });
  }

  billings.forEach((billing) => {
    if (!isPaidStatus(billing?.status)) return;
    const key = dateOnlyKey(getBillingDate(billing));
    if (!key || !map.has(key)) return;
    map.get(key).amount += getPaidAmount(billing);
  });

  return Array.from(map.values());
}

function buildTopItems(billings) {
  const itemsMap = new Map();

  billings.forEach((billing) => {
    getBillingItems(billing).forEach((item) => {
      const key = getItemKey(item);
      if (!itemsMap.has(key)) {
        itemsMap.set(key, { key, name: getItemName(item), qty: 0, amount: 0 });
      }

      const row = itemsMap.get(key);
      row.qty += getItemQty(item);
      row.amount += getItemAmount(item);
    });
  });

  return Array.from(itemsMap.values()).sort(
    (a, b) => b.qty - a.qty || b.amount - a.amount
  );
}

function buildCashierPerformance(billings, usersMap) {
  const cashiers = new Map();

  billings.forEach((billing) => {
    const label = getCashierLabel(billing, usersMap);

    if (!cashiers.has(label)) {
      cashiers.set(label, { name: label, orders: 0, revenue: 0 });
    }

    const row = cashiers.get(label);
    row.orders += 1;
    row.revenue += getPaidAmount(billing);
  });

  return Array.from(cashiers.values()).sort(
    (a, b) => b.revenue - a.revenue || b.orders - a.orders
  );
}

function buildRegisterStats(billings) {
  const registers = new Map();

  billings.forEach((billing) => {
    const label = getRegisterLabel(billing);

    if (!registers.has(label)) {
      registers.set(label, { name: label, orders: 0, collected: 0 });
    }

    const row = registers.get(label);
    row.orders += 1;
    row.collected += getPaidAmount(billing);
  });

  return Array.from(registers.values()).sort(
    (a, b) => b.collected - a.collected || b.orders - a.orders
  );
}

function MetricCard({ icon: Icon, label, value, caption, tone = 'brown', trend }) {
  return (
    <article className={`metric-card metric-tone-${tone}`}>
      <div className="metric-card-top">
        <p className="metric-label-alignment">{label}</p>
        <div className="metric-icon-badge">
          <Icon size={20} />
        </div>
      </div>

      <h3>{value}</h3>

      <div className="metric-card-bottom">
        <span>{caption}</span>
        {trend ? (
          <small className={`metric-trend ${trend.direction}`}>
            {trend.direction === 'up' ? <ArrowUpRight size={14} /> : null}
            {trend.direction === 'down' ? <ArrowDownRight size={14} /> : null}
            {trend.label}
          </small>
        ) : null}
      </div>
    </article>
  );
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
              style={{
                height: `${Math.max((item.amount / max) * 100, item.amount ? 12 : 4)}%`,
              }}
            />
          </div>
          <strong>{item.label}</strong>
        </div>
      ))}
    </div>
  );
}

export default function ManagerDashboardPage() {
  const { stores, storeId, activeStore } = useStore();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({
    todayRevenue: 0,
    yesterdayRevenue: 0,
    transactionsToday: 0,
    transactionsYesterday: 0,
    avgTicketToday: 0,
    activeRegisters: [],
    lowStockRows: [],
    pendingOrders: [],
    topItems: [],
    cashierPerformance: [],
    recent: [],
    last7Days: [],
    loyalty: {
      newCustomersToday: 0,
      issuedToday: 0,
      redeemedToday: 0,
    },
    staffActiveCount: 0,
  });

  useEffect(() => {
    async function loadDashboard() {
      if (!storeId) return;

      setLoading(true);
      try {
        const [billings, inventory, customers, users] = await Promise.all([
          fetchAllFromList(billingService, { store_id: storeId }),
          fetchAllFromList(inventoryService, { store_id: storeId }),
          fetchAllFromList(customerService),
          fetchAllFromList(userService, { store_id: storeId }),
        ]);

        const staff = users.filter((item) => item?.role !== 'admin');
        const usersMap = new Map(
          staff.map((item) => [
            String(item?.user_id || item?.id),
            item?.full_name || item?.name || item?.email || 'Unnamed user',
          ])
        );

        const today = new Date();
        const yesterday = shiftDays(today, -1);

        const todayBillings = billings.filter((item) =>
          isSameDay(getBillingDate(item), today)
        );
        const yesterdayBillings = billings.filter((item) =>
          isSameDay(getBillingDate(item), yesterday)
        );

        const todayPaidOrders = todayBillings.filter((item) =>
          isPaidStatus(item?.status)
        );
        const yesterdayPaidOrders = yesterdayBillings.filter((item) =>
          isPaidStatus(item?.status)
        );
        const paidOrders = billings.filter((item) => isPaidStatus(item?.status));

        const todayRevenue = todayPaidOrders.reduce(
          (sum, item) => sum + getPaidAmount(item),
          0
        );
        const yesterdayRevenue = yesterdayPaidOrders.reduce(
          (sum, item) => sum + getPaidAmount(item),
          0
        );
        const avgTicketToday = todayPaidOrders.length
          ? todayRevenue / todayPaidOrders.length
          : 0;

        const customersHaveStoreScope = customers.some(
          (item) => item?.store_id || item?.store?.store_id
        );

        const scopedCustomers = customersHaveStoreScope
          ? customers.filter(
              (item) =>
                String(item?.store_id || item?.store?.store_id) === String(storeId)
            )
          : customers;

        setDashboard({
          todayRevenue,
          yesterdayRevenue,
          transactionsToday: todayPaidOrders.length,
          transactionsYesterday: yesterdayPaidOrders.length,
          avgTicketToday,
          activeRegisters: buildRegisterStats(todayBillings).slice(0, 8),
          lowStockRows: inventory
            .filter((row) => toNumber(row?.quantity) <= toNumber(row?.reorder_level))
            .sort(
              (a, b) =>
                (toNumber(a?.quantity) - toNumber(a?.reorder_level)) -
                (toNumber(b?.quantity) - toNumber(b?.reorder_level))
            )
            .slice(0, 8),
          pendingOrders: billings
            .filter((item) => isPendingStatus(item?.status))
            .sort(
              (a, b) =>
                new Date(getBillingDate(b) || 0) - new Date(getBillingDate(a) || 0)
            )
            .slice(0, 8),
          topItems: buildTopItems(
            todayPaidOrders.length ? todayPaidOrders : paidOrders
          ).slice(0, 8),
          cashierPerformance: buildCashierPerformance(
            todayBillings.length ? todayBillings : billings,
            usersMap
          ).slice(0, 8),
          recent: [...billings]
            .sort(
              (a, b) =>
                new Date(getBillingDate(b) || 0) - new Date(getBillingDate(a) || 0)
            )
            .slice(0, 8),
          last7Days: buildLast7DaysSeries(billings),
          loyalty: {
            newCustomersToday: scopedCustomers.filter((item) =>
              isSameDay(getCustomerCreatedDate(item), today)
            ).length,
            issuedToday: todayBillings.reduce(
              (sum, item) => sum + getPointsIssued(item),
              0
            ),
            redeemedToday: todayBillings.reduce(
              (sum, item) => sum + getPointsRedeemed(item),
              0
            ),
          },
          staffActiveCount: staff.filter((row) => row?.is_active).length,
        });
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [storeId, activeStore]);

  const currentCurrency = useMemo(
    () => activeStore?.currency || stores?.[0]?.currency || 'KES',
    [activeStore, stores]
  );

  const revenueTrend = calcDelta(
    dashboard.todayRevenue,
    dashboard.yesterdayRevenue
  );
  const transactionTrend = calcDelta(
    dashboard.transactionsToday,
    dashboard.transactionsYesterday
  );

  if (loading) return <div className="page-loader">Preparing dashboard…</div>;

  return (
    <section className="stack-lg">
      <div className="metrics-grid">
        <MetricCard
          icon={CircleDollarSign}
          label="Today's gross revenue"
          value={currency(dashboard.todayRevenue, currentCurrency)}
          caption={`${currency(dashboard.yesterdayRevenue, currentCurrency)} yesterday`}
          tone="gold"
          trend={revenueTrend}
        />

        <MetricCard
          icon={Receipt}
          label="Transaction count"
          value={dashboard.transactionsToday}
          caption={`${dashboard.transactionsYesterday} yesterday`}
          tone="brown"
          trend={transactionTrend}
        />

        <MetricCard
          icon={ShoppingCart}
          label="Average ticket value"
          value={currency(dashboard.avgTicketToday, currentCurrency)}
          caption="Average spend per completed transaction today"
          tone="soft"
        />

        <MetricCard
          icon={Store}
          label="Active cash registers"
          value={dashboard.activeRegisters.length}
          caption={
            dashboard.activeRegisters.length
              ? `${currency(
                  dashboard.activeRegisters.reduce(
                    (sum, row) => sum + row.collected,
                    0
                  ),
                  currentCurrency
                )} processed today`
              : 'No till activity recorded today'
          }
          tone="brown"
        />
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>Sales · last 7 days</h3>
              <p>Paid sales trend for {activeStore?.store_name || 'the active store'}</p>
            </div>
          </div>
          <MiniBars series={dashboard.last7Days} currencyCode={currentCurrency} />
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <h3>Low stock alerts</h3>
              <p>Products that have reached or fallen below reorder level</p>
            </div>
          </div>

          <div className="list-stack">
            {dashboard.lowStockRows.length ? (
              dashboard.lowStockRows.map((row) => {
                const quantity = toNumber(row?.quantity);
                const reorderLevel = toNumber(row?.reorder_level);

                return (
                  <div
                    key={row?.inventory_id || `${row?.product_id}-${row?.store_id}`}
                    className="list-row"
                  >
                    <div>
                      <strong>{row?.product?.product_name || `Product #${row?.product_id}`}</strong>
                      <p>Minimum threshold {reorderLevel}</p>
                    </div>
                    <div className="align-right">
                      <strong>{quantity} units</strong>
                      <p className={quantity <= 0 ? 'danger' : ''}>
                        {quantity <= 0
                          ? 'Out of stock'
                          : `${Math.max(reorderLevel - quantity, 0)} below target`}
                      </p>
                    </div>
                  </div>
                );
              })
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
              <h3>Pending orders / drafts</h3>
              <p>Receipts, parked invoices, or quotes that still need attention</p>
            </div>
          </div>

          <div className="list-stack">
            {dashboard.pendingOrders.length ? (
              dashboard.pendingOrders.map((billing) => (
                <div key={billing?.billing_id} className="list-row">
                  <div>
                    <strong>{billing?.invnumber || `Draft #${billing?.billing_id}`}</strong>
                    <p>
                      {billing?.customer?.full_name || 'Walk-in customer'} ·{' '}
                      {normalizeStatus(billing?.status) || 'draft'}
                    </p>
                  </div>
                  <div className="align-right">
                    <strong>{currency(getBillingTotal(billing), currentCurrency)}</strong>
                    <p>{formatDateTime(getBillingDate(billing))}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No pending drafts or parked invoices.</p>
            )}
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <h3>Top-selling items</h3>
              <p>Fastest-moving items by quantity and revenue</p>
            </div>
          </div>

          <div className="list-stack">
            {dashboard.topItems.length ? (
              dashboard.topItems.map((item, index) => (
                <div key={item.key} className="list-row">
                  <div className="list-row-flex">
                    <span className="rank-badge">#{index + 1}</span>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.qty} units sold</p>
                    </div>
                  </div>
                  <div className="align-right">
                    <strong>{currency(item.amount, currentCurrency)}</strong>
                    <p>Revenue contribution</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No item performance data yet.</p>
            )}
          </div>
        </article>
      </div>

      <div className="dashboard-grid">
        <article className="card">
          <div className="card-header">
            <div>
              <h3>Cashier performance</h3>
              <p>Sales accountability by staff member in the current scope</p>
            </div>
          </div>

          <div className="list-stack">
            {dashboard.cashierPerformance.length ? (
              dashboard.cashierPerformance.map((cashier, index) => (
                <div key={`${cashier.name}-${index}`} className="list-row">
                  <div className="list-row-flex">
                    <span className="rank-badge">#{index + 1}</span>
                    <div>
                      <strong>{cashier.name}</strong>
                      <p>{cashier.orders} processed orders</p>
                    </div>
                  </div>
                  <div className="align-right">
                    <strong>{currency(cashier.revenue, currentCurrency)}</strong>
                    <p>Sales value</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No cashier activity yet.</p>
            )}
          </div>
        </article>

        <article className="card">
          <div className="card-header">
            <div>
              <h3>Loyalty & till snapshot</h3>
              <p>Customer growth, loyalty movement, and currently active till usage</p>
            </div>
          </div>

          <div className="info-grid">
            <div className="info-tile compact">
              <strong>New loyalty customers</strong>
              <span>{dashboard.loyalty.newCustomersToday} registered today</span>
            </div>
            <div className="info-tile compact">
              <strong>Points issued</strong>
              <span>{dashboard.loyalty.issuedToday} points awarded today</span>
            </div>
            <div className="info-tile compact">
              <strong>Points redeemed</strong>
              <span>{dashboard.loyalty.redeemedToday} points used today</span>
            </div>
            <div className="info-tile compact">
              <strong>Active team</strong>
              <span>{dashboard.staffActiveCount} active users in this store</span>
            </div>
          </div>
        </article>
      </div>

      <article className="card">
        <div className="card-header">
          <div>
            <h3>Recent billing activity</h3>
            <p>Latest receipts and invoices created in this store</p>
          </div>
        </div>

        <div className="list-stack">
          {dashboard.recent.length ? (
            dashboard.recent.map((billing) => (
              <div key={billing?.billing_id} className="list-row">
                <div>
                  <strong>{billing?.invnumber || `Draft #${billing?.billing_id}`}</strong>
                  <p>{billing?.customer?.full_name || 'Walk-in customer'}</p>
                </div>
                <div className="align-right">
                  <strong>{currency(getBillingTotal(billing), currentCurrency)}</strong>
                  <p>{formatDateTime(getBillingDate(billing))}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No billing activity yet.</p>
          )}
        </div>
      </article>
    </section>
  );
}