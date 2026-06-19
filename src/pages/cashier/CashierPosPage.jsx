import {
  ChevronLeft,
  ChevronRight,
  FolderClock,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  Download,
} from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { billingService } from '../../services/billingService';
import { categoryService } from '../../services/categoryService';
import { customerService } from '../../services/customerService';
import { productService } from '../../services/productService';
import { rewardService } from '../../services/rewardService';
import { currency, formatDateTime } from '../../utils/helpers';
import { openBillingPrint, downloadBillingDocument } from '../../utils/print';
import { mergeStoreSettings } from '../../utils/storeSettings';
import PaymentModal from '../../components/modals/PaymentModal';
import DraftModal from '../../components/modals/DraftModal';
import CustomerModal from '../../components/modals/CustomerModal';
import ProductCard from '../../components/card/ProductCard';

const SEARCH_DEBOUNCE_MS = 500;
const PRODUCT_CACHE_TTL_MS = 60_000;
const CATEGORY_CACHE_TTL_MS = 60_000;
const FALLBACK_PER_PAGE = 12;
const DEFAULT_VAT_RATE = 16;

const PRODUCT_GRID_GAP = 16;
const PRODUCT_GRID_MIN_COL_WIDTH = 220;
const PRODUCT_CARD_ESTIMATED_HEIGHT = 255; // 👈 Set to ~255 to eliminate the vertical whitespace gap
const PRODUCT_GRID_OVERSCAN_ROWS = 2;
const PRODUCT_VIEWPORT_MAX_HEIGHT = 'calc(100vh - 250px)'; // 👈 Fixed the 'pxpx' typo to 'px'

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

const getCustomerId = (customer) =>
  customer?.customer_id ?? customer?.id ?? null;

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

/* ----------------------- local-cart math ----------------------- */
const calcLineFromGross = (qty, unitPrice, vatRate) => {
  const q = Number(qty || 0);
  const p = Number(unitPrice || 0);
  const v = Number(vatRate || 0);
  const totalAmount = +(q * p).toFixed(2);
  const lineSubtotal = +(totalAmount / (1 + v / 100)).toFixed(2);
  const vatAmount = +(totalAmount - lineSubtotal).toFixed(2);
  return { line_subtotal: lineSubtotal, vat_amount: vatAmount, total_amount: totalAmount };
};

const recalcBillingTotals = (billing) => {
  if (!billing) return billing;
  const items = billing.items || [];
  const subtotal = items.reduce((s, it) => s + Number(it.line_subtotal || 0), 0);
  const vat_amount = items.reduce((s, it) => s + Number(it.vat_amount || 0), 0);
  const total = +(subtotal + vat_amount).toFixed(2);
  const grossTotal = items.reduce((s, it) => s + Number(it.total_amount || 0), 0);
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
  const unitPrice = Number(
    (overrides.unit_price ?? overrides.unitPrice ?? product.price) || 0
  );
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

/* ----------------------- localStorage layer ----------------------- */
const LS_PREFIX = 'pos.cart.v1';
const cartStorageKey = (storeId, userId) =>
  `${LS_PREFIX}::store_${storeId || 'na'}::user_${userId || 'na'}`;

const safeLoadCart = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
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

/* ----------------------- hooks ----------------------- */
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

    const observer = new ResizeObserver(() => update());
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

/* ----------------------- memoized render blocks ----------------------- */
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

    const totalHeight = Math.max(
      totalRows * PRODUCT_CARD_ESTIMATED_HEIGHT - PRODUCT_GRID_GAP,
      0
    );

    return { cells, totalHeight };
  }, [products, width, height, scrollTop]);

  return (
<div
      ref={viewportRef}
      className="products-viewport"
      style={{
        position: 'relative',
        overflowY: 'auto', // 👈 Keep this so your scroll math works!
        overflowX: 'hidden',
        maxHeight: PRODUCT_VIEWPORT_MAX_HEIGHT,
        minHeight: 360,
        /* 👇 This masks the top edge while leaving the bottom edge completely open */
        maskImage: 'linear-gradient(to bottom, transparent 0px, black 20px, black 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 20px, black 100%)',
      }}
    >
      {productsLoading && !products.length ? (
        <div className="page-loader" style={{ padding: '24px 0' }}>
          Loading products...
        </div>
      ) : null}

      {!productsLoading && !products.length ? (
        <div className="card">
          <p>Empty.</p>
        </div>
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
          <button
            type="button"
            className="icon-button"
            onClick={() => onDecrease(item)}
          >
            <Minus size={14} />
          </button>

          <span className="quantity-display">{item.quantity}</span>

          <button
            type="button"
            className="icon-button"
            onClick={() => onIncrease(item)}
          >
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
  const canDraft = can('pos.draft');
  const canVoid = can('pos.void');
  const { stores, storeId, loading: storeLoading } = useStore();

  const currentStore = useMemo(
    () => stores.find((store) => String(store.store_id) === String(storeId)),
    [stores, storeId]
  );

  const printSettings = useMemo(() => mergeStoreSettings(currentStore), [currentStore]);

  /* --- refs ----------------------------------------------------------- */
  const searchInputRef = useRef(null);

  const bootstrapProductsFetchedRef = useRef(false);

  const categoryCacheRef = useRef(new Map());
  const categoryRequestIdRef = useRef(0);

  const productCacheRef = useRef(new Map());
  const productRequestIdRef = useRef(0);

  const lastProductFilterRef = useRef('');
  const prefetchedKeysRef = useRef(new Set());
  const bootstrappedRef = useRef(false);
  const bootstrapRequestId = useRef(0);

  const syncQueueRef = useRef(Promise.resolve());
  const billingRef = useRef(null);
  const cartStorageKeyRef = useRef('');
  const hydratedFromStorageRef = useRef(false);

  const productFiltersRef = useRef({
    storeId: '',
    activeCategoryId: null,
    scopeKey: 'all',
    search: '',
  });

  const loadStaticDataRef = useRef(null);
  const loadDraftsRef = useRef(null);
  const loadBillingDetailRef = useRef(null);

  const hotkeyContextRef = useRef(null);

  /* --- state ---------------------------------------------------------- */
  const [categories, setCategories] = useState([]);
  const [categoryPageInfo, setCategoryPageInfo] = useState(emptyPageInfo());

  const [products, setProducts] = useState([]);
  const [drafts, setDrafts] = useState([]);

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

  const chapa5 = loyaltyRule?.chapa5 ?? null;

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [catalogReady, setCatalogReady] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const visibleCategories = categories;

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
    const key = cartStorageKeyRef.current;
    if (!key || !hydratedFromStorageRef.current) return;

    if (!billing || !billing.items?.length) {
      safeClearCart(key);
      return;
    }

    const snapshot = {
      v: 1,
      savedAt: Date.now(),
      storeId: String(storeId || ''),
      userId: String(user?.user_id || ''),
      billing: {
        billing_id: billing.billing_id || null,
        invnumber: billing.invnumber || null,
        is_draft: true,
        customer_id: billing.customer_id || null,
        notes: billing.notes || null,
        subtotal: billing.subtotal || 0,
        vat_amount: billing.vat_amount || 0,
        total: billing.total || 0,
        vat_rate: billing.vat_rate || DEFAULT_VAT_RATE,
        items: (billing.items || []).map((it) => ({
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
          quantity: it.quantity,
          unit_price: it.unit_price,
          vat_rate: it.vat_rate,
          line_subtotal: it.line_subtotal,
          vat_amount: it.vat_amount,
          total_amount: it.total_amount,
          __local: !!it.__local,
        })),
      },
      selectedCustomerId: selectedCustomerId || '',
      notes: notes || '',
    };

    safeSaveCart(key, snapshot);
  }, [billing, selectedCustomerId, notes, storeId, user?.user_id]);

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

  /* =====================================================================
     SYNC QUEUE
     ===================================================================== */
  const enqueueSync = useCallback((task) => {
    const next = syncQueueRef.current.then(task, task);
    syncQueueRef.current = next.catch(() => {});
    return next;
  }, []);

  /* --- helpers -------------------------------------------------------- */
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
    safeClearCart(cartStorageKeyRef.current);
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

  /* =====================================================================
     CATEGORY PAGE FETCHING
     ===================================================================== */
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

  /* =====================================================================
     PRODUCTS
     ===================================================================== */
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

  /* =====================================================================
     DRAFTS
     ===================================================================== */
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

  /* =====================================================================
     BILLING DETAIL
     ===================================================================== */
  const loadBillingDetail = useCallback(
    async (billingId, { silent = false } = {}) => {
      if (!billingId) return null;
      if (!silent) setBillingLoading(true);

      try {
        const response = await billingService.show(billingId);
        const detail = response?.data || response;
        const enriched = { ...detail, __local: false };
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

  loadStaticDataRef.current = loadStaticData;
  loadDraftsRef.current = loadDrafts;
  loadBillingDetailRef.current = loadBillingDetail;

  /* =====================================================================
     SELECTED CUSTOMER DETAIL LOAD
     ===================================================================== */
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
    if (!selectedCustomerId || !storeId) {
      setLoyaltyRule(null);
      return;
    }

    rewardService
      .customerLoyalty({
        store_id: Number(storeId),
        customer_id: Number(selectedCustomerId),
      })
      .then((data) => {
        setLoyaltyRule(data || null);
      })
      .catch(() => {
        setLoyaltyRule(null);
      });
  }, [selectedCustomerId, storeId]);

  /* =====================================================================
     EFFECTS
     ===================================================================== */
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 3000);
    return () => clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (activeCategory === 'all') return;

    const stillVisible = visibleCategories.some(
      (category) => String(getCategoryId(category)) === String(activeCategory)
    );

    if (!stillVisible) setActiveCategory('all');
  }, [visibleCategories, activeCategory]);

  /* ----- BOOTSTRAP ---------------------------------------------------- */
  useEffect(() => {
    if (!storeId) return;

    let cancelled = false;
    const bootstrapId = ++bootstrapRequestId.current;

    bootstrappedRef.current = false;
    hydratedFromStorageRef.current = false;
    setCatalogReady(false);

    setError('');
    setSuccess('');
    setDrafts([]);
    setSearch('');
    setDraftSearch('');
    setActiveCategory('all');

    resetSale();
    resetProductState();
    resetCategoryState();

    const bootstrap = async () => {
      try {
        setProductsLoading(true);

        const [, , productsResponse] = await Promise.all([
          loadStaticDataRef.current(),
          loadDraftsRef.current({ silent: true }),
          productService.list({ store_id: Number(storeId), page: 1, is_active: true }),
        ]);

        if (cancelled || bootstrapId !== bootstrapRequestId.current) return;

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
          storeId: String(storeId),
          categoryScope: 'all',
          search: '',
        });

        if (!cancelled && bootstrapId === bootstrapRequestId.current) {
          bootstrappedRef.current = true;
          setCatalogReady(true);

          const key = cartStorageKey(storeId, user?.user_id);
          cartStorageKeyRef.current = key;
          const saved = safeLoadCart(key);

          if (saved?.billing?.items?.length) {
            if (saved.billing.billing_id) {
              try {
                await loadBillingDetailRef.current(saved.billing.billing_id, { silent: true });
              } catch {
                const restored = recalcBillingTotals({
                  ...buildEmptyLocalBilling(),
                  ...saved.billing,
                  billing_id: null,
                  __local: true,
                });
                setBilling(restored);
                setSelectedCustomerId(saved.selectedCustomerId || '');
                setNotes(saved.notes || '');
              }
            } else {
              const restored = recalcBillingTotals({
                ...buildEmptyLocalBilling(),
                ...saved.billing,
                __local: true,
              });
              setBilling(restored);
              setSelectedCustomerId(saved.selectedCustomerId || '');
              setNotes(saved.notes || '');
            }
          }

          hydratedFromStorageRef.current = true;
        }
      } catch (err) {
        if (!cancelled) console.error('POS init failed:', err);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [storeId, user?.user_id, resetSale, resetProductState, resetCategoryState]);

  /* ----- PRODUCTS RELOAD --------------------------------------------- */
  useEffect(() => {
    if (!storeId || !bootstrappedRef.current || !catalogReady) return;

    if (bootstrapProductsFetchedRef.current) {
      bootstrapProductsFetchedRef.current = false;
      return;
    }

    const filtersChanged = lastProductFilterRef.current !== currentFilterSignature;

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
  }, [storeId, currentPage, currentFilterSignature, loadProducts, catalogReady]);

  /* ----- PRODUCT PREFETCH -------------------------------------------- */
  useEffect(() => {
    if (!bootstrappedRef.current || !catalogReady) return;
    if (productsLoading) return;
    if (!productPageInfo.hasNextPage) return;

    void prefetchNextPage(productPageInfo.currentPage + 1);
  }, [
    productPageInfo.currentPage,
    productPageInfo.hasNextPage,
    prefetchNextPage,
    productsLoading,
    catalogReady,
  ]);

  /* =====================================================================
     BILLING MUTATIONS
     ===================================================================== */
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

      let removedItemSnapshot = null;

      applyBillingMutation((draft) => {
        removedItemSnapshot = draft.items.find(
          (it) => String(it.billing_item_id) === String(billingItemId)
        );
        draft.items = draft.items.filter(
          (it) => String(it.billing_item_id) !== String(billingItemId)
        );
        return draft;
      });

      const current = billingRef.current;
      if (!current?.billing_id || !removedItemSnapshot || removedItemSnapshot.__local) return;

      enqueueSync(async () => {
        try {
          await billingService.removeItem(billingItemId);
        } catch (err) {
          setError(
            err?.response?.data?.message || err?.message || 'Background sync failed (remove).'
          );
        }
      });
    },
    [applyBillingMutation, enqueueSync]
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
        Object.assign(target, { quantity: nextQuantity, ...totals });
        return draft;
      });

      const current = billingRef.current;
      if (!current?.billing_id || item.__local) return;

      enqueueSync(async () => {
        try {
          await billingService.updateItem(item.billing_item_id, {
            quantity: nextQuantity,
            unit_price: item.unit_price,
          });
        } catch (err) {
          setError(
            err?.response?.data?.message || err?.message || 'Background sync failed (quantity).'
          );
        }
      });
    },
    [applyBillingMutation, enqueueSync, removeItem]
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

      let wasIncrement = false;
      let optimisticItemId = null;

      applyBillingMutation((draft) => {
        const existing = draft.items.find(
          (it) => String(it.product_id) === String(product.product_id)
        );

        if (existing) {
          wasIncrement = true;
          optimisticItemId = existing.billing_item_id;
          const newQty = Number(existing.quantity || 0) + 1;
          const totals = calcLineFromGross(
            newQty,
            existing.unit_price,
            existing.vat_rate ?? product.vat_rate ?? DEFAULT_VAT_RATE
          );
          Object.assign(existing, { quantity: newQty, ...totals });
        } else {
          const local = buildLocalItem(product, 1);
          optimisticItemId = local.billing_item_id;
          draft.items.push(local);
        }

        return draft;
      });

      const current = billingRef.current;
      if (!current?.billing_id) return;

      enqueueSync(async () => {
        try {
          if (wasIncrement) {
            const liveItem = (billingRef.current?.items || []).find(
              (it) => String(it.billing_item_id) === String(optimisticItemId)
            );
            if (!liveItem || liveItem.__local) return;

            await billingService.updateItem(liveItem.billing_item_id, {
              quantity: liveItem.quantity,
              unit_price: liveItem.unit_price,
            });
          } else {
            const created = await billingService.addItem(current.billing_id, {
              product_id: product.product_id,
              quantity: 1,
              unit_price: product.price,
            });

            const serverItem = created?.data || created;

            if (serverItem?.billing_item_id) {
              setBilling((prev) => {
                if (!prev) return prev;

                const items = (prev.items || []).map((it) =>
                  String(it.billing_item_id) === String(optimisticItemId)
                    ? { ...it, billing_item_id: serverItem.billing_item_id, __local: false }
                    : it
                );

                return recalcBillingTotals({ ...prev, items });
              });
            }
          }
        } catch (err) {
          setError(err?.response?.data?.message || err?.message || 'Background sync failed (add).');
        }
      });
    },
    [applyBillingMutation, enqueueSync]
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

  /* =====================================================================
     DRAFT PROMOTION / PAYMENT
     ===================================================================== */
  const promoteLocalCartToServerDraft = useCallback(async () => {
    const current = billingRef.current;
    if (!current?.items?.length) return null;
    if (current.billing_id) return current;

    await syncQueueRef.current.catch(() => {});

    const createdRes = await billingService.createDraft({
      store_id: Number(storeId),
      customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
      notes: notes || null,
    });
    const created = createdRes?.data || createdRes;
    const newId = created.billing_id;

    const snapshot = [...(current.items || [])];
    for (const it of snapshot) {
      try {
        await billingService.addItem(newId, {
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
        });
      } catch (err) {
        console.error('Failed to sync line on promote:', err);
      }
    }

    const detail = await loadBillingDetail(newId, { silent: true });
    return detail || created;
  }, [storeId, selectedCustomerId, notes, loadBillingDetail]);

  const persistDraftHeader = useCallback(async () => {
    const current = billingRef.current;
    if (!current?.billing_id) return null;

    await billingService.update(current.billing_id, {
      customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
      notes: notes || null,
    });

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
        finalBilling = await persistDraftHeader();
      }

      if (finalBilling) mergeDraftPreview(finalBilling);

      setSuccess(
        finalBilling?.billing_id
          ? `Draft #${finalBilling.billing_id} saved successfully.`
          : 'Draft saved successfully.'
      );
      resetSale();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to save draft.');
    } finally {
      setSubmitting(false);
    }
  }, [mergeDraftPreview, persistDraftHeader, promoteLocalCartToServerDraft, resetSale]);

  const handleProceedToPayment = useCallback(async () => {
    const current = billingRef.current;
    if (!current?.items?.length) return;
    setError('');
    setSubmitting(true);

    try {
      if (!current.billing_id) await promoteLocalCartToServerDraft();
      else await persistDraftHeader();
      setShowPaymentModal(true);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to open payment.');
    } finally {
      setSubmitting(false);
    }
  }, [persistDraftHeader, promoteLocalCartToServerDraft]);

  const handleCharge = useCallback(
    async (paymentDetails) => {
      const current = billingRef.current;
      if (!current?.items?.length) return;
      if (current.status === 'paid') {
        setShowPaymentModal(false);
        return;
      }

      setSubmitting(true);
      setSuccess('');

      try {
        let target = current;
        if (!current.billing_id) target = await promoteLocalCartToServerDraft();
        else target = (await persistDraftHeader()) || current;

        await billingService.charge(target.billing_id, {
          payment_method: paymentDetails.paymentMethod,
          amount_received: paymentDetails.amountReceived,
          amount_tendered: paymentDetails.amountTendered,
          points_redeemed: paymentDetails.pointsToRedeem,
          mpesa_phone: paymentDetails.mpesaPhone,
          mpesa_code: paymentDetails.mpesaCode,
          card_reference: paymentDetails.cardReference,
          card_holder: paymentDetails.cardHolder,
        });

        const paidResponse = await billingService.show(target.billing_id);
        const paidBilling = paidResponse?.data || paidResponse;
        const printMode = Number(paidBilling?.balance_due || 0) <= 0 ? 'receipt' : 'invoice';
        openBillingPrint(paidBilling, currentStore, printMode, printSettings);

        removeDraftPreview(target.billing_id);
        resetSale();
        setPointsToRedeem(0);
        setShowPaymentModal(false);
        setSuccess('Payment processed successfully.');
        focusSearchInput(true);
      } catch (err) {
        throw new Error(
          err?.response?.data?.message || err?.message || 'Unable to process payment.'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      currentStore,
      focusSearchInput,
      persistDraftHeader,
      printSettings,
      promoteLocalCartToServerDraft,
      removeDraftPreview,
      resetSale,
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
        if (String(current?.billing_id) === String(draftId)) resetSale();
        removeDraftPreview(draftId);
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Unable to delete draft.');
      } finally {
        setSubmitting(false);
      }
    },
    [deleteBillingRecord, removeDraftPreview, resetSale]
  );

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
      if (current?.billing_id) {
        await deleteBillingRecord(current.billing_id);
        removeDraftPreview(current.billing_id);
      }
      resetSale();
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
    setSubmitting(true);

    try {
      const freeProduct = products.find(
        (p) => p.sku?.toLowerCase() === chapa5Preview.product_sku?.toLowerCase()
      );

      if (!freeProduct) {
        setError('Free item product not found in catalog.');
        return;
      }

      let target = billingRef.current;
      if (!target?.billing_id) {
        target = await promoteLocalCartToServerDraft();
      } else {
        target = (await persistDraftHeader()) || target;
      }

      if (!target?.billing_id) {
        setError('Unable to save cart before claiming reward.');
        return;
      }

      await billingService.addItem(target.billing_id, {
        product_id: freeProduct.product_id,
        quantity: itemsToAdd,
        unit_price: 0,
      });

      setChapa5ClaimedQty((prev) => prev + itemsToAdd);
      await loadBillingDetail(target.billing_id, { silent: true });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to add free item.');
    } finally {
      setSubmitting(false);
    }
  }, [chapa5Preview, products, promoteLocalCartToServerDraft, persistDraftHeader, loadBillingDetail]);

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

  /* =====================================================================
     DERIVED RENDER VALUES
     ===================================================================== */
  const itemCount = useMemo(
    () => billing?.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0,
    [billing?.items]
  );

  const filteredDrafts = useMemo(() => {
    const keyword = draftSearch.trim().toLowerCase();
    if (!keyword) return drafts;

    return drafts.filter((draft) => {
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
  }, [drafts, draftSearch]);

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

  /* =====================================================================
     PAGINATION HANDLERS
     ===================================================================== */
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

  /* =====================================================================
     EARLY RETURNS
     ===================================================================== */
  if (storeLoading) {
    return (
      <section className="pos-grid cashier-pos-page">
        <div className="pos-catalog stack-lg">
          <div className="page-loader">Loading stores...</div>
        </div>
      </section>
    );
  }

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
            <p>
              <strong>No stores assigned</strong>
            </p>
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
            </div>

            <div
              className="chips-row"
              style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
            >
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

              {categoryPageInfo.total > 0 && (
                <span
                  className="muted"
                  style={{ fontSize: 12, marginLeft: 4 }}
                  aria-live="polite"
                >
                  {categoryPageInfo.currentPage}/{categoryPageInfo.lastPage}
                  <span style={{ marginLeft: 6, opacity: 0.8 }}>
                    {categoryPageInfo.total}
                  </span>
                </span>
              )}
            </div>
          </div>

          {catalogLoading ? (
            <div className="page-loader">Loading POS...</div>
          ) : (
            <>
              {error ? <div className="form-error">{error}</div> : null}
              {success ? <div className="form-success">{success}</div> : null}
              {productsLoading && products.length ? (
                <div className="inline-note-spinner">Refreshing products...</div>
              ) : null}

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
              />

              {products.length > 0 ? (
                <div className="pagination-bar">
                  <div className="pagination-summary">
                    Showing <strong>{productPageInfo.from}</strong> -{' '}
                    <strong>{productPageInfo.to}</strong> of{' '}
                    <strong>{productPageInfo.total}</strong> products
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
                      disabled={productPageInfo.currentPage >= productPageInfo.lastPage || productsLoading}
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
                    <strong>
                      {selectedCustomer?.full_name ||
                        (selectedCustomerId ? 'Loading...' : 'Customer')}
                    </strong>
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
                  onClick={() =>
                    billing && openBillingPrint(billing, currentStore, 'invoice', printSettings)
                  }
                  disabled={!billing}
                  title="Print"
                  style={{ padding: '6px', minWidth: 'auto' }}
                >
                  <Printer size={16} />
                </button>

                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => billing && downloadBillingDocument(billing, 'invoice')}
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

                <div className="summary-divider"></div>

                <div className="summary-row total-accent-row">
                  <span className="total-label">Total Amount</span>
                  <strong className="total-value">
                    {currency(billing?.total || 0, currentStore?.currency)}
                  </strong>
                </div>
              </div>
            </div>

            <div className="billing-bottom-actions">
              <button
                type="button"
                className="primary-button"
                disabled={!billing?.items?.length || submitting}
                onClick={handleProceedToPayment}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Proceed to Payment
              </button>
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
        onClose={() => setShowPaymentModal(false)}
        onCharge={handleCharge}
        loyaltyPoints={loyaltyRule?.loyalty_points ?? 0}
        loyaltyPointValue={loyaltyRule?.active_rule?.point_value ?? 1}
        pointsToRedeem={pointsToRedeem}
        setPointsToRedeem={setPointsToRedeem}
        chapa5Preview={chapa5Preview}
        onClaimChapa5Reward={handleClaimChapa5Reward}
        loyaltyMinPoints={loyaltyRule?.active_rule?.min_points ?? 0}
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
      />
    </>
  );
}
