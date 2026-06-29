import {
  ChevronLeft,
  ChevronRight,
  FolderClock,
  LayoutGrid,
  List,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  Download,
} from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import ProductListRow from '../../components/card/ProductListRow';
import ProductCard from '../../components/card/ProductCard';
import PaymentModal from '../../components/modals/PaymentModal';
import DraftModal from '../../components/modals/DraftModal';
import CustomerModal from '../../components/modals/CustomerModal';

import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';

import { billingService } from '../../services/billingService';
import { categoryService } from '../../services/categoryService';
import { customerService } from '../../services/customerService';
import { productService } from '../../services/productService';
import { rewardService } from '../../services/rewardService';
import { storeService } from '../../services/storeService';

import { currency, formatDateTime } from '../../utils/helpers';
import { openBillingPrint, downloadBillingDocument } from '../../utils/print';
import { mergeStoreSettings } from '../../utils/storeSettings';

const SEARCH_DEBOUNCE_MS = 500;
const PRODUCT_CACHE_TTL_MS = 60_000;
const CATEGORY_CACHE_TTL_MS = 60_000;
const FALLBACK_PER_PAGE = 12;
const DEFAULT_VAT_RATE = 16;

const PRODUCT_GRID_GAP = 16;
const PRODUCT_CARD_ESTIMATED_HEIGHT = 255;
const PRODUCT_GRID_OVERSCAN_ROWS = 2;
const PRODUCT_VIEWPORT_MAX_HEIGHT = 'calc(100vh - 250px)';

const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL || '';

const extractList = (res) => {
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
};

const extractMeta = (res) => res?.meta || res?.data?.meta || {};

const getCategoryId = (category) =>
  category?.category_id ?? category?.id ?? category?.value ?? null;

const getCustomerId = (customer) => customer?.customer_id ?? customer?.id ?? null;

const getProductImage = (product) => {
  const rawPath =
    product?.image_url ||
    product?.product_image ||
    product?.photo_url ||
    product?.thumbnail ||
    product?.image ||
    product?.photo ||
    product?.media?.[0]?.url ||
    '';

  if (!rawPath) return '';
  if (rawPath.startsWith('http') || rawPath.startsWith('data:')) return rawPath;

  const cleanPath = rawPath.startsWith('/') ? rawPath.substring(1) : rawPath;
  return `${IMAGE_BASE_URL}${cleanPath}`;
};

const getItemTotal = (item) =>
  Number(
    item?.total_amount ??
      item?.line_total ??
      item?.line_subtotal ??
      Number(item?.quantity || 0) * Number(item?.unit_price || 0)
  );

const isTypingElement = (target) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || target.isContentEditable;
};

const isHotkeyBlockedElement = (target) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag) || target.isContentEditable;
};

const buildPageInfo = (meta, items, fallbackPage = 1) => {
  const currentPage = Number(meta?.current_page || fallbackPage);
  const lastPage = Number(meta?.last_page || 1);
  const total = Number(meta?.total || items.length);
  const perPage = Number(meta?.per_page || items.length || FALLBACK_PER_PAGE);
  const from = meta?.from ?? (items.length ? (currentPage - 1) * perPage + 1 : 0);
  const to = meta?.to ?? (items.length ? from + items.length - 1 : 0);

  return {
    currentPage,
    lastPage,
    hasNextPage: currentPage < lastPage,
    hasPrevPage: currentPage > 1,
    from,
    to,
    total,
    perPage,
  };
};

const emptyPageInfo = () => ({
  currentPage: 1,
  lastPage: 1,
  hasNextPage: false,
  hasPrevPage: false,
  from: 0,
  to: 0,
  total: 0,
  perPage: FALLBACK_PER_PAGE,
});

const calcLineFromGross = (qty, unitPrice, vatRate) => {
  const q = Number(qty || 0);
  const p = Number(unitPrice || 0);
  const v = Number(vatRate || 0);
  const totalAmount = +(q * p).toFixed(2);
  const lineSubtotal = +(totalAmount / (1 + v / 100)).toFixed(2);
  const vatAmount = +(totalAmount - lineSubtotal).toFixed(2);

  return {
    line_subtotal: lineSubtotal,
    vat_amount: vatAmount,
    total_amount: totalAmount,
  };
};

const recalcBillingTotals = (billing) => {
  if (!billing) return billing;

  const items = billing.items || [];
  const subtotal = items.reduce((sum, it) => sum + Number(it.line_subtotal || 0), 0);
  const vat_amount = items.reduce((sum, it) => sum + Number(it.vat_amount || 0), 0);
  const total = +(subtotal + vat_amount).toFixed(2);
  const grossTotal = items.reduce((sum, it) => sum + Number(it.total_amount || 0), 0);
  const blendedRate =
    subtotal > 0 ? +((vat_amount / subtotal) * 100).toFixed(2) : DEFAULT_VAT_RATE;

  return {
    ...billing,
    items,
    subtotal: +subtotal.toFixed(2),
    vat_amount: +vat_amount.toFixed(2),
    total: +Math.max(total, grossTotal).toFixed(2),
    vat_rate: billing.vat_rate || blendedRate,
  };
};

const buildLocalItem = (product, quantity = 1, overrides = {}) => {
  const unitPrice = Number((overrides.unit_price ?? overrides.unitPrice ?? product.price) || 0);
  const vatRate = Number(
    overrides.vat_rate ?? overrides.vatRate ?? product.vat_rate ?? DEFAULT_VAT_RATE
  );
  const totals = calcLineFromGross(quantity, unitPrice, vatRate);

  return {
    billing_item_id: `local-${product.product_id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`,
    product_id: product.product_id,
    product: {
      product_id: product.product_id,
      product_name: product.product_name,
      sku: product.sku,
      price: product.price,
      vat_rate: product.vat_rate,
    },
    quantity,
    unit_price: unitPrice,
    vat_rate: vatRate,
    ...totals,
    __local: true,
    ...overrides,
  };
};

const buildEmptyLocalBilling = () => ({
  billing_id: null,
  invnumber: null,
  is_draft: true,
  items: [],
  customer_id: null,
  notes: null,
  subtotal: 0,
  vat_amount: 0,
  total: 0,
  vat_rate: DEFAULT_VAT_RATE,
  __local: true,
});

const LS_PREFIX = 'pos.cart.v1';
const cartStorageKey = (storeId, userId) =>
  `${LS_PREFIX}::store_${storeId || 'na'}::user_${userId || 'na'}`;

const safeLoadCart = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const safeSaveCart = (key, payload) => {
  try {
    if (!payload || !payload.billing?.items?.length) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
};

const safeClearCart = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

const clonePersistedItems = (items = []) =>
  items.map((it) => ({
    billing_item_id: it.billing_item_id,
    product_id: it.product_id,
    product: it.product
      ? {
          product_id: it.product.product_id,
          product_name: it.product.product_name,
          sku: it.product.sku,
          price: it.product.price,
          vat_rate: it.product.vat_rate,
        }
      : null,
    quantity: Number(it.quantity || 0),
    unit_price: Number(it.unit_price || 0),
    vat_rate: Number(it.vat_rate ?? DEFAULT_VAT_RATE),
    line_subtotal: Number(it.line_subtotal || 0),
    vat_amount: Number(it.vat_amount || 0),
    total_amount: Number(it.total_amount || 0),
    __local: !!it.__local,
  }));

const buildPersistedCartSnapshot = ({ billing, selectedCustomerId, notes, storeId, userId }) => ({
  v: 1,
  savedAt: Date.now(),
  storeId: String(storeId || ''),
  userId: String(userId || ''),
  billing: billing
    ? {
        billing_id: billing.billing_id || null,
        invnumber: billing.invnumber || null,
        is_draft: billing.is_draft ?? true,
        status: billing.status || null,
        customer_id: billing.customer_id || null,
        notes: billing.notes || null,
        subtotal: Number(billing.subtotal || 0),
        vat_amount: Number(billing.vat_amount || 0),
        total: Number(billing.total || 0),
        vat_rate: Number(billing.vat_rate || DEFAULT_VAT_RATE),
        items: clonePersistedItems(billing.items || []),
      }
    : buildEmptyLocalBilling(),
  selectedCustomerId: selectedCustomerId || '',
  notes: notes || '',
});

function useDebouncedValue(value, delay) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const update = () => {
      setSize({
        width: el.clientWidth || 0,
        height: el.clientHeight || 0,
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => observer.disconnect();
  }, [ref]);

  return size;
}

function useScrollTop(ref) {
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    let rafId = 0;

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        setScrollTop(el.scrollTop || 0);
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [ref]);

  return scrollTop;
}

const MemoProductCard = memo(function MemoProductCard(props) {
  return <ProductCard {...props} />;
});

const VirtualizedProductGrid = memo(function VirtualizedProductGrid({
  products,
  productsLoading,
  resetKey,
  currentStore,
  submitting,
  onPayNow,
  onAddProduct,
  currencyFormatter,
  getProductImageFn,
  viewMode = 'grid',
}) {
  const viewportRef = useRef(null);
  const { width, height } = useElementSize(viewportRef);
  const scrollTop = useScrollTop(viewportRef);

  useEffect(() => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollTop = 0;
  }, [resetKey]);

  const virtualState = useMemo(() => {
    const safeWidth = Math.max(width, 400);
    const columns = 4;
    const columnWidth = (safeWidth - PRODUCT_GRID_GAP * (columns - 1)) / columns;
    const totalRows = Math.ceil(products.length / columns);
    const viewportHeight = Math.max(height || 640, PRODUCT_CARD_ESTIMATED_HEIGHT);
    const startRow = Math.max(
      0,
      Math.floor(scrollTop / PRODUCT_CARD_ESTIMATED_HEIGHT) - PRODUCT_GRID_OVERSCAN_ROWS
    );
    const endRow = Math.min(
      totalRows,
      Math.ceil((scrollTop + viewportHeight) / PRODUCT_CARD_ESTIMATED_HEIGHT) +
        PRODUCT_GRID_OVERSCAN_ROWS
    );

    const cells = [];
    for (let row = startRow; row < endRow; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const index = row * columns + col;
        if (index >= products.length) break;
        cells.push({
          index,
          item: products[index],
          style: {
            position: 'absolute',
            top: row * PRODUCT_CARD_ESTIMATED_HEIGHT,
            left: col * (columnWidth + PRODUCT_GRID_GAP),
            width: columnWidth,
            height: PRODUCT_CARD_ESTIMATED_HEIGHT - PRODUCT_GRID_GAP,
          },
        });
      }
    }

    const totalHeight = Math.max(totalRows * PRODUCT_CARD_ESTIMATED_HEIGHT - PRODUCT_GRID_GAP, 0);
    return { cells, totalHeight };
  }, [products, width, height, scrollTop]);

  if (viewMode === 'list') {
    return (
      <div
        ref={viewportRef}
        className="products-viewport"
        style={{
          overflowY: 'auto',
          maxHeight: PRODUCT_VIEWPORT_MAX_HEIGHT,
          minHeight: 360,
        }}
      >
        {!productsLoading && !products.length ? (
          <div className="card"><p>Empty.</p></div>
        ) : null}

        <div className="product-list">
          {products.map((item, index) => (
            <ProductListRow
              key={item.product_id ?? index}
              product={item}
              currentStore={currentStore}
              submitting={submitting}
              onPayNow={onPayNow}
              onAddProduct={onAddProduct}
              currency={currencyFormatter}
              getProductImage={getProductImageFn}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={viewportRef}
      className="products-viewport"
      style={{
        position: 'relative',
        overflowY: 'auto',
        overflowX: 'hidden',
        maxHeight: PRODUCT_VIEWPORT_MAX_HEIGHT,
        minHeight: 360,
        maskImage: 'linear-gradient(to bottom, transparent 0px, black 20px, black 100%)',
        WebkitMaskImage:
          'linear-gradient(to bottom, transparent 0px, black 20px, black 100%)',
      }}
    >
      {!productsLoading && !products.length ? (
        <div className="card"><p>Empty.</p></div>
      ) : null}

      {products.length ? (
        <div
          className="products-grid products-grid-enhanced"
          style={{
            position: 'relative',
            height: virtualState.totalHeight,
            minHeight: 1,
          }}
        >
          {virtualState.cells.map(({ item, index, style }) => (
            <div
              key={item.product_id ?? index}
              className="products-grid-virtual-cell"
              style={style}
            >
              <MemoProductCard
                product={item}
                currentStore={currentStore}
                submitting={submitting}
                onPayNow={onPayNow}
                onAddProduct={onAddProduct}
                currency={currencyFormatter}
                getProductImage={getProductImageFn}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});
const BillingItemsList = memo(function BillingItemsList({
  items,
  currentStore,
  onDecrease,
  onIncrease,
  onRemove,
}) {
  if (!items?.length) {
    return <p className="muted">Empty billing...hover over a product to add it.</p>;
  }

  return items.map((item) => (
    <div className="billing-item-row" key={item.billing_item_id}>
      <div className="billing-item-info">
        <strong className="product-name">{item.product?.product_name}</strong>
        <div className="vat-meta-wrapper">
          <span className="vat-badge">
            {item.vat_amount !== undefined && ` +${Number(item.vat_amount).toFixed(2)}`} (VAT)
          </span>
        </div>
      </div>

      <div className="billing-item-actions">
        <div className="quantity-control">
          <button type="button" className="icon-button" onClick={() => onDecrease(item)}>
            <Minus size={14} />
          </button>

          <span className="quantity-display">{item.quantity}</span>

          <button type="button" className="icon-button" onClick={() => onIncrease(item)}>
            <Plus size={14} />
          </button>
        </div>

        <strong className="line-total">
          {currency(getItemTotal(item), currentStore?.currency)}
        </strong>

        <button
          type="button"
          className="icon-button danger-icon"
          onClick={() => onRemove(item.billing_item_id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  ));
});

export default function CashierPosPage() {
  const { user, can } = useAuth();
  const { stores, storeId } = useStore();

  const canDraft = can('pos.draft');
  const canVoid = can('pos.void');

  const currentStore = useMemo(
    () => stores.find((store) => String(store.store_id) === String(storeId)),
    [stores, storeId]
  );

  const [printSettings, setPrintSettings] = useState(() => mergeStoreSettings());

  useEffect(() => {
    if (!currentStore?.store_id) return;
    let cancelled = false;

    storeService
      .getSettings(currentStore.store_id)
      .then((response) => {
        if (cancelled) return;
        const payload = response?.data?.data ?? response?.data ?? response ?? {};
        setPrintSettings(mergeStoreSettings(payload));
      })
      .catch(() => {
        if (!cancelled) setPrintSettings(mergeStoreSettings(currentStore));
      });

    return () => {
      cancelled = true;
    };
  }, [currentStore?.store_id]);

  const searchInputRef = useRef(null);
  const bootstrapProductsFetchedRef = useRef(false);
  const categoryCacheRef = useRef(new Map());
  const categoryRequestIdRef = useRef(0);
  const productCacheRef = useRef(new Map());
  const productRequestIdRef = useRef(0);
  const lastProductFilterRef = useRef('');
  const prefetchedKeysRef = useRef(new Set());
  const bootstrappedRef = useRef(false);

  const billingRef = useRef(null);
  const cartStorageKeyRef = useRef('');

  const productFiltersRef = useRef({
    storeId: '',
    activeCategoryId: null,
    scopeKey: 'all',
    search: '',
  });

  const loadStaticDataRef = useRef(null);
  const loadDraftsRef = useRef(null);
  const loadCustomersRef = useRef(null);
  const loadBillingDetailRef = useRef(null);
  const hotkeyContextRef = useRef(null);
  const draftServerSnapshotRef = useRef([]);


  const lastSyncedHeaderRef = useRef({
    customerId: null,
    notes: null,
    billingId: null,
  });

  const [categories, setCategories] = useState([]);
  const [categoryPageInfo, setCategoryPageInfo] = useState(emptyPageInfo());
  const [products, setProducts] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [customers, setCustomers] = useState([]);

  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const [draftSearch, setDraftSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [productPageInfo, setProductPageInfo] = useState(emptyPageInfo());

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [notes, setNotes] = useState('');
  const [billing, setBilling] = useState(null);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [loyaltyRule, setLoyaltyRule] = useState(null);
  const [chapa5ClaimedQty, setChapa5ClaimedQty] = useState(0);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [isBalanceSettlement, setIsBalanceSettlement] = useState(false);
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [catalogReady, setCatalogReady] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [categorySearch, setCategorySearch] = useState('');
  const [categorySearchOpen, setCategorySearchOpen] = useState(false);

  const debouncedCategorySearch = useDebouncedValue(categorySearch.trim(), 400);
  const visibleCategories = categories;
  const chapa5 = loyaltyRule?.chapa5 ?? null;

  const activeCategoryId = useMemo(() => {
    if (activeCategory === 'all') return null;
    const n = Number(activeCategory);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [activeCategory]);

  const effectiveCategoryScopeKey = useMemo(
    () => (activeCategoryId == null ? 'all' : `cat:${activeCategoryId}`),
    [activeCategoryId]
  );

  const currentFilterSignature = useMemo(
    () =>
      JSON.stringify({
        storeId: String(storeId || ''),
        categoryScope: effectiveCategoryScopeKey,
        search: debouncedSearch.toLowerCase(),
      }),
    [storeId, effectiveCategoryScopeKey, debouncedSearch]
  );

  const productViewportResetKey = useMemo(
    () => `${productPageInfo.currentPage}::${currentFilterSignature}`,
    [productPageInfo.currentPage, currentFilterSignature]
  );

  const canPrevCategory = categoryPageInfo.hasPrevPage;
  const canNextCategory = categoryPageInfo.hasNextPage;

  const itemCount = useMemo(
    () => billing?.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0,
    [billing?.items]
  );

  const chapa5Preview = useMemo(() => {
    if (!chapa5?.enabled || !billing?.items?.length) return null;

    const currentPunches = Number(chapa5.current_punches ?? chapa5.progress ?? 0);
    const buyCount = Number(chapa5.buy_count ?? 5);
    const freeCount = Number(chapa5.free_count ?? 1);

    const qualifyingQty = billing.items.reduce((sum, it) => {
      const sku = it.product?.sku || '';
      const unitPrice = Number(it.unit_price ?? 0);
      if (chapa5.product_sku && sku !== chapa5.product_sku) return sum;
      if (unitPrice <= 0) return sum;
      return sum + Number(it.quantity || 0);
    }, 0);

    const progressAfter = currentPunches + qualifyingQty;
    const previousCycles = Math.floor(currentPunches / buyCount);
    const newCycles = Math.floor(progressAfter / buyCount);
    const cyclesCompleted = Math.max(newCycles - previousCycles, 0);
    const freeItems = cyclesCompleted * freeCount;
    const unclaimedFreeItems = Math.max(freeItems - chapa5ClaimedQty, 0);
    const displayProgress = progressAfter % buyCount;

    return {
      enabled: true,
      label: chapa5.label || `Buy ${buyCount} Get ${freeCount} Free`,
      product_sku: chapa5.product_sku || null,
      buy_count: buyCount,
      free_count: freeCount,
      current_punches: currentPunches,
      qualifying_qty: qualifyingQty,
      progress_after: progressAfter,
      display_progress: displayProgress,
      qualifies: freeItems > 0,
      free_items: freeItems,
      claimable_free_items: unclaimedFreeItems,
      already_claimed: chapa5ClaimedQty,
    };
  }, [chapa5, billing?.items, chapa5ClaimedQty]);

  const filteredDrafts = useMemo(() => {
    const keyword = draftSearch.trim().toLowerCase();

    return drafts
      .filter((draft) => String(draft.billing_id) !== String(billing?.billing_id))
      .filter((draft) => {
        if (!keyword) return true;
        const haystack = [
          draft?.invnumber,
          `Draft #${draft?.billing_id || ''}`,
          draft?.customer?.full_name,
          draft?.customer?.phone,
          draft?.customer?.email,
          draft?.notes,
          String(draft?.total || ''),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(keyword);
      });
  }, [drafts, draftSearch, billing?.billing_id]);

  const customerCurrentBalance = useMemo(
    () =>
      Number(
        billing?.customer?.current_balance ??
          selectedCustomer?.current_balance ??
          selectedCustomer?.balance ??
          selectedCustomer?.opening_balance ??
          0
      ),
    [billing?.customer, selectedCustomer]
  );

  useEffect(() => {
    billingRef.current = billing;
  }, [billing]);

  useEffect(() => {
    cartStorageKeyRef.current = cartStorageKey(storeId, user?.user_id);
  }, [storeId, user?.user_id]);

  useEffect(() => {
    productFiltersRef.current = {
      storeId: String(storeId || ''),
      activeCategoryId,
      scopeKey: effectiveCategoryScopeKey,
      search: debouncedSearch,
    };
  }, [storeId, activeCategoryId, effectiveCategoryScopeKey, debouncedSearch]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  const focusSearchInput = useCallback((selectText = false) => {
    window.requestAnimationFrame(() => {
      const input = searchInputRef.current;
      if (!input) return;
      input.focus();
      if (selectText && typeof input.select === 'function') input.select();
    });
  }, []);

  const isOwnedByCurrentCashier = useCallback(
    (record) => {
      if (!user?.user_id) return true;
      const ownerId = record?.user_id || record?.user?.user_id || record?.user?.id;
      if (!ownerId) return true;
      return String(ownerId) === String(user.user_id);
    },
    [user]
  );

const resetSale = useCallback(() => {
  setBilling(null);
  setSelectedCustomerId('');
  setSelectedCustomer(null);
  setNotes('');
  setChapa5ClaimedQty(0);
  setShowPaymentModal(false);
  setShowCustomerModal(false);
  setIsBalanceSettlement(false);

  draftServerSnapshotRef.current = [];
  lastSyncedHeaderRef.current = { customerId: null, notes: null, billingId: null };
}, []);


  const resetProductState = useCallback(() => {
    setProducts([]);
    setCurrentPage(1);
    setProductPageInfo(emptyPageInfo());
    productCacheRef.current.clear();
    prefetchedKeysRef.current.clear();
    lastProductFilterRef.current = '';
  }, []);

  const resetCategoryState = useCallback(() => {
    setCategories([]);
    setCategoryPageInfo(emptyPageInfo());
    categoryCacheRef.current.clear();
  }, []);

  const mergeDraftPreview = useCallback((billingRecord) => {
    if (!billingRecord?.billing_id) return;
    setDrafts((prev) => {
      const withoutCurrent = prev.filter(
        (item) => String(item.billing_id) !== String(billingRecord.billing_id)
      );
      if (!billingRecord.is_draft) return withoutCurrent;
      return [billingRecord, ...withoutCurrent].sort(
        (a, b) => Number(b.billing_id || 0) - Number(a.billing_id || 0)
      );
    });
  }, []);

  const removeDraftPreview = useCallback((billingId) => {
    setDrafts((prev) => prev.filter((item) => String(item.billing_id) !== String(billingId)));
  }, []);

  const deleteBillingRecord = useCallback(async (billingId) => {
    if (typeof billingService.destroy === 'function') return billingService.destroy(billingId);
    if (typeof billingService.delete === 'function') return billingService.delete(billingId);
    if (typeof billingService.remove === 'function') return billingService.remove(billingId);
    throw new Error('Delete billing method is not implemented in billingService.');
  }, []);

  const buildCategoryCacheKey = useCallback(
    (page) =>
      JSON.stringify({
        storeId: String(storeId || ''),
        page: Number(page || 1),
      }),
    [storeId]
  );

  const loadCategoriesPage = useCallback(
    async (page = 1, { force = false, silent = false } = {}) => {
      if (!storeId) {
        setCategories([]);
        setCategoryPageInfo(emptyPageInfo());
        return { items: [], pageInfo: emptyPageInfo() };
      }

      const cacheKey = buildCategoryCacheKey(page);
      const cached = categoryCacheRef.current.get(cacheKey);
      const fresh = cached && Date.now() - cached.ts < CATEGORY_CACHE_TTL_MS;

      if (!force && cached) {
        setCategories(cached.items);
        setCategoryPageInfo(cached.pageInfo);
        if (fresh) return { items: cached.items, pageInfo: cached.pageInfo };
      }

      if (!silent) setCategoriesLoading(true);
      const requestId = ++categoryRequestIdRef.current;

      try {
        const response = await categoryService.list({
          store_id: Number(storeId),
          page,
        });

        if (requestId !== categoryRequestIdRef.current) {
          return { items: [], pageInfo: emptyPageInfo() };
        }

        const items = extractList(response);
        const meta = extractMeta(response);
        const pageInfo = buildPageInfo(meta, items, page);

        categoryCacheRef.current.set(cacheKey, { items, pageInfo, ts: Date.now() });
        setCategories(items);
        setCategoryPageInfo(pageInfo);
        return { items, pageInfo };
      } catch (err) {
        if (requestId === categoryRequestIdRef.current) {
          setCategories([]);
          setCategoryPageInfo(emptyPageInfo());
          if (!silent) {
            setError(err?.response?.data?.message || err?.message || 'Failed to load categories.');
          }
        }
        return { items: [], pageInfo: emptyPageInfo() };
      } finally {
        if (!silent && requestId === categoryRequestIdRef.current) {
          setCategoriesLoading(false);
        }
      }
    },
    [storeId, buildCategoryCacheKey]
  );

  useEffect(() => {
    if (!storeId || !bootstrappedRef.current) return;

    if (!debouncedCategorySearch) {
      loadCategoriesPage(1, { silent: true });
      return;
    }

    setCategoriesLoading(true);
    categoryService
      .list({
        store_id: Number(storeId),
        search: debouncedCategorySearch,
        per_page: 100,
      })
      .then((response) => {
        const items = extractList(response);
        setCategories(items);
        setCategoryPageInfo(emptyPageInfo());
      })
      .catch(() => {})
      .finally(() => setCategoriesLoading(false));
  }, [debouncedCategorySearch, storeId, loadCategoriesPage]);

  const loadStaticData = useCallback(async () => {
    if (!storeId) {
      return { categories: [], categoryPageInfo: emptyPageInfo() };
    }

    setCatalogLoading(true);
    setError('');

    try {
      const categoryResult = await loadCategoriesPage(1, { force: true, silent: true });
      return {
        categories: categoryResult.items,
        categoryPageInfo: categoryResult.pageInfo,
      };
    } catch (err) {
      console.error('POS catalog load failed:', err);
      setError(
        `Failed to load catalog: ${
          err?.response?.data?.message || err?.message || 'Network Error'
        }`
      );
      return { categories: [], categoryPageInfo: emptyPageInfo() };
    } finally {
      setCatalogLoading(false);
    }
  }, [storeId, loadCategoriesPage]);

  const buildCacheKey = useCallback(
    (
      page,
      categoryId = productFiltersRef.current.activeCategoryId,
      scopeKey = productFiltersRef.current.scopeKey,
      searchValue = productFiltersRef.current.search
    ) =>
      JSON.stringify({
        storeId: productFiltersRef.current.storeId,
        page: Number(page || 1),
        categoryScope: scopeKey,
        categoryId: categoryId ?? '',
        search: String(searchValue || '').trim().toLowerCase(),
      }),
    []
  );

  const fetchProductsPage = useCallback(
    async (page, categoryId = productFiltersRef.current.activeCategoryId) => {
      const { storeId: sid, search: searchTerm } = productFiltersRef.current;
      const params = {
        store_id: Number(sid),
        page,
        is_active: true,
      };

      if (categoryId != null) params.category_id = categoryId;
      const normalizedSearch = String(searchTerm || '').trim();
      if (normalizedSearch) params.search = normalizedSearch;

      const response = await productService.list(params);
      const meta = extractMeta(response);
      const items = extractList(response);
      const pageInfo = buildPageInfo(meta, items, page);
      return { items, pageInfo };
    },
    []
  );

  const loadProducts = useCallback(
    async (page = 1, { force = false } = {}) => {
      if (!storeId) return;

      const cacheKey = buildCacheKey(page);
      const cached = productCacheRef.current.get(cacheKey);
      const fresh = cached && Date.now() - cached.ts < PRODUCT_CACHE_TTL_MS;

      if (!force && cached) {
        setProducts(cached.items);
        setProductPageInfo(cached.pageInfo);
        if (fresh) return;
      }

      setProductsLoading(true);
      const requestId = ++productRequestIdRef.current;

      try {
        const { items, pageInfo } = await fetchProductsPage(page);
        if (requestId !== productRequestIdRef.current) return;

        productCacheRef.current.set(cacheKey, { items, pageInfo, ts: Date.now() });
        setProducts(items);
        setProductPageInfo(pageInfo);
      } catch (err) {
        if (requestId !== productRequestIdRef.current) return;
        setError(err?.response?.data?.message || err?.message || 'Failed to load products.');
        setProducts([]);
        setProductPageInfo(emptyPageInfo());
      } finally {
        if (requestId === productRequestIdRef.current) setProductsLoading(false);
      }
    },
    [storeId, buildCacheKey, fetchProductsPage]
  );

  const prefetchNextPage = useCallback(
    async (nextPage) => {
      if (!storeId || nextPage < 1) return;

      const key = buildCacheKey(nextPage);
      if (prefetchedKeysRef.current.has(key)) return;
      if (productCacheRef.current.has(key)) return;

      prefetchedKeysRef.current.add(key);
      try {
        const { items, pageInfo } = await fetchProductsPage(nextPage);
        productCacheRef.current.set(key, { items, pageInfo, ts: Date.now() });
      } catch {
        prefetchedKeysRef.current.delete(key);
      }
    },
    [storeId, buildCacheKey, fetchProductsPage]
  );

  const loadDrafts = useCallback(
    async ({ silent = false } = {}) => {
      if (!storeId) return;
      if (!silent) setDraftsLoading(true);

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Drafts request timeout after 10 seconds')), 10000)
        );

        const response = await Promise.race([
          billingService.list({ store_id: Number(storeId), is_draft: true }),
          timeoutPromise,
        ]);

        const data = extractList(response);
        const filtered = (Array.isArray(data) ? data : []).filter(isOwnedByCurrentCashier);
        setDrafts(filtered);
      } catch (err) {
        if (!silent) {
          setError(err?.response?.data?.message || err?.message || 'Failed to load drafts.');
        }
        setDrafts([]);
      } finally {
        if (!silent) setDraftsLoading(false);
      }
    },
    [storeId, isOwnedByCurrentCashier]
  );

  const loadCustomers = useCallback(
    async ({ silent = false } = {}) => {
      if (!storeId) {
        setCustomers([]);
        return;
      }
      if (!silent) setCustomersLoading(true);

      try {
        const response = await customerService.list({ store_id: Number(storeId) });
        const items = extractList(response);
        setCustomers(items);
      } catch (err) {
        if (!silent) {
          setError(err?.response?.data?.message || err?.message || 'Failed to load customers.');
        }
        setCustomers([]);
      } finally {
        if (!silent) setCustomersLoading(false);
      }
    },
    [storeId]
  );

const loadBillingDetail = useCallback(
  async (billingId, { silent = false } = {}) => {
    if (!billingId) return null;
    if (!silent) setBillingLoading(true);

    try {
      const response = await billingService.show(billingId);
      const detail = response?.data || response;

      const enriched = {
        ...detail,
        __local: false,
      };

      draftServerSnapshotRef.current = clonePersistedItems(detail?.items || []);
      lastSyncedHeaderRef.current = {
        billingId: detail?.billing_id || null,
        customerId: detail?.customer_id || null,
        notes: detail?.notes || null,
      };

      setBilling(enriched);
      setSelectedCustomerId(detail?.customer_id ? String(detail.customer_id) : '');
      setNotes(detail?.notes || '');
      mergeDraftPreview(detail);

      return enriched;
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load billing details.');
      throw err;
    } finally {
      if (!silent) setBillingLoading(false);
    }
  },
  [mergeDraftPreview]
);

const isServerBackedItem = (item) =>
  !!item?.billing_item_id &&
  !String(item.billing_item_id).startsWith('local-') &&
  !item?.__local;

const syncDraftItemsToServer = useCallback(
  async (billingId, localItems = []) => {
    if (!billingId) return null;

    const originalItems = Array.isArray(draftServerSnapshotRef.current)
      ? draftServerSnapshotRef.current
      : [];

    const originalServerItems = originalItems.filter(isServerBackedItem);
    const localServerItems = (localItems || []).filter(isServerBackedItem);
    const localNewItems = (localItems || []).filter(
      (item) =>
        !!item?.product_id &&
        (item?.__local || String(item?.billing_item_id || '').startsWith('local-'))
    );

    const originalById = new Map(
      originalServerItems.map((item) => [String(item.billing_item_id), item])
    );

    const localServerIds = new Set(
      localServerItems.map((item) => String(item.billing_item_id))
    );

    const removedCalls = originalServerItems
      .filter((item) => !localServerIds.has(String(item.billing_item_id)))
      .map((item) => billingService.removeItem(item.billing_item_id));

    const updatedCalls = localServerItems
      .filter((item) => {
        const original = originalById.get(String(item.billing_item_id));
        if (!original) return false;

        const qtyChanged =
          Number(original.quantity || 0) !== Number(item.quantity || 0);

        const priceChanged =
          Number(original.unit_price || 0).toFixed(2) !==
          Number(item.unit_price || 0).toFixed(2);

        return qtyChanged || priceChanged;
      })
      .map((item) =>
        billingService.updateItem(item.billing_item_id, {
          quantity: Number(item.quantity || 0),
          unit_price: Number(item.unit_price || 0),
        })
      );

    const createdCalls = localNewItems.map((item) =>
      billingService.addItem(billingId, {
        product_id: Number(item.product_id),
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
      })
    );

    await Promise.all([...removedCalls, ...updatedCalls, ...createdCalls]);

    const refreshed = await loadBillingDetail(billingId, { silent: true });
    draftServerSnapshotRef.current = clonePersistedItems(refreshed?.items || []);

    return refreshed;
  },
  [loadBillingDetail]
);

const persistDraftChanges = useCallback(async () => {
  const current = billingRef.current;
  if (!current?.billing_id) return null;

  await billingService.update(current.billing_id, {
    customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
    notes: notes || null,
  });

  lastSyncedHeaderRef.current = {
    billingId: current.billing_id,
    customerId: selectedCustomerId || null,
    notes: notes || null,
  };

  const refreshed = await syncDraftItemsToServer(current.billing_id, current.items || []);
  if (refreshed) mergeDraftPreview(refreshed);

  return refreshed;
}, [selectedCustomerId, notes, syncDraftItemsToServer, mergeDraftPreview]);


  loadStaticDataRef.current = loadStaticData;
  loadDraftsRef.current = loadDrafts;
  loadCustomersRef.current = loadCustomers;
  loadBillingDetailRef.current = loadBillingDetail;

  const clearPersistedCartSession = useCallback(() => {
    safeClearCart(cartStorageKeyRef.current);
  }, []);
  useEffect(() => {
    let cancelled = false;

    if (!selectedCustomerId) {
      setSelectedCustomer(null);
      return () => {
        cancelled = true;
      };
    }

    if (
      selectedCustomer &&
      String(getCustomerId(selectedCustomer)) === String(selectedCustomerId)
    ) {
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const response = await customerService.show(selectedCustomerId);
        if (cancelled) return;
        const detail = response?.data || response;
        setSelectedCustomer(detail || null);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load selected customer:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, selectedCustomer]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedCustomerId || !storeId) {
        setLoyaltyRule(null);
        return;
      }
      try {
        const data = await rewardService.customerLoyalty({
          store_id: Number(storeId),
          customer_id: Number(selectedCustomerId),
        });
        if (!cancelled) setLoyaltyRule(data || null);
      } catch {
        if (!cancelled) setLoyaltyRule(null);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedCustomerId, storeId]);

  useEffect(() => {
    if (activeCategory === 'all') return;

    const stillVisible = visibleCategories.some(
      (category) => String(getCategoryId(category)) === String(activeCategory)
    );

    if (!stillVisible) setActiveCategory('all');
  }, [visibleCategories, activeCategory]);

  useEffect(() => {
    const key = cartStorageKeyRef.current;
    if (!key) return;

    const snapshot = buildPersistedCartSnapshot({
      billing,
      selectedCustomerId,
      notes,
      storeId,
      userId: user?.user_id,
    });

    if (!snapshot?.billing?.items?.length) {
      safeClearCart(key);
      return;
    }

    safeSaveCart(key, snapshot);
  }, [billing, selectedCustomerId, notes, storeId, user?.user_id]);

  useEffect(() => {
    let cancelled = false;

    if (!storeId) return;

    const bootstrap = async () => {
      bootstrappedRef.current = false;
      bootstrapProductsFetchedRef.current = false;
      setCatalogReady(false);

      setError('');
      setSuccess('');
      setDrafts([]);
      setCustomers([]);
      setSearch('');
      setDraftSearch('');
      setActiveCategory('all');

      resetSale();
      resetProductState();
      resetCategoryState();

      try {
        setProductsLoading(true);

        await loadStaticDataRef.current();
        if (cancelled) return;

        const productsResponse = await productService.list({
          store_id: Number(storeId),
          page: 1,
          is_active: true,
        });
        if (cancelled) return;

        productFiltersRef.current = {
          storeId: String(storeId || ''),
          activeCategoryId: null,
          scopeKey: 'all',
          search: '',
        };

        const meta = extractMeta(productsResponse);
        const items = extractList(productsResponse);
        const pageInfo = buildPageInfo(meta, items, 1);

        const cacheKey = JSON.stringify({
          storeId: String(storeId),
          page: 1,
          categoryScope: 'all',
          categoryId: '',
          search: '',
        });

        productCacheRef.current.set(cacheKey, { items, pageInfo, ts: Date.now() });
        setProducts(items);
        setProductPageInfo(pageInfo);
        setCurrentPage(1);

        bootstrapProductsFetchedRef.current = true;
        lastProductFilterRef.current = JSON.stringify({
          storeId: String(storeId || ''),
          categoryScope: 'all',
          search: '',
        });

        await Promise.all([
          loadCustomersRef.current({ silent: true }),
          loadDraftsRef.current({ silent: true }),
        ]);
        if (cancelled) return;

        const key = cartStorageKey(storeId, user?.user_id);
        cartStorageKeyRef.current = key;

        const localSnapshot = safeLoadCart(key);
        if (localSnapshot?.billing?.items?.length) {
          setSelectedCustomerId(localSnapshot.selectedCustomerId || '');
          setNotes(localSnapshot.notes || '');

          const restored = recalcBillingTotals({
            ...buildEmptyLocalBilling(),
            ...localSnapshot.billing,
            billing_id: null,
            invnumber: null,
            __local: true,
            items: clonePersistedItems(localSnapshot.billing.items || []),
          });

          setBilling(restored);
        }

        bootstrappedRef.current = true;
        setCatalogReady(true);
      } catch (err) {
        if (!cancelled) {
          console.error('POS init failed:', err);
        }
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [storeId, user?.user_id, resetSale, resetProductState, resetCategoryState]);

  useEffect(() => {
    if (!storeId || !bootstrappedRef.current || !catalogReady) return;

    if (bootstrapProductsFetchedRef.current) {
      bootstrapProductsFetchedRef.current = false;
      lastProductFilterRef.current = currentFilterSignature;
      return;
    }

    const filtersChanged = lastProductFilterRef.current !== currentFilterSignature;

    if (!filtersChanged && currentPage === productPageInfo.currentPage) {
      return;
    }

    if (filtersChanged) {
      prefetchedKeysRef.current.clear();
      if (currentPage !== 1) {
        setCurrentPage(1);
        lastProductFilterRef.current = currentFilterSignature;
        return;
      }
      lastProductFilterRef.current = currentFilterSignature;
      void loadProducts(1);
      return;
    }

    void loadProducts(currentPage);
  }, [
    storeId,
    currentPage,
    currentFilterSignature,
    loadProducts,
    catalogReady,
    productPageInfo.currentPage,
  ]);

  useEffect(() => {
    if (!bootstrappedRef.current || !catalogReady) return;
    if (productsLoading) return;
    if (!productPageInfo.hasNextPage) return;
    if (bootstrapProductsFetchedRef.current) return;

    void prefetchNextPage(productPageInfo.currentPage + 1);
  }, [
    productPageInfo.currentPage,
    productPageInfo.hasNextPage,
    prefetchNextPage,
    productsLoading,
    catalogReady,
  ]);

  const applyBillingMutation = useCallback((mutator) => {
    setBilling((prev) => {
      const base = prev || buildEmptyLocalBilling();
      const draft = { ...base, items: [...(base.items || [])] };
      const result = mutator(draft) || draft;
      return recalcBillingTotals(result);
    });
  }, []);

  const removeItem = useCallback(
    (billingItemId) => {
      if (!billingItemId) return;
      setError('');

      applyBillingMutation((draft) => {
        draft.items = draft.items.filter(
          (it) => String(it.billing_item_id) !== String(billingItemId)
        );
        return draft;
      });
    },
    [applyBillingMutation]
  );

  const updateItemQuantity = useCallback(
    (item, nextQuantity) => {
      if (!item) return;
      if (nextQuantity < 1) return removeItem(item.billing_item_id);

      const targetId = item.billing_item_id;
      setError('');

      applyBillingMutation((draft) => {
        const target = draft.items.find(
          (it) => String(it.billing_item_id) === String(targetId)
        );
        if (!target) return draft;

        const totals = calcLineFromGross(
          nextQuantity,
          target.unit_price,
          target.vat_rate ?? DEFAULT_VAT_RATE
        );

        Object.assign(target, {
          quantity: nextQuantity,
          ...totals,
        });

        return draft;
      });
    },
    [applyBillingMutation, removeItem]
  );

  useEffect(() => {
    if (!chapa5Preview) return;
    const maxFree = chapa5Preview.free_items;
    if (chapa5ClaimedQty <= maxFree) return;

    const excessFree = chapa5ClaimedQty - maxFree;
    setChapa5ClaimedQty(maxFree);

    const freeItem = billingRef.current?.items?.find(
      (it) =>
        Number(it.unit_price) <= 0 &&
        it.product?.sku?.toLowerCase() === chapa5Preview.product_sku?.toLowerCase()
    );
    if (!freeItem) return;

    const newQty = Number(freeItem.quantity) - excessFree;
    updateItemQuantity(freeItem, newQty);
  }, [chapa5Preview, chapa5ClaimedQty, updateItemQuantity]);

  const handleAddProduct = useCallback(
    (product) => {
      if (!product?.product_id) return;
      setError('');

      applyBillingMutation((draft) => {
        const existing = draft.items.find(
          (it) => String(it.product_id) === String(product.product_id)
        );

        if (existing) {
          const newQty = Number(existing.quantity || 0) + 1;
          const totals = calcLineFromGross(
            newQty,
            existing.unit_price,
            existing.vat_rate ?? product.vat_rate ?? DEFAULT_VAT_RATE
          );

          Object.assign(existing, {
            quantity: newQty,
            ...totals,
          });
        } else {
          draft.items.push(buildLocalItem(product, 1));
        }

        return draft;
      });
    },
    [applyBillingMutation]
  );

  const handlePayNow = useCallback(
    (product) => {
      handleAddProduct(product);
      window.requestAnimationFrame(() => setShowPaymentModal(true));
    },
    [handleAddProduct]
  );

  const handleIncreaseItem = useCallback(
    (item) => updateItemQuantity(item, Number(item.quantity) + 1),
    [updateItemQuantity]
  );

  const handleDecreaseItem = useCallback(
    (item) => updateItemQuantity(item, Number(item.quantity) - 1),
    [updateItemQuantity]
  );

  const promoteLocalCartToServerDraft = useCallback(async () => {
    const current = billingRef.current;
    if (!current?.items?.length) return null;
    if (current.billing_id) return current;

    const createdRes = await billingService.createDraft({
      store_id: Number(storeId),
      customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
      notes: notes || null,
    });

    const created = createdRes?.data || createdRes;
    const newId = created.billing_id;

    await Promise.all(
      (current.items || []).map((it) =>
        billingService.addItem(newId, {
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
        })
      )
    );

    const detail = await loadBillingDetail(newId, { silent: true });
    return detail || created;
  }, [storeId, selectedCustomerId, notes, loadBillingDetail]);

  const persistDraftHeader = useCallback(async () => {
    const current = billingRef.current;
    if (!current?.billing_id) return null;

    const last = lastSyncedHeaderRef.current;
    const headerUnchanged =
      last.billingId === current.billing_id &&
      last.customerId === (selectedCustomerId || null) &&
      last.notes === (notes || null);

    if (headerUnchanged) return current;

    await billingService.update(current.billing_id, {
      customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
      notes: notes || null,
    });

    lastSyncedHeaderRef.current = {
      billingId: current.billing_id,
      customerId: selectedCustomerId || null,
      notes: notes || null,
    };

    const updatedBilling = await loadBillingDetail(current.billing_id, { silent: true });
    mergeDraftPreview(updatedBilling);
    return updatedBilling;
  }, [selectedCustomerId, notes, loadBillingDetail, mergeDraftPreview]);

const handleSaveOrUpdateDraft = useCallback(async () => {
  const current = billingRef.current;
  if (!current?.items?.length) return;

  setError('');
  setSuccess('');
  setSubmitting(true);

  try {
    let finalBilling;

    if (!current.billing_id) {
      finalBilling = await promoteLocalCartToServerDraft();
    } else {
      finalBilling = await persistDraftChanges();
    }

    if (finalBilling) {
      mergeDraftPreview(finalBilling);
    }

    setSuccess(
      finalBilling?.billing_id
        ? `Draft #${finalBilling.billing_id} saved successfully.`
        : 'Draft saved successfully.'
    );

    resetSale();
    clearPersistedCartSession();
    void loadDrafts({ silent: true });
  } catch (err) {
    setError(err?.response?.data?.message || err?.message || 'Unable to save draft.');
  } finally {
    setSubmitting(false);
  }
}, [
  mergeDraftPreview,
  persistDraftChanges,
  promoteLocalCartToServerDraft,
  resetSale,
  clearPersistedCartSession,
  loadDrafts,
]);

  const handleProceedToPayment = useCallback(() => {
    setError('');
    setIsPreparingPayment(false);
    setShowPaymentModal(true);
  }, []);

const handleCharge = useCallback(
  async (paymentDetails) => {
    const current = billingRef.current;

    if (!current?.items?.length && !isBalanceSettlement) return;

    if (current?.status === 'paid') {
      setShowPaymentModal(false);
      return;
    }

    setSubmitting(true);
    setSuccess('');
    setError('');

    try {
      let paidBilling = null;

      const paymentPayload = {
        payment_method: paymentDetails.paymentMethod,
        amount_received: paymentDetails.amountReceived,
        amount_tendered: paymentDetails.amountTendered,
        points_redeemed: paymentDetails.pointsToRedeem,
        mpesa_phone: paymentDetails.mpesaPhone,
        mpesa_code: paymentDetails.mpesaCode,
        card_reference: paymentDetails.cardReference,
        card_holder: paymentDetails.cardHolder,
      };

      // 1. Existing balance settlement
      if (isBalanceSettlement && current?.billing_id) {
        await billingService.chargeExisting(current.billing_id, paymentPayload);

        const paidResponse = await billingService.show(current.billing_id);
        paidBilling = paidResponse?.data || paidResponse;
      }
      // 2. Loaded server draft -> sync draft first, then charge existing billing
      else if (current?.billing_id) {
        await persistDraftChanges();
        await billingService.chargeExisting(current.billing_id, paymentPayload);

        const paidResponse = await billingService.show(current.billing_id);
        paidBilling = paidResponse?.data || paidResponse;
      }
      // 3. Pure local cart -> atomic one-shot checkout
      else {
        const payload = {
          store_id: Number(storeId),
          customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
          notes: notes || null,
          items: (current.items || []).map((item) => ({
            product_id: Number(item.product_id),
            quantity: Number(item.quantity || 0),
            price: Number(item.unit_price || 0),
            vat_rate: Number(item.vat_rate ?? DEFAULT_VAT_RATE),
          })),
          payment: {
            method: paymentDetails.paymentMethod,
            amount_received: paymentDetails.amountReceived,
            amount_tendered: paymentDetails.amountTendered,
            points_redeemed: paymentDetails.pointsToRedeem,
            mpesa_phone: paymentDetails.mpesaPhone,
            mpesa_code: paymentDetails.mpesaCode,
            card_reference: paymentDetails.cardReference,
            card_holder: paymentDetails.cardHolder,
          },
        };

        const response = await billingService.charge(payload);

        paidBilling =
          response?.data?.billing ||
          response?.billing ||
          response?.data?.invoice ||
          response?.invoice ||
          null;
      }

      if (!paidBilling) {
        throw new Error('Paid billing response was not returned by server.');
      }

      const printMode =
        Number(paidBilling?.balance_due || 0) <= 0 ? 'receipt' : 'invoice';

      openBillingPrint(
        { ...paidBilling, store: paidBilling.store || currentStore },
        currentStore,
        printMode,
        printSettings
      );

      if (paidBilling?.billing_id) {
        removeDraftPreview(paidBilling.billing_id);
      }

      resetSale();
      clearPersistedCartSession();
      setPointsToRedeem(0);
      setShowPaymentModal(false);
      setIsBalanceSettlement(false);
      setSuccess('Payment processed successfully.');
      focusSearchInput(true);

      void loadDrafts({ silent: true });
    } catch (err) {
      throw new Error(
        err?.response?.data?.message || err?.message || 'Unable to process payment.'
      );
    } finally {
      setSubmitting(false);
    }
  },
  [
    clearPersistedCartSession,
    currentStore,
    focusSearchInput,
    isBalanceSettlement,
    notes,
    persistDraftChanges,
    printSettings,
    removeDraftPreview,
    resetSale,
    selectedCustomerId,
    storeId,
    loadDrafts,
  ]
);

  const handleLoadDraft = useCallback(
    async (draftId) => {
      setError('');
      setSubmitting(true);

      try {
        safeClearCart(cartStorageKeyRef.current);
        await loadBillingDetail(draftId);
        setShowDraftModal(false);
        setShowPaymentModal(false);
        focusSearchInput(true);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Unable to load draft.');
      } finally {
        setSubmitting(false);
      }
    },
    [focusSearchInput, loadBillingDetail]
  );

  const handleDeleteDraft = useCallback(
    async (draftId) => {
      const confirmed = window.confirm('Move this draft to trash?');
      if (!confirmed) return;

      setError('');
      setSubmitting(true);

      try {
        await deleteBillingRecord(draftId);
        const current = billingRef.current;
        if (String(current?.billing_id) === String(draftId)) {
          resetSale();
          clearPersistedCartSession();
        }
        removeDraftPreview(draftId);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Unable to delete draft.');
      } finally {
        setSubmitting(false);
      }
    },
    [deleteBillingRecord, removeDraftPreview, resetSale, clearPersistedCartSession]
  );

  const handleSettleBalance = useCallback(async () => {
    if (!selectedCustomerId) return;

    setError('');
    setSubmitting(true);

    try {
      const response = await billingService.list({
        store_id: Number(storeId),
        customer_id: Number(selectedCustomerId),
        status: 'partial',
        is_draft: false,
        per_page: 50,
      });

      const billings = extractList(response);
      if (!billings.length) {
        setError('No outstanding balance found for this customer.');
        return;
      }

      const target = billings[billings.length - 1];
      const detail = await billingService.show(target.billing_id);
      const fetched = detail?.data || detail;
      const balanceDue = Number(fetched.balance_due || 0);

      setBilling({
        ...fetched,
        items: [],
        total: balanceDue,
        subtotal: balanceDue,
        vat_amount: 0,
        paid_amount: 0,
        balance_due: balanceDue,
      });

      setIsBalanceSettlement(true);
      setShowPaymentModal(true);
    } catch (err) {
      setError(
        err?.response?.data?.message || err?.message || 'Unable to load outstanding balance.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [selectedCustomerId, storeId]);

  const handleCustomerSelect = useCallback((customerId, customerObject = null) => {
    setSelectedCustomerId(customerId);
    if (customerObject) {
      setSelectedCustomer(customerObject);
    } else {
      setSelectedCustomer(null);
    }
    setShowCustomerModal(false);
  }, []);

  const handleEscapeShortcut = useCallback(async () => {
    if (submitting) return;

    if (showPaymentModal) {
      setShowPaymentModal(false);
      focusSearchInput(true);
      return;
    }
    if (showDraftModal) {
      setShowDraftModal(false);
      focusSearchInput(true);
      return;
    }
    if (showCustomerModal) {
      setShowCustomerModal(false);
      focusSearchInput(true);
      return;
    }

    const current = billingRef.current;
    if (!current?.billing_id && !current?.items?.length && !search) {
      focusSearchInput(true);
      return;
    }

    const confirmed = window.confirm('Cancel the current sale and clear the active cart?');
    if (!confirmed) return;

    setError('');
    setSubmitting(true);

    try {
      if (current?.billing_id && current?.is_draft) {
        await deleteBillingRecord(current.billing_id);
        removeDraftPreview(current.billing_id);
      }
      resetSale();
      clearPersistedCartSession();
      setSearch('');
      focusSearchInput(true);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to cancel current sale.');
    } finally {
      setSubmitting(false);
    }
  }, [
    deleteBillingRecord,
    focusSearchInput,
    removeDraftPreview,
    resetSale,
    clearPersistedCartSession,
    search,
    showCustomerModal,
    showDraftModal,
    showPaymentModal,
    submitting,
  ]);

  const handleClaimChapa5Reward = useCallback(async () => {
    if (!chapa5Preview?.claimable_free_items || !chapa5Preview?.product_sku) return;

    const itemsToAdd = chapa5Preview.claimable_free_items;
    setError('');

    const freeProduct = products.find(
      (p) => p.sku?.toLowerCase() === chapa5Preview.product_sku?.toLowerCase()
    );
    if (!freeProduct) {
      setError('Free item product not found in catalog.');
      return;
    }

    setChapa5ClaimedQty((prev) => prev + itemsToAdd);

    applyBillingMutation((draft) => {
      const existing = draft.items.find(
        (it) =>
          String(it.product_id) === String(freeProduct.product_id) && Number(it.unit_price) <= 0
      );

      if (existing) {
        const newQty = Number(existing.quantity || 0) + itemsToAdd;
        const totals = calcLineFromGross(newQty, 0, existing.vat_rate ?? DEFAULT_VAT_RATE);
        Object.assign(existing, { quantity: newQty, ...totals });
      } else {
        const local = buildLocalItem(freeProduct, itemsToAdd, { unit_price: 0 });
        draft.items.push(local);
      }
      return draft;
    });

    const current = billingRef.current;
    if (!current?.billing_id) return;

    setSubmitting(true);
    try {
      await billingService.addItem(current.billing_id, {
        product_id: freeProduct.product_id,
        quantity: itemsToAdd,
        unit_price: 0,
      });
      await loadBillingDetail(current.billing_id, { silent: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to add free item.');
    } finally {
      setSubmitting(false);
    }
  }, [chapa5Preview, products, applyBillingMutation, loadBillingDetail]);

  hotkeyContextRef.current = {
    submitting,
    showPaymentModal,
    showDraftModal,
    showCustomerModal,
    canDraft,
    handleSaveOrUpdateDraft,
    handleEscapeShortcut,
    handleProceedToPayment,
  };

  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      const ctx = hotkeyContextRef.current;
      const blockedTarget = isHotkeyBlockedElement(event.target);
      const typingTarget = isTypingElement(event.target);

      if (event.key === 'F2') {
        event.preventDefault();
        focusSearchInput(true);
        return;
      }

      if (event.key === 'F8') {
        event.preventDefault();
        if (!ctx.submitting && billingRef.current?.items?.length && ctx.canDraft) {
          void ctx.handleSaveOrUpdateDraft();
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        void ctx.handleEscapeShortcut();
        return;
      }

      const wantsCheckout =
        (event.code === 'Space' || event.key === ' ' || event.key === 'Enter') &&
        !blockedTarget &&
        !typingTarget &&
        !ctx.showPaymentModal &&
        !ctx.showDraftModal &&
        !ctx.showCustomerModal;

      if (wantsCheckout && !ctx.submitting && billingRef.current?.items?.length) {
        event.preventDefault();
        void ctx.handleProceedToPayment();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [focusSearchInput]);

  const goToPreviousPage = useCallback(() => {
    if (productsLoading) return;
    const prevPage = productPageInfo.currentPage - 1;
    if (prevPage < 1) return;
    setCurrentPage(prevPage);
  }, [productPageInfo.currentPage, productsLoading]);

  const goToNextPage = useCallback(() => {
    if (productsLoading) return;
    const nextPage = productPageInfo.currentPage + 1;
    if (nextPage > productPageInfo.lastPage) return;
    setCurrentPage(nextPage);
  }, [productPageInfo.currentPage, productPageInfo.lastPage, productsLoading]);

  const goToPrevCategoryPage = useCallback(async () => {
    if (!canPrevCategory || categoriesLoading) return;
    await loadCategoriesPage(categoryPageInfo.currentPage - 1);
  }, [canPrevCategory, categoriesLoading, loadCategoriesPage, categoryPageInfo.currentPage]);

  const goToNextCategoryPage = useCallback(async () => {
    if (!canNextCategory || categoriesLoading) return;
    await loadCategoriesPage(categoryPageInfo.currentPage + 1);
  }, [canNextCategory, categoriesLoading, loadCategoriesPage, categoryPageInfo.currentPage]);

  if (!stores.length) {
    return (
      <section className="pos-grid cashier-pos-page">
        <div className="pos-catalog stack-lg">
          <div className="card hero-card compact-hero">
            <div>
              <span className="eyebrow">Cashier</span>
              <h2>Fortune Supermarket</h2>
            </div>
          </div>
          <div className="card">
            <p><strong>No stores assigned</strong></p>
            <p className="muted" style={{ marginTop: 8 }}>
              Your account does not have any store assigned. Please contact your administrator.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="pos-grid cashier-pos-page">
        <div className="pos-catalog stack-lg">
          <div className="card hero-card compact-hero">
            <div className="store-header-layout">
              <div className="store-brand-identity">
                <span className="eyebrow">{user?.role || currentStore?.role || 'Cashier'}</span>
                <h2 className="store-title">{currentStore?.store_name || 'Fortune Supermarket'}</h2>
              </div>
              <div className="store-contact-meta">
                <span className="meta-location">{currentStore?.location || 'Store Location'}</span>
                <p className="meta-address">
                  {currentStore?.physical_address || 'Physical address not available'}
                </p>
                <p className="meta-communication">
                  {currentStore?.telephone || 'Telephone not available'}
                  {currentStore?.email_address && <span className="meta-divider">|</span>}
                  {currentStore?.email_address || ''}
                </p>
              </div>
            </div>
          </div>

          <div className="toolbar-row pos-toolbar-wrap">
            <div className="search-shell">
              <Search className="search-icon-pos" size={16} />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name or SKU"
              />
              {search && (
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  style={{
                    width: 28,
                    height: 28,
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--muted)',
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              )}
            </div>

            <div className="view-toggle">
              <button
                type="button"
                className={`icon-button ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                className={`icon-button ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <List size={16} />
              </button>
            </div>

            <div className="chips-row" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {!categorySearch && (
                <button
                  type="button"
                  className="chip chip-nav"
                  onClick={goToPrevCategoryPage}
                  disabled={!canPrevCategory || categoriesLoading}
                  aria-label="Previous categories"
                  title="Previous categories"
                  style={{ padding: '6px 8px' }}
                >
                  <ChevronLeft size={14} />
                </button>
              )}

              <button
                type="button"
                className={`chip ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                All
              </button>

              {visibleCategories.map((category) => {
                const categoryId = getCategoryId(category);
                if (categoryId == null) return null;

                return (
                  <button
                    key={String(categoryId)}
                    type="button"
                    className={`chip ${String(activeCategory) === String(categoryId) ? 'active' : ''}`}
                    onClick={() => setActiveCategory(categoryId)}
                  >
                    {category.category_name}
                  </button>
                );
              })}

              {!categorySearch && (
                <button
                  type="button"
                  className="chip chip-nav"
                  onClick={goToNextCategoryPage}
                  disabled={!canNextCategory || categoriesLoading}
                  aria-label="Next categories"
                  title="Next categories"
                  style={{ padding: '6px 8px' }}
                >
                  <ChevronRight size={14} />
                </button>
              )}

              <div className="category-search-wrap">
                <button
                  type="button"
                  className={`icon-button category-search-toggle ${categorySearch ? 'active' : ''}`}
                  onClick={() => {
                    if (categorySearch) {
                      setCategorySearch('');
                    } else {
                      window.requestAnimationFrame(() => {
                        document.getElementById('category-search-input')?.focus();
                      });
                    }
                    setCategorySearchOpen((prev) => !prev);
                  }}
                  title="Search categories"
                >
                  <Search size={15} />
                </button>

                {categorySearchOpen && (
                  <div className="category-search-popout">
                    <input
                      id="category-search-input"
                      type="text"
                      className="category-search-input"
                      placeholder="Filter categories…"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setCategorySearch('');
                          setCategorySearchOpen(false);
                        }
                      }}
                    />
                    {categorySearch && (
                      <button
                        type="button"
                        className="category-search-clear"
                        onClick={() => setCategorySearch('')}
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {catalogLoading ? (
            <div className="page-loader">
              <div className="pos-spinner-wrap">
                <div className="spinner" />
                <span className="pos-spinner-label">Loading...</span>
              </div>
            </div>
          ) : (
            <>
              {error ? <div className="form-error">{error}</div> : null}
              {success ? <div className="form-success">{success}</div> : null}

              <VirtualizedProductGrid
                products={products}
                productsLoading={productsLoading}
                resetKey={productViewportResetKey}
                currentStore={currentStore}
                submitting={submitting}
                onPayNow={handlePayNow}
                onAddProduct={handleAddProduct}
                currencyFormatter={currency}
                getProductImageFn={getProductImage}
                viewMode={viewMode}
              />

              {products.length > 0 ? (
                <div className="pagination-bar">
                  <div className="pagination-summary">
                    Showing <strong>{productPageInfo.from}</strong> - <strong>{productPageInfo.to}</strong>{' '}
                    of <strong>{productPageInfo.total}</strong> products
                    <span style={{ marginLeft: 8, opacity: 0.7 }}>
                      ({productPageInfo.perPage} per page)
                    </span>
                  </div>

                  <div className="pagination-controls">
                    <button
                      type="button"
                      className="ghost-button pagination-btn"
                      onClick={goToPreviousPage}
                      disabled={productPageInfo.currentPage <= 1 || productsLoading}
                    >
                      Previous
                    </button>

                    <span className="pagination-page-indicator">
                      Page <strong>{productPageInfo.currentPage}</strong> of{' '}
                      <strong>{productPageInfo.lastPage}</strong>
                    </span>

                    <button
                      type="button"
                      className="ghost-button pagination-btn"
                      onClick={goToNextPage}
                      disabled={
                        productPageInfo.currentPage >= productPageInfo.lastPage || productsLoading
                      }
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="billing-panel stack-md">
          <div className="card billing-sidebar-card">
            <div className="card-header">
              <div>
                <h3>Current billing</h3>
                <p className="invoice-subtext">
                  {billing
                    ? billing.invnumber ||
                      (billing.billing_id ? `Draft #${billing.billing_id}` : 'In-progress cart')
                    : 'No active billing yet'}
                </p>
              </div>
              <div className="cart-badge">
                <ShoppingCart size={16} />
                <span>{itemCount} items</span>
              </div>
            </div>

            <div className="customer-billing-section">
              {selectedCustomerId ? (
                <div className="selected-customer-box">
                  <div className="customer-meta">
                    <span className="meta-label">Customer</span>
                    <strong>{selectedCustomer?.full_name || 'Loading...'}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="change-customer-btn"
                      onClick={() => setShowCustomerModal(true)}
                    >
                      Change
                    </button>

                    {canDraft && (
                      <button
                        type="button"
                        className="ghost-button view-drafts-btn"
                        onClick={async () => {
                          setShowDraftModal(true);
                          await loadDrafts();
                        }}
                      >
                        <FolderClock size={16} />
                        Drafts ({drafts.length})
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="selected-customer-box">
                  <div className="customer-meta">
                    <span className="meta-label">Customer</span>
                    <strong>Customer</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="change-customer-btn"
                      onClick={() => setShowCustomerModal(true)}
                    >
                      Select Customer
                    </button>

                    {canDraft && (
                      <button
                        type="button"
                        className="ghost-button view-drafts-btn"
                        onClick={async () => {
                          setShowDraftModal(true);
                          await loadDrafts();
                        }}
                      >
                        <FolderClock size={16} />
                        Drafts ({drafts.length})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {draftsLoading && <span className="inline-note-spinner">Refreshing drafts...</span>}
            </div>
          </div>

          <div className="card">
            <div
              className="card-header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <h3>Billing items</h3>
                {billingLoading ? <p>Refreshing billing...</p> : null}
              </div>

              <div
                className="header-action-icons-row"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                {canDraft && (
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!billing?.items?.length || submitting}
                    onClick={handleSaveOrUpdateDraft}
                    title={billing?.billing_id ? 'Update Draft' : 'Save Draft'}
                    style={{ padding: '6px', minWidth: 'auto' }}
                  >
                    <FolderClock size={16} />
                  </button>
                )}

                <button
                  type="button"
                  className="ghost-button"
                  onClick={async () => {
                    if (!billing) return;
                    setSubmitting(true);
                    setError('');
                    try {
                      let billToPrint = billing;
                      if (!billing.billing_id) {
                        billToPrint = await promoteLocalCartToServerDraft();
                      } else {
                        billToPrint = (await persistDraftHeader()) || billing;
                      }

                      if (billToPrint) {
                        openBillingPrint(
                          { ...billToPrint, store: billToPrint.store || currentStore },
                          currentStore,
                          'invoice',
                          printSettings
                        );
                      }
                    } catch (err) {
                      setError(err?.response?.data?.message || err?.message || 'Unable to print.');
                    } finally {
                      setSubmitting(false);
                    }
                  }}
                  disabled={!billing || submitting}
                  title="Print"
                  style={{ padding: '6px', minWidth: 'auto' }}
                >
                  <Printer size={16} />
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    billing && downloadBillingDocument({ ...billing, store: currentStore }, 'invoice')
                  }
                  disabled={!billing}
                  title="Download"
                  style={{ padding: '6px', minWidth: 'auto' }}
                >
                  <Download size={16} />
                </button>

                {canVoid && (
                  <button
                    type="button"
                    className="ghost-button danger"
                    disabled={!billing?.items?.length || submitting}
                    onClick={handleEscapeShortcut}
                    title="Void Sale"
                    style={{ padding: '6px', minWidth: 'auto' }}
                  >
                    Void
                  </button>
                )}
              </div>
            </div>

            <div className="billing-items-list">
              <BillingItemsList
                items={billing?.items}
                currentStore={currentStore}
                onDecrease={handleDecreaseItem}
                onIncrease={handleIncreaseItem}
                onRemove={removeItem}
              />
            </div>

            {chapa5Preview?.enabled && selectedCustomerId && (
              <div className={`chapa5-reward-banner ${chapa5Preview.qualifies ? 'qualifies' : ''}`}>
                {chapa5Preview.claimable_free_items > 0 && (
                  <button
                    type="button"
                    className="primary-button chapa5-claim-btn"
                    onClick={handleClaimChapa5Reward}
                    disabled={submitting}
                  >
                    Redeem {chapa5Preview.claimable_free_items} reward
                  </button>
                )}
              </div>
            )}

            <div className="billing-summary-container">
              <div className="billing-summary-list">
                <div className="summary-row">
                  <span className="summary-label">Net Amount</span>
                  <span className="summary-value">
                    {currency(billing?.subtotal || 0, currentStore?.currency)}
                  </span>
                </div>

                <div className="summary-row">
                  <span className="summary-label">
                    VAT ({Number(billing?.vat_rate || DEFAULT_VAT_RATE)}%)
                  </span>
                  <span className="summary-value">
                    {currency(billing?.vat_amount || 0, currentStore?.currency)}
                  </span>
                </div>

                <div className="summary-divider" />

                <div className="summary-row total-accent-row">
                  <span className="total-label">Total Amount</span>
                  <strong className="total-value">
                    {currency(billing?.total || 0, currentStore?.currency)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="billing-bottom-actions">
              {billing?.items?.length ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={submitting}
                  onClick={handleProceedToPayment}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Proceed to Payment
                </button>
              ) : selectedCustomerId && Number(selectedCustomer?.current_balance ?? 0) > 0 ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={submitting}
                  onClick={handleSettleBalance}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    background: 'var(--hero-teal-1)',
                  }}
                >
                  Settle Balance ({currency(selectedCustomer.current_balance, currentStore?.currency)})
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  disabled
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  Proceed to Payment
                </button>
              )}
            </div>
          </div>
        </aside>
      </section>

      <PaymentModal
        isOpen={showPaymentModal}
        billing={billing}
        currentStore={currentStore}
        itemCount={itemCount}
        selectedCustomer={selectedCustomer}
        customerCurrentBalance={customerCurrentBalance}
        submitting={submitting}
        currency={currency}
        onClose={() => {
          setShowPaymentModal(false);
          setIsBalanceSettlement(false);
        }}
        onCharge={handleCharge}
        loyaltyPoints={loyaltyRule?.loyalty_points ?? 0}
        loyaltyPointValue={loyaltyRule?.active_rule?.point_value ?? 1}
        pointsToRedeem={pointsToRedeem}
        setPointsToRedeem={setPointsToRedeem}
        chapa5Preview={chapa5Preview}
        onClaimChapa5Reward={handleClaimChapa5Reward}
        loyaltyMinPoints={loyaltyRule?.active_rule?.min_points ?? 0}
        isBalanceSettlement={isBalanceSettlement}
        isPreparingPayment={isPreparingPayment}
      />

      <DraftModal
        isOpen={showDraftModal}
        onClose={() => setShowDraftModal(false)}
        draftSearch={draftSearch}
        setDraftSearch={setDraftSearch}
        draftsLoading={draftsLoading}
        filteredDrafts={filteredDrafts}
        billing={billing}
        currentStore={currentStore}
        currency={currency}
        formatDateTime={formatDateTime}
        onLoadDraft={handleLoadDraft}
        onDeleteDraft={handleDeleteDraft}
        submitting={submitting}
      />

      <CustomerModal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        selectedCustomerId={selectedCustomerId}
        currentStore={currentStore}
        currency={currency}
        onSelectCustomer={handleCustomerSelect}
        customers={customers}
        customersLoading={customersLoading}
      />
    </>
  );
}
