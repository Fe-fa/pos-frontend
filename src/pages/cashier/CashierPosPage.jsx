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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { billingService } from '../../services/billingService';
import { categoryService } from '../../services/categoryService';
import { customerService } from '../../services/customerService';
import { productService } from '../../services/productService';
import { currency, formatDateTime } from '../../utils/helpers';
import { openBillingPrint, downloadBillingDocument } from '../../utils/print';
import { mergeStoreSettings } from '../../utils/storeSettings';
import PaymentModal from '../../components/modals/PaymentModal';
import DraftModal from '../../components/modals/DraftModal';
import CustomerModal from '../../components/modals/CustomerModal';
import ProductCard from '../../components/card/ProductCard';

const SEARCH_DEBOUNCE_MS = 300;
const PRODUCT_CACHE_TTL_MS = 60_000;
const CATEGORY_CACHE_TTL_MS = 60_000;
const FALLBACK_PER_PAGE = 12;
const DEFAULT_VAT_RATE = 16;

const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL || '';

/* ----------------------- helpers ----------------------- */
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

const buildLocalItem = (product, quantity = 1) => {
  const unitPrice = Number(product.price || 0);
  const vatRate = Number(product.vat_rate ?? DEFAULT_VAT_RATE);
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
    /* quota or privacy mode — ignore */
  }
};

const safeClearCart = (key) => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};

export default function CashierPosPage() {
  const { user } = useAuth();
  const { stores, storeId, loading: storeLoading } = useStore();

  const currentStore = stores.find((store) => String(store.store_id) === String(storeId));
  const printSettings = mergeStoreSettings(currentStore);

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

  /* --- state ---------------------------------------------------------- */
  const [categories, setCategories] = useState([]);
  const [categoryPageInfo, setCategoryPageInfo] = useState(emptyPageInfo());

  const [products, setProducts] = useState([]);
  const [drafts, setDrafts] = useState([]);

  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [productPageInfo, setProductPageInfo] = useState(emptyPageInfo());

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [notes, setNotes] = useState('');
  const [billing, setBilling] = useState(null);

  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [amountTendered, setAmountTendered] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaCode, setMpesaCode] = useState('');
  const [cardReference, setCardReference] = useState('');
  const [cardHolder, setCardHolder] = useState('');

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
        search: debouncedSearch.trim().toLowerCase(),
      }),
    [storeId, effectiveCategoryScopeKey, debouncedSearch]
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
      search: debouncedSearch.trim().toLowerCase(),
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

  /* =====================================================================
     SYNC QUEUE
     ===================================================================== */
  const enqueueSync = useCallback((task) => {
    const next = syncQueueRef.current.then(task, task);
    syncQueueRef.current = next.catch(() => { });
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

  const resetPaymentState = useCallback((total = '') => {
    setPaymentMethod('');
    setAmountReceived(total ? String(total) : '');
    setAmountTendered('');
    setMpesaPhone('');
    setMpesaCode('');
    setCardReference('');
    setCardHolder('');
  }, []);

  const resetSale = useCallback(() => {
    setBilling(null);
    setSelectedCustomerId('');
    setSelectedCustomer(null);
    setNotes('');
    resetPaymentState('');
    setShowPaymentModal(false);
    setShowCustomerModal(false);
    safeClearCart(cartStorageKeyRef.current);
  }, [resetPaymentState]);

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

  const deleteBillingRecord = async (billingId) => {
    if (typeof billingService.destroy === 'function') return billingService.destroy(billingId);
    if (typeof billingService.delete === 'function') return billingService.delete(billingId);
    if (typeof billingService.remove === 'function') return billingService.remove(billingId);
    throw new Error('Delete billing method is not implemented in billingService.');
  };

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
        `Failed to load catalog: ${err?.response?.data?.message || err?.message || 'Network Error'
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
        search: searchValue,
      }),
    []
  );

  const fetchProductsPage = useCallback(
    async (page, categoryId = productFiltersRef.current.activeCategoryId) => {
      const { storeId: sid, search } = productFiltersRef.current;

      const params = {
        store_id: Number(sid),
        page,
        is_active: true,
      };

      if (categoryId != null) params.category_id = categoryId;

      const normalizedSearch = search.trim();
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
     SELECTED CUSTOMER DETAIL LOAD (lazy)
     ===================================================================== */
  useEffect(() => {
    let cancelled = false;

    if (!selectedCustomerId) {
      setSelectedCustomer(null);
      return () => {
        cancelled = true;
      };
    }

    // If we already have the matching customer, no need to refetch.
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

  /* =====================================================================
     EFFECTS
     ===================================================================== */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

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
    setDebouncedSearch('');
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

        const response = productsResponse;

        const meta = extractMeta(response);
        const items = extractList(response);
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

  const handlePayNow = useCallback(
    (product) => {
      handleAddProduct(product);
      window.requestAnimationFrame(() => {
        const next = billingRef.current;
        resetPaymentState(next?.total || product.price || '');
        setShowPaymentModal(true);
      });
    },
    [handleAddProduct, resetPaymentState]
  );

  /* =====================================================================
     DRAFT PROMOTION / PAYMENT
     ===================================================================== */
  const promoteLocalCartToServerDraft = async () => {
    const current = billingRef.current;
    if (!current?.items?.length) return null;
    if (current.billing_id) return current;

    await syncQueueRef.current.catch(() => { });

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
  };

  const persistDraftHeader = async () => {
    const current = billingRef.current;
    if (!current?.billing_id) return null;

    await billingService.update(current.billing_id, {
      customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
      notes: notes || null,
    });

    const updatedBilling = await loadBillingDetail(current.billing_id, { silent: true });
    mergeDraftPreview(updatedBilling);
    return updatedBilling;
  };

  const openPaymentModalForBilling = (billingData) => {
    resetPaymentState(billingData?.total || '');
    setShowPaymentModal(true);
  };

  const handleSaveOrUpdateDraft = async () => {
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
  };

  const handleProceedToPayment = async () => {
    const current = billingRef.current;
    if (!current?.items?.length) return;
    setError('');
    setSubmitting(true);

    try {
      let target = current;
      if (!current.billing_id) {
        target = await promoteLocalCartToServerDraft();
      } else {
        target = (await persistDraftHeader()) || current;
      }
      openPaymentModalForBilling(target);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to open payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method);
    setError('');
    if (method !== 'cash') setAmountTendered('');
  };

  const validatePayment = () => {
    if (!paymentMethod) {
      setError('Please select a payment method.');
      return false;
    }
    if (!amountReceived || Number(amountReceived) <= 0) {
      setError('Please enter a valid amount received.');
      return false;
    }
    if (paymentMethod === 'mpesa') {
      if (!mpesaPhone.trim()) {
        setError('Please enter MPESA phone number.');
        return false;
      }
      if (!mpesaCode.trim()) {
        setError('Please enter MPESA transaction code.');
        return false;
      }
    }
    if (paymentMethod === 'card' && !cardReference.trim()) {
      setError('Please enter card reference.');
      return false;
    }
    return true;
  };

  const handleCharge = async () => {
    const current = billingRef.current;
    if (!current?.items?.length) return;
    if (!validatePayment()) return;

    if (current.status === 'paid') {
      setError('This billing has already been paid.');
      setShowPaymentModal(false);
      return;
    }

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      let target = current;
      if (!current.billing_id) target = await promoteLocalCartToServerDraft();
      else target = (await persistDraftHeader()) || current;

      await billingService.charge(target.billing_id, {
        payment_method: paymentMethod,
        amount_received: Number(amountReceived || 0),
        amount_tendered:
          paymentMethod === 'cash'
            ? Number(amountTendered || amountReceived || 0)
            : Number(amountReceived || 0),
        mpesa_phone: paymentMethod === 'mpesa' ? mpesaPhone : null,
        mpesa_code: paymentMethod === 'mpesa' ? mpesaCode : null,
        card_reference: paymentMethod === 'card' ? cardReference : null,
        card_holder: paymentMethod === 'card' ? cardHolder || null : null,
      });

      const paidResponse = await billingService.show(target.billing_id);
      const paidBilling = paidResponse?.data || paidResponse;

      const printMode = Number(paidBilling?.balance_due || 0) <= 0 ? 'receipt' : 'invoice';
      openBillingPrint(paidBilling, currentStore, printMode, printSettings);

      removeDraftPreview(target.billing_id);
      resetSale();
      setShowPaymentModal(false);
      setSuccess('Payment processed successfully.');
      focusSearchInput(true);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to process payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadDraft = async (draftId) => {
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
  };

  const handleDeleteDraft = async (draftId) => {
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
  };

const handleCustomerSelect = useCallback((customerId, customerObject = null) => {
  setSelectedCustomerId(customerId);
  if (customerObject) {
    setSelectedCustomer(customerObject); // ← set instantly, no fetch needed
  } else {
    setSelectedCustomer(null); // ← walk-in customer
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
    submitting,
    showPaymentModal,
    showDraftModal,
    showCustomerModal,
    search,
    focusSearchInput,
    removeDraftPreview,
    resetSale,
  ]);

  /* ----- global hotkeys ---------------------------------------------- */
  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      const blockedTarget = isHotkeyBlockedElement(event.target);
      const typingTarget = isTypingElement(event.target);

      if (event.key === 'F2') {
        event.preventDefault();
        focusSearchInput(true);
        return;
      }

      if (event.key === 'F8') {
        event.preventDefault();
        if (!submitting && billingRef.current?.items?.length) void handleSaveOrUpdateDraft();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        void handleEscapeShortcut();
        return;
      }

      const wantsCheckout =
        (event.code === 'Space' || event.key === ' ' || event.key === 'Enter') &&
        !blockedTarget &&
        !typingTarget &&
        !showPaymentModal &&
        !showDraftModal &&
        !showCustomerModal;

      if (wantsCheckout && !submitting && billingRef.current?.items?.length) {
        event.preventDefault();
        void handleProceedToPayment();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    submitting,
    showPaymentModal,
    showDraftModal,
    showCustomerModal,
    focusSearchInput,
    handleEscapeShortcut,
  ]);

  /* =====================================================================
     DERIVED RENDER VALUES
     ===================================================================== */
  const itemCount =
    billing?.items?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;

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

  const customerCurrentBalance = Number(
    selectedCustomer?.current_balance ??
    selectedCustomer?.balance ??
    selectedCustomer?.opening_balance ??
    0
  );

  /* =====================================================================
     PAGINATION HANDLERS
     ===================================================================== */
  const goToPreviousPage = () => {
    if (productsLoading) return;
    const prevPage = productPageInfo.currentPage - 1;
    if (prevPage < 1) return;
    setCurrentPage(prevPage);
  };

  const goToNextPage = () => {
    if (productsLoading) return;
    const nextPage = productPageInfo.currentPage + 1;
    if (nextPage > productPageInfo.lastPage) return;
    setCurrentPage(nextPage);
  };

  const goToPrevCategoryPage = async () => {
    if (!canPrevCategory || categoriesLoading) return;
    await loadCategoriesPage(categoryPageInfo.currentPage - 1);
  };

  const goToNextCategoryPage = async () => {
    if (!canNextCategory || categoriesLoading) return;
    await loadCategoriesPage(categoryPageInfo.currentPage + 1);
  };

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
              {productsLoading ? <div className="page-loader">Loading products...</div> : null}

              <div className="products-grid products-grid-enhanced">
                {products.map((product) => (
                  <ProductCard
                    key={product.product_id}
                    product={product}
                    currentStore={currentStore}
                    submitting={submitting}
                    onPayNow={handlePayNow}
                    onAddProduct={handleAddProduct}
                    currency={currency}
                    getProductImage={getProductImage}
                  />
                ))}

                {!productsLoading && !products.length ? (
                  <div className="card">
                    <p>Empty.</p>
                  </div>
                ) : null}
              </div>

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
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => billing && openBillingPrint(billing, currentStore, 'invoice', printSettings)}
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
              </div>
            </div>

            <div className="billing-items-list">
              {billing?.items?.length ? (
                billing.items.map((item) => (
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
                          onClick={() => updateItemQuantity(item, Number(item.quantity) - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span className="quantity-display">{item.quantity}</span>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => updateItemQuantity(item, Number(item.quantity) + 1)}
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
                        onClick={() => removeItem(item.billing_item_id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">Empty billing...hover over a product to add it.</p>
              )}
            </div>

            <div className="billing-summary-container">
              <div className="billing-summary-list">
                <div className="summary-row">
                  <span className="summary-label">Net Amount</span>
                  <span className="summary-value">
                    {currency(billing?.subtotal || 0, currentStore?.currency)}
                  </span>
                </div>
                <div className="summary-row">
                  <span className="summary-label">VAT ({Number(billing?.vat_rate || DEFAULT_VAT_RATE)}%)</span>
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
        paymentMethod={paymentMethod}
        amountReceived={amountReceived}
        setAmountReceived={setAmountReceived}
        amountTendered={amountTendered}
        setAmountTendered={setAmountTendered}
        mpesaPhone={mpesaPhone}
        setMpesaPhone={setMpesaPhone}
        mpesaCode={mpesaCode}
        setMpesaCode={setMpesaCode}
        cardReference={cardReference}
        setCardReference={setCardReference}
        cardHolder={cardHolder}
        setCardHolder={setCardHolder}
        submitting={submitting}
        currency={currency}
        onPaymentMethodChange={handlePaymentMethodChange}
        onClose={() => setShowPaymentModal(false)}
        onCharge={handleCharge}
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
