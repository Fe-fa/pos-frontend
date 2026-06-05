import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FolderClock,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  Wallet,
  Download,
  X,
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

const SEARCH_DEBOUNCE_MS = 300;
const PRODUCT_CACHE_TTL_MS = 60_000;
const CATEGORY_CACHE_TTL_MS = 60_000;
const FALLBACK_PER_PAGE = 12;

const IMAGE_BASE_URL = import.meta.env.VITE_IMAGE_BASE_URL || '';

const PAYMENT_METHODS = [
  { key: 'cash', title: 'CASH', description: 'Receive cash and enter tendered amount', icon: Wallet },
  { key: 'mpesa', title: 'MPESA', description: 'Enter phone number and transaction code', icon: Smartphone },
  { key: 'card', title: 'CARD', description: 'Enter card reference', icon: CreditCard },
];

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

const normalizeCategoryIds = (ids) =>
  ids
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);

const buildCategoryScopeKey = (mode, ids) => `${mode}:${ids.join(',')}`;

export default function CashierPosPage() {
  const { user } = useAuth();
  const { stores, storeId, loading: storeLoading } = useStore();

  const currentStore = stores.find((store) => String(store.store_id) === String(storeId));
  const printSettings = mergeStoreSettings(currentStore);

  /* --- refs ----------------------------------------------------------- */
  const searchInputRef = useRef(null);

  const categoryCacheRef = useRef(new Map());
  const categoryRequestIdRef = useRef(0);

  const productCacheRef = useRef(new Map());
  const productRequestIdRef = useRef(0);

  const lastProductFilterRef = useRef('');
  const prefetchedKeysRef = useRef(new Set());
  const bootstrappedRef = useRef(false);
  const bootstrapRequestId = useRef(0);

  const [categories, setCategories] = useState([]);
  const [categoryPageInfo, setCategoryPageInfo] = useState(emptyPageInfo());

  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [drafts, setDrafts] = useState([]);

  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [draftSearch, setDraftSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [productPageInfo, setProductPageInfo] = useState(emptyPageInfo());

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
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

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  /* --- derived / memos ------------------------------------------------ */
  const visibleCategories = categories;

  const visibleCategoryIds = useMemo(
    () =>
      normalizeCategoryIds(
        visibleCategories
          .map((category) => getCategoryId(category))
          .filter((id) => id != null)
      ),
    [visibleCategories]
  );

  const effectiveCategoryIds = useMemo(() => {
    if (activeCategory === 'all') return visibleCategoryIds;
    return normalizeCategoryIds([activeCategory]);
  }, [activeCategory, visibleCategoryIds]);

  const effectiveCategoryScopeKey = useMemo(() => {
    if (activeCategory === 'all') {
      return buildCategoryScopeKey('visible-page', effectiveCategoryIds);
    }
    return buildCategoryScopeKey('single', effectiveCategoryIds);
  }, [activeCategory, effectiveCategoryIds]);

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
    setNotes('');
    resetPaymentState('');
    setShowPaymentModal(false);
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
     CATEGORY PAGE FETCHING (server-side pagination)
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

        categoryCacheRef.current.set(cacheKey, {
          items,
          pageInfo,
          ts: Date.now(),
        });

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

  /* =====================================================================
     STATIC DATA (customers only + first category page)
     ===================================================================== */
  const loadStaticData = useCallback(async () => {
    if (!storeId) {
      return {
        categories: [],
        categoryPageInfo: emptyPageInfo(),
        customers: [],
      };
    }

    setCatalogLoading(true);
    setError('');

    try {
      const [categoryResult, customersRes] = await Promise.all([
        loadCategoriesPage(1, { force: true, silent: true }),
        customerService.list({ store_id: Number(storeId), per_page: 100 }),
      ]);

      const customerList = extractList(customersRes);
      setCustomers(customerList);

      return {
        categories: categoryResult.items,
        categoryPageInfo: categoryResult.pageInfo,
        customers: customerList,
      };
    } catch (err) {
      console.error('POS catalog load failed:', err);
      setError(
        `Failed to load catalog: ${err?.response?.data?.message || err?.message || 'Network Error'}`
      );
      setCustomers([]);

      return {
        categories: [],
        categoryPageInfo: emptyPageInfo(),
        customers: [],
      };
    } finally {
      setCatalogLoading(false);
    }
  }, [storeId, loadCategoriesPage]);

  /* =====================================================================
     PRODUCTS — cache key + fetch + load
     ===================================================================== */
  const buildCacheKey = useCallback(
    (
      page,
      categoryIds = effectiveCategoryIds,
      scopeKey = effectiveCategoryScopeKey,
      searchValue = debouncedSearch.trim().toLowerCase()
    ) =>
      JSON.stringify({
        storeId: String(storeId || ''),
        page: Number(page || 1),
        categoryScope: scopeKey,
        categoryIds: normalizeCategoryIds(categoryIds).join(','),
        search: searchValue,
      }),
    [storeId, effectiveCategoryIds, effectiveCategoryScopeKey, debouncedSearch]
  );

  const fetchProductsPage = useCallback(
    async (page, categoryIds = effectiveCategoryIds) => {
      const normalizedCategoryIds = normalizeCategoryIds(categoryIds);

      if (!normalizedCategoryIds.length) {
        return {
          items: [],
          pageInfo: emptyPageInfo(),
        };
      }

      const params = {
        store_id: Number(storeId),
        page,
        is_active: true,
      };

      if (normalizedCategoryIds.length === 1) {
        params.category_id = normalizedCategoryIds[0];
      } else {
        params.category_ids = normalizedCategoryIds.join(',');
      }

      const normalizedSearch = debouncedSearch.trim();
      if (normalizedSearch) params.search = normalizedSearch;

      const response = await productService.list(params);
      const meta = extractMeta(response);
      const items = extractList(response);
      const pageInfo = buildPageInfo(meta, items, page);

      return { items, pageInfo };
    },
    [storeId, debouncedSearch, effectiveCategoryIds]
  );

  const loadProducts = useCallback(
    async (page = 1, { force = false } = {}) => {
      if (!storeId) return;

      if (!effectiveCategoryIds.length) {
        setProducts([]);
        setProductPageInfo(emptyPageInfo());
        return;
      }

      const cacheKey = buildCacheKey(page);
      const cached = productCacheRef.current.get(cacheKey);
      const fresh = cached && Date.now() - cached.ts < PRODUCT_CACHE_TTL_MS;

      if (!force && cached) {
        setProducts(cached.items);
        setProductPageInfo(cached.pageInfo);
        if (page !== cached.pageInfo.currentPage) {
          setCurrentPage(cached.pageInfo.currentPage);
        }
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

        if (pageInfo.currentPage !== page) {
          setCurrentPage(pageInfo.currentPage);
        }
      } catch (err) {
        if (requestId !== productRequestIdRef.current) return;
        setError(err?.response?.data?.message || err?.message || 'Failed to load products.');
        setProducts([]);
        setProductPageInfo(emptyPageInfo());
      } finally {
        if (requestId === productRequestIdRef.current) {
          setProductsLoading(false);
        }
      }
    },
    [storeId, effectiveCategoryIds, buildCacheKey, fetchProductsPage]
  );

  const prefetchNextPage = useCallback(
    async (nextPage) => {
      if (!storeId || nextPage < 1 || !effectiveCategoryIds.length) return;

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
    [storeId, effectiveCategoryIds, buildCacheKey, fetchProductsPage]
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
        setBilling(detail);
        setSelectedCustomerId(detail?.customer_id ? String(detail.customer_id) : '');
        setNotes(detail?.notes || '');
        mergeDraftPreview(detail);
        return detail;
      } catch (err) {
        setError(err?.response?.data?.message || err?.message || 'Failed to load billing details.');
        throw err;
      } finally {
        if (!silent) setBillingLoading(false);
      }
    },
    [mergeDraftPreview]
  );

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

    if (!stillVisible) {
      setActiveCategory('all');
    }
  }, [visibleCategories, activeCategory]);

  /* ----- BOOTSTRAP ---------------------------------------------------- */
  useEffect(() => {
    if (!storeId) return;

    let cancelled = false;
    const bootstrapId = ++bootstrapRequestId.current;
    bootstrappedRef.current = false;

    setError('');
    setSuccess('');
    setDrafts([]);
    setCustomers([]);
    setSearch('');
    setDebouncedSearch('');
    setDraftSearch('');
    setActiveCategory('all');

    resetSale();
    resetProductState();
    resetCategoryState();

    const bootstrap = async () => {
      try {
        const [{ categories: initialCategories }] = await Promise.all([
          loadStaticData(),
          loadDrafts({ silent: true }),
        ]);

        if (cancelled || bootstrapId !== bootstrapRequestId.current) return;

        const initialVisibleCategoryIds = normalizeCategoryIds(
          initialCategories
            .map((category) => getCategoryId(category))
            .filter((id) => id != null)
        );

        if (!initialVisibleCategoryIds.length) {
          setProducts([]);
          setProductPageInfo(emptyPageInfo());

          lastProductFilterRef.current = JSON.stringify({
            storeId: String(storeId),
            categoryScope: buildCategoryScopeKey('visible-page', []),
            search: '',
          });

          if (!cancelled && bootstrapId === bootstrapRequestId.current) {
            bootstrappedRef.current = true;
          }
          return;
        }

        setProductsLoading(true);

        const params = {
          store_id: Number(storeId),
          page: 1,
          is_active: true,
        };

        if (initialVisibleCategoryIds.length === 1) {
          params.category_id = initialVisibleCategoryIds[0];
        } else {
          params.category_ids = initialVisibleCategoryIds.join(',');
        }

        const response = await productService.list(params);

        if (cancelled || bootstrapId !== bootstrapRequestId.current) return;

        const meta = extractMeta(response);
        const items = extractList(response);
        const pageInfo = buildPageInfo(meta, items, 1);

        const initialScopeKey = buildCategoryScopeKey('visible-page', initialVisibleCategoryIds);
        const cacheKey = JSON.stringify({
          storeId: String(storeId),
          page: 1,
          categoryScope: initialScopeKey,
          categoryIds: initialVisibleCategoryIds.join(','),
          search: '',
        });

        productCacheRef.current.set(cacheKey, { items, pageInfo, ts: Date.now() });

        setProducts(items);
        setProductPageInfo(pageInfo);
        setCurrentPage(1);

        lastProductFilterRef.current = JSON.stringify({
          storeId: String(storeId),
          categoryScope: initialScopeKey,
          search: '',
        });

        if (!cancelled && bootstrapId === bootstrapRequestId.current) {
          bootstrappedRef.current = true;
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
  }, [
    storeId,
    loadStaticData,
    loadDrafts,
    resetSale,
    resetProductState,
    resetCategoryState,
  ]);

  /* ----- PRODUCTS RELOAD --------------------------------------------- */
  useEffect(() => {
    if (!storeId || !bootstrappedRef.current) return;

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
  }, [storeId, currentPage, currentFilterSignature, loadProducts]);

  /* ----- PRODUCT PREFETCH -------------------------------------------- */
  useEffect(() => {
    if (productPageInfo.hasNextPage) {
      void prefetchNextPage(productPageInfo.currentPage + 1);
    }
  }, [productPageInfo.currentPage, productPageInfo.hasNextPage, prefetchNextPage]);

  /* ----- FOCUS SEARCH WHEN IDLE -------------------------------------- */
  useEffect(() => {
    if (!storeLoading && !catalogLoading && !showPaymentModal && !showDraftModal) {
      focusSearchInput();
    }
  }, [storeLoading, catalogLoading, showPaymentModal, showDraftModal, focusSearchInput]);

  /* =====================================================================
     BILLING OPERATIONS
     ===================================================================== */
  const ensureDraft = async () => {
    if (billing?.billing_id) return billing;

    const response = await billingService.createDraft({
      store_id: Number(storeId),
      customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
      notes: notes || null,
    });

    const createdDraft = response?.data || response;
    const detail = await loadBillingDetail(createdDraft.billing_id, { silent: true });
    mergeDraftPreview(detail || createdDraft);
    return detail || createdDraft;
  };

  const addOrIncrementProduct = async (product) => {
    const current = await ensureDraft();
    const existing = current?.items?.find(
      (item) => String(item.product_id) === String(product.product_id)
    );

    if (existing) {
      await billingService.updateItem(existing.billing_item_id, {
        quantity: Number(existing.quantity) + 1,
        unit_price: existing.unit_price,
      });
    } else {
      await billingService.addItem(current.billing_id, {
        product_id: product.product_id,
        quantity: 1,
        unit_price: product.price,
      });
    }

    const updatedBilling = await loadBillingDetail(current.billing_id, { silent: true });
    setDrafts((prev) =>
      prev.filter((item) => String(item.billing_id) !== String(current.billing_id))
    );
    return updatedBilling;
  };

  const handleAddProduct = async (product) => {
    if (submitting) return;
    setError('');
    setSubmitting(true);

    try {
      await addOrIncrementProduct(product);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to add product.');
    } finally {
      setSubmitting(false);
    }
  };

  const openPaymentModalForBilling = (billingData) => {
    resetPaymentState(billingData?.total || '');
    setShowPaymentModal(true);
  };

  const handlePayNow = async (product) => {
    if (submitting) return;
    setError('');
    setSubmitting(true);

    try {
      const updatedBilling = await addOrIncrementProduct(product);
      openPaymentModalForBilling(updatedBilling);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to proceed to payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateItemQuantity = async (item, nextQuantity) => {
    if (!billing?.billing_id) return;
    if (nextQuantity < 1) return removeItem(item.billing_item_id);

    setError('');
    setSubmitting(true);

    try {
      await billingService.updateItem(item.billing_item_id, {
        quantity: nextQuantity,
        unit_price: item.unit_price,
      });
      const updatedBilling = await loadBillingDetail(billing.billing_id, { silent: true });
      mergeDraftPreview(updatedBilling);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to update quantity.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeItem = async (billingItemId) => {
    if (!billing?.billing_id) return;
    setError('');
    setSubmitting(true);

    try {
      await billingService.removeItem(billingItemId);
      const updatedBilling = await loadBillingDetail(billing.billing_id, { silent: true });
      mergeDraftPreview(updatedBilling);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to remove item.');
    } finally {
      setSubmitting(false);
    }
  };

  const persistDraftHeader = async () => {
    if (!billing?.billing_id) return null;

    await billingService.update(billing.billing_id, {
      customer_id: selectedCustomerId ? Number(selectedCustomerId) : null,
      notes: notes || null,
    });

    const updatedBilling = await loadBillingDetail(billing.billing_id, { silent: true });
    mergeDraftPreview(updatedBilling);
    return updatedBilling;
  };

  const handleSaveOrUpdateDraft = async () => {
    if (!billing?.items?.length) return;
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const updatedBilling = await persistDraftHeader();
      mergeDraftPreview(updatedBilling);
      setSuccess(
        updatedBilling?.billing_id
          ? `Draft #${updatedBilling.billing_id} updated successfully.`
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
    if (!billing?.items?.length) return;
    setError('');

    try {
      const currentBilling = await persistDraftHeader();
      openPaymentModalForBilling(currentBilling || billing);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to open payment.');
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
    if (!billing?.billing_id || !billing?.items?.length) return;
    if (!validatePayment()) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await persistDraftHeader();

      await billingService.charge(billing.billing_id, {
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

      const paidResponse = await billingService.show(billing.billing_id);
      const paidBilling = paidResponse?.data || paidResponse;

      openBillingPrint(paidBilling, currentStore, 'receipt', printSettings);

      removeDraftPreview(billing.billing_id);
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
      if (String(billing?.billing_id) === String(draftId)) resetSale();
      removeDraftPreview(draftId);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to delete draft.');
    } finally {
      setSubmitting(false);
    }
  };

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

    if (!billing?.billing_id && !billing?.items?.length && !search) {
      focusSearchInput(true);
      return;
    }

    const confirmed = window.confirm('Cancel the current sale and clear the active cart?');
    if (!confirmed) return;

    setError('');
    setSubmitting(true);

    try {
      if (billing?.billing_id) {
        await deleteBillingRecord(billing.billing_id);
        removeDraftPreview(billing.billing_id);
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
    billing,
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
        if (!submitting && billing?.items?.length) void handleSaveOrUpdateDraft();
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
        !showDraftModal;

      if (wantsCheckout && !submitting && billing?.items?.length) {
        event.preventDefault();
        void handleProceedToPayment();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [billing, submitting, showPaymentModal, showDraftModal, focusSearchInput, handleEscapeShortcut]);

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

  const selectedCustomer = useMemo(
    () => customers.find((c) => String(getCustomerId(c)) === String(selectedCustomerId)) || null,
    [customers, selectedCustomerId]
  );

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
    if (!productPageInfo.hasPrevPage || productsLoading) return;
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const goToNextPage = () => {
    if (!productPageInfo.hasNextPage || productsLoading) return;
    setCurrentPage((prev) => Math.min(prev + 1, productPageInfo.lastPage || prev + 1));
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
            <p><strong>No stores assigned</strong></p>
            <p className="muted" style={{ marginTop: 8 }}>
              Your account does not have any store assigned. Please contact your administrator.
            </p>
          </div>
        </div>
      </section>
    );
  }

  /* =====================================================================
     RENDER
     ===================================================================== */
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
                disabled={!visibleCategories.length}
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
                    ({categoryPageInfo.perPage} per page)
                  </span>
                </span>
              )}

              {categoriesLoading ? (
                <span className="muted" style={{ fontSize: 12 }}>
                  Loading categories...
                </span>
              ) : null}
            </div>
          </div>

          {catalogLoading ? (
            <div className="page-loader">Loading POS...</div>
          ) : (
            <>
              {error ? <div className="form-error">{error}</div> : null}
              {productsLoading ? <div className="page-loader">Loading products...</div> : null}

              <div className="products-grid products-grid-enhanced">
                {products.map((product) => {
                  const image = getProductImage(product);

                  return (
                    <article key={product.product_id} className="product-card">
                      <div
                        className="product-card-overlay"
                        style={{
                          backgroundImage: image
                            ? `url(${image})`
                            : `linear-gradient(135deg, #427E97 0%, #E17A38 100%)`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                          backgroundRepeat: 'no-repeat',
                        }}
                      >
                        <div className="product-card-actions">
                          <button
                            type="button"
                            className="primary-button pay-now-btn"
                            disabled={submitting}
                            onClick={() => handlePayNow(product)}
                          >
                            Pay Now
                          </button>
                          <button
                            type="button"
                            className="ghost-button add-btn"
                            disabled={submitting}
                            onClick={() => handleAddProduct(product)}
                          >
                            Add
                          </button>
                        </div>
                      </div>

                      <div className="product-card-info">
                        <h3>{product.product_name}</h3>
                        <strong>{currency(product.price, currentStore?.currency)}</strong>
                      </div>
                    </article>
                  );
                })}

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
                      disabled={!productPageInfo.hasPrevPage || productsLoading}
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
                      disabled={!productPageInfo.hasNextPage || productsLoading}
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
                  {billing ? billing.invnumber || `Draft #${billing.billing_id}` : 'No active billing yet'}
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
                    <strong>{selectedCustomer?.full_name || 'Selected Customer'}</strong>
                  </div>
                  <button
                    type="button"
                    className="change-customer-btn"
                    onClick={() => setSelectedCustomerId('')}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="form-grid">
                  <label>
                    Customer Account
                    <select
                      className="select-input"
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                    >
                      <option value="">Customer</option>
                      {customers.map((customer) => (
                        <option
                          key={String(getCustomerId(customer))}
                          value={String(getCustomerId(customer))}
                        >
                          {customer.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className="hero-quick-actions">
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
                          disabled={submitting}
                        >
                          <Minus size={14} />
                        </button>
                        <span className="quantity-display">{item.quantity}</span>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => updateItemQuantity(item, Number(item.quantity) + 1)}
                          disabled={submitting}
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
                        disabled={submitting}
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
                  <span className="summary-label">VAT ({Number(billing?.vat_rate || 16)}%)</span>
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

      {showPaymentModal ? (
        <div className="modal-backdrop" onClick={() => !submitting && setShowPaymentModal(false)}>
          <div className="modal-card payment-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Payment</h3>
                <p className="muted">{billing?.invnumber || `Draft #${billing?.billing_id || ''}`}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setShowPaymentModal(false)}
                disabled={submitting}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-content payment-modal-content">
              <div className="payment-summary-strip">
                <div className="payment-summary-pill">
                  <span>Total due</span>
                  <strong>{currency(billing?.total || 0, currentStore?.currency)}</strong>
                </div>
                <div className="payment-summary-pill">
                  <span>Items</span>
                  <strong>{itemCount}</strong>
                </div>
                {selectedCustomerId ? (
                  <div className="payment-summary-pill">
                    <span>Customer</span>
                    <strong>{selectedCustomer?.full_name || 'Selected'}</strong>
                  </div>
                ) : null}
              </div>

              <div className="payment-method-card-grid">
                {PAYMENT_METHODS.map((method) => {
                  const Icon = method.icon;
                  return (
                    <button
                      key={method.key}
                      type="button"
                      className={`payment-method-card ${paymentMethod === method.key ? 'active' : ''}`}
                      onClick={() => handlePaymentMethodChange(method.key)}
                    >
                      <div className="payment-method-card-top">
                        <span className="payment-method-icon"><Icon size={18} /></span>
                        <strong>{method.title}</strong>
                      </div>
                      <p>{method.description}</p>
                    </button>
                  );
                })}
              </div>

              {paymentMethod ? (
                <div className="payment-fields-card">
                  {paymentMethod === 'cash' ? (
                    <div className="form-grid two-columns payment-fields-grid">
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>
                          Amount to be paid
                          {selectedCustomer && (() => {
                            const activeBalance = Number(
                              billing?.customer?.current_balance ??
                              selectedCustomer?.current_balance ??
                              customerCurrentBalance ??
                              0
                            );
                            return activeBalance > 0 ? (
                              <span style={{ color: '#2563eb', fontWeight: 'bold', marginLeft: '6px' }}>
                                ({`+${activeBalance.toFixed(2)}`})
                              </span>
                            ) : null;
                          })()}
                        </span>
                        <input
                          className="text-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={amountReceived}
                          onChange={(e) => setAmountReceived(e.target.value)}
                          placeholder="Amount to be paid"
                        />
                      </label>

                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>Cash received</span>
                        <input
                          className="text-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={amountTendered}
                          onChange={(e) => setAmountTendered(e.target.value)}
                          placeholder="Cash tendered"
                        />
                      </label>

                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>Change</span>
                        <input
                          className="text-input"
                          type="text"
                          value={(() => {
                            const cashTendered = Number(amountTendered || 0);
                            const invoiceAmount = Number(amountReceived || billing?.total || 0);
                            const legacyDebt = selectedCustomer
                              ? Number(
                                  billing?.customer?.current_balance ??
                                  selectedCustomer?.current_balance ??
                                  customerCurrentBalance ??
                                  0
                                )
                              : 0;
                            const totalTarget = invoiceAmount + legacyDebt;
                            const realChange = cashTendered - totalTarget;
                            return realChange > 0 ? realChange.toFixed(2) : '0.00';
                          })()}
                          readOnly
                          placeholder="0.00"
                          style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}
                        />
                      </label>
                    </div>
                  ) : null}

                  {paymentMethod === 'mpesa' ? (
                    <div className="form-grid two-columns payment-fields-grid">
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>
                          Amount to be paid
                          {selectedCustomer && (() => {
                            const activeBalance = Number(
                              billing?.customer?.current_balance ??
                              selectedCustomer?.current_balance ??
                              customerCurrentBalance ??
                              0
                            );
                            return activeBalance > 0 ? (
                              <span style={{ color: '#2563eb', fontWeight: 'bold', marginLeft: '6px' }}>
                                ({`+${activeBalance.toFixed(2)}`})
                              </span>
                            ) : null;
                          })()}
                        </span>
                        <input
                          className="text-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={(() => {
                            const invoiceAmount = Number(billing?.total || 0);
                            const legacyDebt = selectedCustomer
                              ? Number(
                                  billing?.customer?.current_balance ??
                                  selectedCustomer?.current_balance ??
                                  customerCurrentBalance ??
                                  0
                                )
                              : 0;
                            return amountReceived || (invoiceAmount + legacyDebt).toFixed(2);
                          })()}
                          onChange={(e) => setAmountReceived(e.target.value)}
                          placeholder="Amount to be paid"
                        />
                      </label>

                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>MPESA phone number</span>
                        <input
                          className="text-input"
                          type="text"
                          value={mpesaPhone}
                          onChange={(e) => setMpesaPhone(e.target.value)}
                          placeholder="e.g. 07XXXXXXXX"
                        />
                      </label>

                      <label
                        className="span-2"
                        style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
                      >
                        <span>MPESA transaction code</span>
                        <input
                          className="text-input"
                          type="text"
                          value={mpesaCode}
                          onChange={(e) => setMpesaCode(e.target.value)}
                          placeholder="Enter transaction code"
                        />
                      </label>
                    </div>
                  ) : null}

                  {paymentMethod === 'card' ? (
                    <div className="form-grid two-columns payment-fields-grid">
                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>
                          Amount to be paid
                          {selectedCustomer && (() => {
                            const activeBalance = Number(
                              billing?.customer?.current_balance ??
                              selectedCustomer?.current_balance ??
                              customerCurrentBalance ??
                              0
                            );
                            return activeBalance > 0 ? (
                              <span style={{ color: '#2563eb', fontWeight: 'bold', marginLeft: '6px' }}>
                                ({`+${activeBalance.toFixed(2)}`})
                              </span>
                            ) : null;
                          })()}
                        </span>
                        <input
                          className="text-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={(() => {
                            const invoiceAmount = Number(billing?.total || 0);
                            const legacyDebt = selectedCustomer
                              ? Number(
                                  billing?.customer?.current_balance ??
                                  selectedCustomer?.current_balance ??
                                  customerCurrentBalance ??
                                  0
                                )
                              : 0;
                            return amountReceived || (invoiceAmount + legacyDebt).toFixed(2);
                          })()}
                          onChange={(e) => setAmountReceived(e.target.value)}
                          placeholder="Paid amount"
                        />
                      </label>

                      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span>Card holder</span>
                        <input
                          className="text-input"
                          type="text"
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value)}
                          placeholder="Card holder name"
                        />
                      </label>

                      <label
                        className="span-2"
                        style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
                      >
                        <span>Card reference</span>
                        <input
                          className="text-input"
                          type="text"
                          value={cardReference}
                          onChange={(e) => setCardReference(e.target.value)}
                          placeholder="POS slip or card reference"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="payment-empty-state">
                  <p>Select a payment method to show the required fields.</p>
                </div>
              )}

              <div className="payment-modal-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleCharge}
                  disabled={!billing?.items?.length || submitting || !paymentMethod}
                >
                  Charge Payment
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setShowPaymentModal(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showDraftModal ? (
        <div className="modal-backdrop" onClick={() => setShowDraftModal(false)}>
          <div className="modal-card draft-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Saved Drafts</h3>
                <p className="muted">Only your drafts for this store are shown</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setShowDraftModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="toolbar-row pos-toolbar-wrap" style={{ marginBottom: 12 }}>
              <div className="search-shell">
                <Search className="search-icon-pos" size={16} />
                <input
                  value={draftSearch}
                  onChange={(e) => setDraftSearch(e.target.value)}
                  placeholder="Search drafts by invoice, customer, phone, email or note"
                />
              </div>
            </div>

            <div className="draft-modal-list">
              {draftsLoading ? (
                <div className="empty-draft-state">
                  <p>Loading drafts...</p>
                </div>
              ) : filteredDrafts.length ? (
                filteredDrafts.map((draft) => (
                  <div
                    key={draft.billing_id}
                    className={`draft-modal-row ${
                      String(billing?.billing_id) === String(draft.billing_id) ? 'active' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="draft-modal-row-main"
                      onClick={() => handleLoadDraft(draft.billing_id)}
                    >
                      <div className="draft-modal-main">
                        <strong>{draft.invnumber || `Draft #${draft.billing_id}`}</strong>
                        <p>{draft.customer?.full_name || 'Customer'}</p>
                        {draft.customer?.phone ? <small>{draft.customer.phone}</small> : null}
                        {draft.customer?.email ? <small>{draft.customer.email}</small> : null}
                        {draft.notes ? <span className="draft-note">{draft.notes}</span> : null}
                      </div>
                      <div className="align-right draft-side-meta">
                        <strong>{currency(draft.total || 0, currentStore?.currency)}</strong>
                        <p>{formatDateTime(draft.billing_date)}</p>
                      </div>
                    </button>

                    <div className="draft-modal-actions">
                      <button
                        type="button"
                        className="ghost-button draft-edit-button"
                        onClick={() => handleLoadDraft(draft.billing_id)}
                        disabled={submitting}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="ghost-button danger-button"
                        onClick={() => handleDeleteDraft(draft.billing_id)}
                        disabled={submitting}
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-draft-state">
                  <p>No drafts matched your search.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
