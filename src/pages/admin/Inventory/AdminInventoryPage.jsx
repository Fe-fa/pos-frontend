import { useCallback, useEffect, useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { inventoryService } from '../../../services/inventoryService';
import { productService } from '../../../services/productService';
import { useStore } from '../../../contexts/StoreContext';
import { useAuth } from '../../../contexts/AuthContext';
import { EMPTY_META } from '../../../utils/pagination';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';

import {
  InventoryAdminUIProvider,
  useInventoryAdminUI,
  PAGE_SIZE_OPTIONS,
} from '../../../contexts/Inventoryadminuicontext';
import {
  extractList,
  getErrorMessage,
  getInventoryStatus,
  toPaginatedResult,
  sameStorePlaceholder,
} from './inventoryHelpers';

import InventoryHeaderToolbar from './InventoryHeaderToolbar';
import InventoryTable from './InventoryTable';
import InventoryHistoryTable from './InventoryHistoryTable';
import InventoryFormModal from './InventoryFormModal';

export default function AdminInventoryPage() {
  return (
    <InventoryAdminUIProvider>
      <AdminInventoryPageContent />
    </InventoryAdminUIProvider>
  );
}

function AdminInventoryPageContent() {
  const { can } = useAuth();
  const canManage = can('inventory.manage');
  const { storeId } = useStore();
  const queryClient = useQueryClient();
  const ui = useInventoryAdminUI();

  const debouncedSearch = useDebouncedValue(ui.search, 300);

  // Reset filters/modal/form only when the store changes.
  useEffect(() => {
    ui.resetForStoreChange();
  }, [storeId, ui.resetForStoreChange]);

  // ── inventory list query ──────────────────────────────────────────────────
  // pageSize starts as null. On the first request we omit per_page so the
  // backend applies its own default. The select callback returns meta.per_page
  // so we can seed ui.pageSize once.
  const inventoryQuery = useQuery({
    queryKey: ['inventory', storeId, ui.inventoryPage, ui.pageSize, debouncedSearch],
    enabled: Boolean(storeId),
    placeholderData: sameStorePlaceholder(storeId),
    queryFn: ({ signal }) =>
      inventoryService.list(
        {
          store_id: storeId,
          page: ui.inventoryPage,
          // Omit per_page on first load (null) so backend default takes effect.
          ...(ui.pageSize !== null ? { per_page: ui.pageSize } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        { signal }
      ),
    select: (response) => toPaginatedResult(response, ui.pageSize ?? undefined),
  });

  // Seed pageSize from the first successful response — runs once.
  useEffect(() => {
    if (ui.pageSize === null && inventoryQuery.data?.perPage) {
      ui.setPageSize(inventoryQuery.data.perPage);
    }
  }, [ui.pageSize, inventoryQuery.data?.perPage, ui.setPageSize]);

  // ── history query ─────────────────────────────────────────────────────────
  const historyQuery = useQuery({
    queryKey: ['inventory-history', storeId, ui.historyPage, ui.historyPageSize, debouncedSearch],
    enabled: Boolean(storeId),
    placeholderData: sameStorePlaceholder(storeId),
    queryFn: ({ signal }) =>
      inventoryService.history(
        {
          store_id: storeId,
          page: ui.historyPage,
          ...(ui.historyPageSize !== null ? { per_page: ui.historyPageSize } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        { signal }
      ),
    select: (response) => toPaginatedResult(response, ui.historyPageSize ?? undefined),
  });

  // Seed historyPageSize from the first successful history response.
  useEffect(() => {
    if (ui.historyPageSize === null && historyQuery.data?.perPage) {
      ui.setHistoryPageSize(historyQuery.data.perPage);
    }
  }, [ui.historyPageSize, historyQuery.data?.perPage, ui.setHistoryPageSize]);

  // ── products dropdown — only fetched while the modal is open ─────────────
  const productsQuery = useQuery({
    queryKey: ['products', storeId, 'inventory-form'],
    enabled: Boolean(storeId && ui.showModal),
    staleTime: 5 * 60 * 1000,
    queryFn: ({ signal }) =>
      productService.list({ store_id: storeId, per_page: 100 }, { signal }),
    select: extractList,
  });

  // ── derived values ────────────────────────────────────────────────────────
  const inventoryRows = inventoryQuery.data?.rows || [];
  const inventoryPagination = inventoryQuery.data?.pagination || { ...EMPTY_META };

  const historyRows = historyQuery.data?.rows || [];
  const historyPagination = historyQuery.data?.pagination || { ...EMPTY_META };

  const products = productsQuery.data || [];

  const lowStockCount = useMemo(
    () => inventoryRows.filter((row) => getInventoryStatus(row).tone === 'low').length,
    [inventoryRows]
  );

  const pageError = useMemo(() => {
    if (inventoryQuery.isError)
      return getErrorMessage(inventoryQuery.error, 'Unable to load inventory.');
    if (historyQuery.isError)
      return getErrorMessage(historyQuery.error, 'Unable to load inventory history.');
    return '';
  }, [inventoryQuery.isError, inventoryQuery.error, historyQuery.isError, historyQuery.error]);

  const modalError = useMemo(() => {
    if (ui.formError) return ui.formError;
    if (productsQuery.isError)
      return getErrorMessage(productsQuery.error, 'Unable to load products.');
    return '';
  }, [ui.formError, productsQuery.isError, productsQuery.error]);

  // ── mutations ─────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ inventoryId, payload }) =>
      inventoryId
        ? inventoryService.update(inventoryId, payload)
        : inventoryService.create(payload),
    onSuccess: async () => {
      ui.setShowModal(false);
      ui.resetForm();
      ui.setInventoryPage(1);
      ui.setHistoryPage(1);

      // Invalidate both lists in parallel — no need to await sequentially.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-history', storeId] }),
      ]);
    },
    onError: (err) => {
      ui.setFormError(getErrorMessage(err, 'Unable to save inventory.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (inventoryId) => inventoryService.remove(inventoryId),
    onSuccess: async () => {
      // If we deleted the last row on a non-first page, step back one page.
      const nextPage =
        inventoryRows.length === 1 && inventoryPagination.current_page > 1
          ? inventoryPagination.current_page - 1
          : inventoryPagination.current_page || 1;

      if (nextPage !== ui.inventoryPage) {
        ui.setInventoryPage(nextPage);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-history', storeId] }),
      ]);
    },
    onError: (err) => {
      ui.setFormError('');
      window.alert(getErrorMessage(err, 'Unable to delete inventory.'));
    },
  });

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleSearchChange = useCallback(
    (e) => {
      ui.setSearch(e.target.value);
      ui.setInventoryPage(1);
      ui.setHistoryPage(1);
    },
    [ui.setSearch, ui.setInventoryPage, ui.setHistoryPage]
  );

  const handlePageSizeChange = useCallback(
    (e) => {
      ui.setPageSize(Number(e.target.value));
      ui.setInventoryPage(1);
    },
    [ui.setPageSize, ui.setInventoryPage]
  );

  const handleHistoryPageSizeChange = useCallback(
    (e) => {
      ui.setHistoryPageSize(Number(e.target.value));
      ui.setHistoryPage(1);
    },
    [ui.setHistoryPageSize, ui.setHistoryPage]
  );

  const handlePreviousInventoryPage = useCallback(
    () =>
      ui.setInventoryPage(Math.max((inventoryPagination.current_page || 1) - 1, 1)),
    [ui.setInventoryPage, inventoryPagination.current_page]
  );

  const handleNextInventoryPage = useCallback(
    () =>
      ui.setInventoryPage(
        Math.min(
          (inventoryPagination.current_page || 1) + 1,
          inventoryPagination.last_page || 1
        )
      ),
    [ui.setInventoryPage, inventoryPagination.current_page, inventoryPagination.last_page]
  );

  const handlePreviousHistoryPage = useCallback(
    () =>
      ui.setHistoryPage(Math.max((historyPagination.current_page || 1) - 1, 1)),
    [ui.setHistoryPage, historyPagination.current_page]
  );

  const handleNextHistoryPage = useCallback(
    () =>
      ui.setHistoryPage(
        Math.min(
          (historyPagination.current_page || 1) + 1,
          historyPagination.last_page || 1
        )
      ),
    [ui.setHistoryPage, historyPagination.current_page, historyPagination.last_page]
  );

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!storeId) return;

      ui.setFormError('');

      const payload = {
        store_id: Number(storeId),
        product_id: Number(ui.form.product_id),
        batch_no: ui.form.batch_no.trim(),
        quantity: Number(ui.form.quantity),
        reorder_level: Number(ui.form.reorder_level || 0),
      };

      saveMutation.mutate({ inventoryId: ui.editingId, payload });
    },
    [storeId, ui, saveMutation]
  );

  const handleDelete = useCallback(
    (inventoryId) => {
      if (!window.confirm('Delete this inventory row? Quantity must be zero.')) return;
      deleteMutation.mutate(inventoryId);
    },
    [deleteMutation]
  );

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <section className="inventory-page stack-lg">
        <InventoryHeaderToolbar
          total={inventoryPagination.total}
          lowStockCount={lowStockCount}
          isRefreshing={inventoryQuery.isFetching && inventoryRows.length > 0}
          storeId={storeId}
          canManage={canManage}
          onAddClick={ui.openCreateModal}
          search={ui.search}
          onSearchChange={handleSearchChange}
          pageSize={ui.pageSize}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />

        {pageError && !ui.showModal ? <p className="form-error">{pageError}</p> : null}

        <InventoryTable
          storeId={storeId}
          isLoading={inventoryQuery.isLoading}
          isFetching={inventoryQuery.isFetching}
          rows={inventoryRows}
          pagination={inventoryPagination}
          canManage={canManage}
          deletePending={deleteMutation.isPending}
          onEdit={ui.openEditModal}
          onDelete={handleDelete}
          onPreviousPage={handlePreviousInventoryPage}
          onNextPage={handleNextInventoryPage}
        />

        <InventoryHistoryTable
          storeId={storeId}
          isLoading={historyQuery.isLoading}
          isFetching={historyQuery.isFetching}
          rows={historyRows}
          pagination={historyPagination}
          pageSize={ui.historyPageSize}
          onPageSizeChange={handleHistoryPageSizeChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPreviousPage={handlePreviousHistoryPage}
          onNextPage={handleNextHistoryPage}
        />
      </section>

      {ui.showModal ? (
        <InventoryFormModal
          editingId={ui.editingId}
          form={ui.form}
          setForm={ui.setForm}
          products={products}
          productsLoading={productsQuery.isLoading}
          modalError={modalError}
          saving={saveMutation.isPending}
          canManage={canManage}
          onSubmit={handleSubmit}
          onClose={ui.closeModal}
        />
      ) : null}
    </>
  );
}
