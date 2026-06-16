import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  Store,
  TrendingUp,
  Users,
  Wallet,
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
const refundStatuses = ['refund', 'refunded', 'returned', 'return'];
const voidStatuses = ['void', 'voided', 'cancelled', 'canceled'];

const CHART_COLORS = {
  profit: '#37B26C',
  cost: '#D95B74',
  sales: '#C5B23D',
  refunds: '#F0C94A',
  net: '#0E84C3',
};

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
const isRefundStatus = (value) => refundStatuses.includes(normalizeStatus(value));
const isVoidStatus = (value) => voidStatuses.includes(normalizeStatus(value));

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

const isSameMonth = (value, compareDate = new Date()) => {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === compareDate.getFullYear() &&
    date.getMonth() === compareDate.getMonth()
  );
};

const clampPercent = (value) => Math.max(0, Math.min(100, toNumber(value)));

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

const getItemCost = (item) => {
  const explicit = Number(
    item?.cost_total ?? item?.total_cost ?? item?.cost_amount
  );

  if (Number.isFinite(explicit)) return explicit;

  const unitCost = toNumber(
    item?.cost_price ||
      item?.unit_cost ||
      item?.buying_price ||
      item?.purchase_price ||
      item?.product?.cost_price ||
      0
  );

  return getItemQty(item) * unitCost;
};

const getBillingCost = (billing) => {
  const explicit = Number(
    billing?.cost ?? billing?.total_cost ?? billing?.cost_total
  );

  if (Number.isFinite(explicit)) return explicit;

  return getBillingItems(billing).reduce((sum, item) => sum + getItemCost(item), 0);
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

const getCustomerKeyFromBilling = (billing) =>
  String(
    billing?.customer_id ||
      billing?.customer?.customer_id ||
      billing?.customer?.id ||
      billing?.customer?.email ||
      billing?.customer?.phone ||
      billing?.customer?.full_name ||
      ''
  ).trim();

const getInventoryQty = (row) => toNumber(row?.quantity || row?.qty || row?.stock || 0);

const getInventoryUnitValue = (row) =>
  toNumber(
    row?.product?.cost_price ||
      row?.cost_price ||
      row?.unit_cost ||
      row?.buying_price ||
      row?.product?.selling_price ||
      row?.selling_price ||
      row?.price ||
      0
  );

const getInventoryValue = (row) => {
  const explicit = Number(row?.stock_value ?? row?.inventory_value ?? row?.value);
  if (Number.isFinite(explicit)) return explicit;
  return getInventoryQty(row) * getInventoryUnitValue(row);
};

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
        : `${Math.abs(percent).toFixed(1)}% vs yesterday`,
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
    const label = date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
    });

    map.set(key, {
      key,
      label,
      sales: 0,
      refunds: 0,
      cost: 0,
      profit: 0,
      net: 0,
    });
  }

  billings.forEach((billing) => {
    const key = dateOnlyKey(getBillingDate(billing));
    if (!key || !map.has(key)) return;

    const row = map.get(key);

    if (isPaidStatus(billing?.status)) {
      const paid = getPaidAmount(billing);
      const cost = getBillingCost(billing);

      row.sales += paid;
      row.cost += cost;
      row.net += paid;
      row.profit += paid - cost;
    }

    if (isRefundStatus(billing?.status)) {
      const refunded = getBillingTotal(billing);
      row.refunds += refunded;
      row.net -= refunded;
      row.profit -= refunded;
    }
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

function PulseTile({ icon: Icon, tone, value, label, trend }) {
  return (
    <div className="pulse-tile">
      <div className={`pulse-icon ${tone ? `tone-${tone}` : ''}`}>
        <Icon size={20} />
      </div>

      <div className="pulse-copy">
        <strong>{value}</strong>
        <span>{label}</span>
      </div>

      {trend ? (
        <div className={`pulse-trend ${trend.direction}`}>
          {trend.direction === 'up' ? <ArrowUpRight size={14} /> : null}
          {trend.direction === 'down' ? <ArrowDownRight size={14} /> : null}
          <span>{trend.label}</span>
        </div>
      ) : null}
    </div>
  );
}

function RetroStatBox({ icon: Icon, tone, value, label }) {
  return (
    <div className="stat-retro-box">
      <div className={`stat-retro-icon ${tone ? `tone-${tone}` : ''}`}>
        <Icon size={20} />
      </div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

function SalesGraph({ series, currencyCode }) {
  const width = 760;
  const height = 280;
  const padX = 42;
  const padY = 24;
  const plotWidth = width - padX * 2;
  const plotHeight = height - padY * 2;

  const keys = ['profit', 'cost', 'sales', 'refunds', 'net'];
  const maxValue = Math.max(
    ...series.flatMap((row) => keys.map((key) => Math.abs(toNumber(row[key])))),
    1
  );

  const ticks = Array.from({ length: 5 }, (_, index) => {
    const value = (maxValue / 4) * (4 - index);
    const y = padY + (plotHeight / 4) * index;
    return { value, y };
  });

  const buildPoints = (key) =>
    series
      .map((row, index) => {
        const x =
          padX + (index * plotWidth) / Math.max(series.length - 1, 1);
        const ratio = toNumber(row[key]) / maxValue;
        const y = padY + plotHeight - ratio * plotHeight;
        return `${x},${y}`;
      })
      .join(' ');

  const totals = series.reduce(
    (acc, row) => ({
      sales: acc.sales + row.sales,
      refunds: acc.refunds + row.refunds,
      profit: acc.profit + row.profit,
    }),
    { sales: 0, refunds: 0, profit: 0 }
  );

  return (
    <div className="sales-graph-shell">
      <div className="sales-legend">
        <span className="sales-legend-item">
          <i style={{ background: CHART_COLORS.profit }} />
          Profit
        </span>
        <span className="sales-legend-item">
          <i style={{ background: CHART_COLORS.cost }} />
          Cost
        </span>
        <span className="sales-legend-item">
          <i style={{ background: CHART_COLORS.sales }} />
          Sales
        </span>
        <span className="sales-legend-item">
          <i style={{ background: CHART_COLORS.refunds }} />
          Refunds
        </span>
        <span className="sales-legend-item">
          <i style={{ background: CHART_COLORS.net }} />
          Net Sales
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="sales-graph-svg"
        role="img"
        aria-label="Sales graph"
      >
        {ticks.map((tick) => (
          <g key={tick.y}>
            <line
              x1={padX}
              x2={width - padX}
              y1={tick.y}
              y2={tick.y}
              className="sales-grid-line"
            />
            <text x={8} y={tick.y + 4} className="sales-axis-label">
              {currency(tick.value, currencyCode)}
            </text>
          </g>
        ))}

        {series.map((row, index) => {
          const x =
            padX + (index * plotWidth) / Math.max(series.length - 1, 1);

          return (
            <text
              key={row.key}
              x={x}
              y={height - 8}
              textAnchor="middle"
              className="sales-axis-label"
            >
              {row.label}
            </text>
          );
        })}

        {keys.map((key) => (
          <polyline
            key={key}
            fill="none"
            stroke={CHART_COLORS[key]}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={buildPoints(key)}
          />
        ))}
      </svg>

      <div className="sales-graph-summary">
        <div>
          <span>Total sales</span>
          <strong>{currency(totals.sales, currencyCode)}</strong>
        </div>
        <div>
          <span>Refunds</span>
          <strong>{currency(totals.refunds, currencyCode)}</strong>
        </div>
        <div>
          <span>Gross profit</span>
          <strong>{currency(totals.profit, currencyCode)}</strong>
        </div>
      </div>
    </div>
  );
}

export default function ManagerDashboardPage() {
  const { stores, storeId, activeStore } = useStore();

  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState({
    todayRevenue: 0,
    yesterdayRevenue: 0,
    todayRefundAmount: 0,
    yesterdayRefundAmount: 0,
    todayVoidCount: 0,
    yesterdayVoidCount: 0,
    transactionsToday: 0,
    transactionsYesterday: 0,
    avgTicketToday: 0,
    todayCost: 0,
    yesterdayCost: 0,
    todayProfit: 0,
    yesterdayProfit: 0,
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
    inventoryGrace: 0,
    monthlyProjectedSales: 0,
    averageMargin: 0,
    uniqueCustomersToday: 0,
    totalInventoryUnits: 0,
    totalInventoryValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    healthyStockCount: 0,
  });

  useEffect(() => {
    async function loadDashboard() {
      if (!storeId) {
        setLoading(false);
        return;
      }

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

        const todayRefunds = todayBillings.filter((item) =>
          isRefundStatus(item?.status)
        );
        const yesterdayRefunds = yesterdayBillings.filter((item) =>
          isRefundStatus(item?.status)
        );

        const todayVoids = todayBillings.filter((item) => isVoidStatus(item?.status));
        const yesterdayVoids = yesterdayBillings.filter((item) =>
          isVoidStatus(item?.status)
        );

        const todayRevenue = todayPaidOrders.reduce(
          (sum, item) => sum + getPaidAmount(item),
          0
        );
        const yesterdayRevenue = yesterdayPaidOrders.reduce(
          (sum, item) => sum + getPaidAmount(item),
          0
        );

        const todayRefundAmount = todayRefunds.reduce(
          (sum, item) => sum + getBillingTotal(item),
          0
        );
        const yesterdayRefundAmount = yesterdayRefunds.reduce(
          (sum, item) => sum + getBillingTotal(item),
          0
        );

        const todayCost = todayPaidOrders.reduce(
          (sum, item) => sum + getBillingCost(item),
          0
        );
        const yesterdayCost = yesterdayPaidOrders.reduce(
          (sum, item) => sum + getBillingCost(item),
          0
        );

        const todayNetSales = todayRevenue - todayRefundAmount;
        const yesterdayNetSales = yesterdayRevenue - yesterdayRefundAmount;

        const todayProfit = todayNetSales - todayCost;
        const yesterdayProfit = yesterdayNetSales - yesterdayCost;

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

        const monthPaidRevenue = billings
          .filter((item) => isPaidStatus(item?.status) && isSameMonth(getBillingDate(item), today))
          .reduce((sum, item) => sum + getPaidAmount(item), 0);

        const daysInMonth = new Date(
          today.getFullYear(),
          today.getMonth() + 1,
          0
        ).getDate();

        const monthlyProjectedSales =
          today.getDate() > 0 ? (monthPaidRevenue / today.getDate()) * daysInMonth : 0;

        const lowStockRows = inventory
          .filter((row) => getInventoryQty(row) <= toNumber(row?.reorder_level))
          .sort(
            (a, b) =>
              getInventoryQty(a) -
              toNumber(a?.reorder_level) -
              (getInventoryQty(b) - toNumber(b?.reorder_level))
          );

        const lowStockCount = lowStockRows.length;
        const outOfStockCount = inventory.filter((row) => getInventoryQty(row) <= 0).length;
        const healthyStockCount = Math.max(inventory.length - lowStockCount, 0);
        const inventoryGrace = inventory.length
          ? (healthyStockCount / inventory.length) * 100
          : 0;

        const totalInventoryUnits = inventory.reduce(
          (sum, row) => sum + getInventoryQty(row),
          0
        );

        const totalInventoryValue = inventory.reduce(
          (sum, row) => sum + getInventoryValue(row),
          0
        );

        const uniqueCustomersToday = new Set(
          todayBillings.map(getCustomerKeyFromBilling).filter(Boolean)
        ).size;

        setDashboard({
          todayRevenue,
          yesterdayRevenue,
          todayRefundAmount,
          yesterdayRefundAmount,
          todayVoidCount: todayVoids.length,
          yesterdayVoidCount: yesterdayVoids.length,
          transactionsToday: todayPaidOrders.length,
          transactionsYesterday: yesterdayPaidOrders.length,
          avgTicketToday,
          todayCost,
          yesterdayCost,
          todayProfit,
          yesterdayProfit,
          activeRegisters: buildRegisterStats(todayPaidOrders).slice(0, 8),
          lowStockRows: lowStockRows.slice(0, 8),
          pendingOrders: billings
            .filter((item) => isPendingStatus(item?.status))
            .sort(
              (a, b) =>
                new Date(getBillingDate(b) || 0) - new Date(getBillingDate(a) || 0)
            )
            .slice(0, 8),
          topItems: buildTopItems(
            todayPaidOrders.length ? todayPaidOrders : paidOrders
          ).slice(0, 10),
          cashierPerformance: buildCashierPerformance(
            todayPaidOrders.length ? todayPaidOrders : paidOrders,
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
          inventoryGrace,
          monthlyProjectedSales,
          averageMargin: todayNetSales ? (todayProfit / todayNetSales) * 100 : 0,
          uniqueCustomersToday,
          totalInventoryUnits,
          totalInventoryValue,
          lowStockCount,
          outOfStockCount,
          healthyStockCount,
        });
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [storeId, activeStore, reloadKey]);

  const currentCurrency = useMemo(
    () => activeStore?.currency || stores?.[0]?.currency || 'KES',
    [activeStore, stores]
  );

  const salesTrend = calcDelta(dashboard.transactionsToday, dashboard.transactionsYesterday);
  const refundTrend = calcDelta(
    dashboard.todayRefundAmount,
    dashboard.yesterdayRefundAmount
  );
  const voidTrend = calcDelta(dashboard.todayVoidCount, dashboard.yesterdayVoidCount);
  const netTrend = calcDelta(dashboard.todayRevenue, dashboard.yesterdayRevenue);
  const costTrend = calcDelta(dashboard.todayCost, dashboard.yesterdayCost);
  const profitTrend = calcDelta(dashboard.todayProfit, dashboard.yesterdayProfit);

  if (loading) return <div className="page-loader">Preparing dashboard…</div>;

  return (
    <section className="stack-lg super-admin-dashboard-v2">
      <div className="section-header">
        <div>
          <p>Home / overview &amp; stats</p>
          <h2>Dashboard</h2>
        </div>

        <div className="topbar-actions">
          <span className="store-name">
            {activeStore?.store_name || 'Active store'}
          </span>

          <button
            type="button"
            className="primary-button"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      <div className="dashboard-grid dashboard-hero-grid">
        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Today&apos;s Takings</h3>
              <p>Live sales pulse for the active store</p>
            </div>
            <span className="dashboard-header-pill">Today</span>
          </div>

          <div className="takings-grid">
            <PulseTile
              icon={ShoppingCart}
              tone="green"
              value={dashboard.transactionsToday}
              label="Sales"
              trend={salesTrend}
            />

            <PulseTile
              icon={RotateCcw}
              tone="yellow"
              value={currency(dashboard.todayRefundAmount, currentCurrency)}
              label="Refunds"
              trend={refundTrend}
            />

            <PulseTile
              icon={AlertTriangle}
              tone="red"
              value={dashboard.todayVoidCount}
              label="Voids"
              trend={voidTrend}
            />

            <PulseTile
              icon={Wallet}
              tone="blue"
              value={currency(
                dashboard.todayRevenue - dashboard.todayRefundAmount,
                currentCurrency
              )}
              label="Net Sales"
              trend={netTrend}
            />

            <PulseTile
              icon={Receipt}
              tone="yellow"
              value={currency(dashboard.todayCost, currentCurrency)}
              label="Cost"
              trend={costTrend}
            />

            <PulseTile
              icon={TrendingUp}
              tone="green"
              value={currency(dashboard.todayProfit, currentCurrency)}
              label="Profit"
              trend={profitTrend}
            />
          </div>
        </article>

        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Sales Graph</h3>
              <p>7-day performance across sales, cost, profit and refunds</p>
            </div>
            <span className="dashboard-header-pill">Last 7 Days</span>
          </div>

          <SalesGraph
            series={dashboard.last7Days}
            currencyCode={currentCurrency}
          />
        </article>
      </div>

      <div className="dashboard-grid dashboard-hero-grid">
        <article className="card retro-dashboard-card">
          <div className="card-header retro-header">
            <div>
              <h3>Top Rank Items</h3>
              <p>Best performing products by volume and value</p>
            </div>
            <span className="dashboard-header-pill">Top 10</span>
          </div>

          <div className="table-wrap dashboard-rank-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Qty</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.topItems.length ? (
                  dashboard.topItems.map((item) => (
                    <tr key={item.key}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>{item.qty}</td>
                      <td>{currency(item.amount, currentCurrency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="catalog-empty-cell">
                      No item performance data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <div className="stack-md">
          <article className="card retro-dashboard-card">
            <div className="card-header retro-header">
              <div>
                <h3>Stats</h3>
                <p>Fast operational health metrics for this store</p>
              </div>
            </div>

            <div className="stats-grid-retro">
              <RetroStatBox
                icon={Package}
                tone="yellow"
                value={`${clampPercent(dashboard.inventoryGrace).toFixed(0)} %`}
                label="Inventory grace"
              />
              <RetroStatBox
                icon={CircleDollarSign}
                tone="blue"
                value={currency(dashboard.monthlyProjectedSales, currentCurrency)}
                label="Monthly projected sales"
              />
              <RetroStatBox
                icon={Percent}
                tone="blue"
                value={`${dashboard.averageMargin.toFixed(2)}%`}
                label="Average margin"
              />
              <RetroStatBox
                icon={Wallet}
                tone="blue"
                value={currency(dashboard.avgTicketToday, currentCurrency)}
                label="Average ticket amount"
              />
              <RetroStatBox
                icon={Users}
                tone="blue"
                value={dashboard.uniqueCustomersToday}
                label="Unique customers today"
              />
              <RetroStatBox
                icon={Store}
                tone="yellow"
                value={dashboard.activeRegisters.length}
                label="Active cash registers"
              />
            </div>
          </article>

          <div className="info-grid">
            <article className="card retro-dashboard-card">
              <div className="card-header retro-header">
                <div>
                  <h3>Sale Stats</h3>
                  <p>Status mix and till movement for today</p>
                </div>
              </div>

              <div className="inventory-legend-stack" style={{ padding: 16 }}>
                <div className="inventory-legend-item">
                  <span className="dot good" />
                  <div>
                    <strong>Completed sales</strong>
                    <p>{dashboard.transactionsToday} paid transactions recorded today</p>
                  </div>
                </div>

                <div className="inventory-legend-item">
                  <span className="dot warn" />
                  <div>
                    <strong>Pending drafts</strong>
                    <p>{dashboard.pendingOrders.length} orders still need attention</p>
                  </div>
                </div>

                <div className="inventory-legend-item">
                  <span className="dot neutral" />
                  <div>
                    <strong>Loyalty movement</strong>
                    <p>
                      {dashboard.loyalty.issuedToday} issued · {dashboard.loyalty.redeemedToday} redeemed
                    </p>
                  </div>
                </div>
              </div>

              <div className="sales-graph-summary" style={{ padding: '0 16px 16px' }}>
                <div>
                  <span>Sales</span>
                  <strong>{dashboard.transactionsToday}</strong>
                </div>
                <div>
                  <span>Net sale</span>
                  <strong>
                    {currency(
                      dashboard.todayRevenue - dashboard.todayRefundAmount,
                      currentCurrency
                    )}
                  </strong>
                </div>
                <div>
                  <span>Active staff</span>
                  <strong>{dashboard.staffActiveCount}</strong>
                </div>
              </div>
            </article>

            <article className="card retro-dashboard-card">
              <div className="card-header retro-header">
                <div>
                  <h3>Inventory Stats</h3>
                  <p>Quick stock health and value position</p>
                </div>
              </div>

              <div className="inventory-split">
                <div className="donut-card">
                  <div className="donut-visual">
                    <svg viewBox="0 0 120 120" className="donut-svg" aria-hidden="true">
                      <circle className="donut-track" cx="60" cy="60" r="42" />
                      <circle
                        className="donut-progress"
                        cx="60"
                        cy="60"
                        r="42"
                        strokeDasharray={`${(clampPercent(
                          (dashboard.lowStockCount /
                            Math.max(
                              dashboard.lowStockCount + dashboard.healthyStockCount,
                              1
                            )) *
                            100
                        ) /
                          100) *
                          264} 264`}
                      />
                    </svg>

                    <div className="donut-center">
                      <strong>{dashboard.lowStockCount}</strong>
                      <span>Low stock</span>
                    </div>
                  </div>

                  <p>
                    {dashboard.totalInventoryUnits} units tracked with an estimated value of{' '}
                    {currency(dashboard.totalInventoryValue, currentCurrency)}.
                  </p>
                </div>

                <div className="inventory-legend-stack">
                  <div className="inventory-legend-item">
                    <span className="dot good" />
                    <div>
                      <strong>Healthy items</strong>
                      <p>{dashboard.healthyStockCount} items above reorder level</p>
                    </div>
                  </div>

                  <div className="inventory-legend-item">
                    <span className="dot warn" />
                    <div>
                      <strong>Low stock</strong>
                      <p>{dashboard.lowStockCount} items at or below target</p>
                    </div>
                  </div>

                  <div className="inventory-legend-item">
                    <span className="dot neutral" />
                    <div>
                      <strong>Out of stock</strong>
                      <p>{dashboard.outOfStockCount} items currently unavailable</p>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
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
              <p className="muted">No billing activity yet.</p>
            )}
          </div>
        </article>

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
              <h3>Low stock alerts</h3>
              <p>Products that have reached or fallen below reorder level</p>
            </div>
          </div>

          <div className="list-stack">
            {dashboard.lowStockRows.length ? (
              dashboard.lowStockRows.map((row) => {
                const quantity = getInventoryQty(row);
                const reorderLevel = toNumber(row?.reorder_level);

                return (
                  <div
                    key={row?.inventory_id || `${row?.product_id}-${row?.store_id}`}
                    className="list-row"
                  >
                    <div>
                      <strong>
                        {row?.product?.product_name || `Product #${row?.product_id}`}
                      </strong>
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
    </section>
  );
}
