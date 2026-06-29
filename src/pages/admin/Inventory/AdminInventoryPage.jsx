import { useCallback, useEffect, useMemo, useRef } from 'react';
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

  // Tracks rows queued for sequential bulk restock/adjust
  const bulkQueueRef = useRef({ rows: [], mode: null, index: 0 });

  const debouncedSearch = useDebouncedValue(ui.search, 300);

  useEffect(() => {
    ui.resetForStoreChange();
  }, [storeId, ui.resetForStoreChange]);

  // ── inventory list query ──────────────────────────────────────────────────
  const inventoryQuery = useQuery({
    queryKey: ['inventory', storeId, ui.inventoryPage, ui.pageSize, debouncedSearch],
    enabled: Boolean(storeId),
    placeholderData: sameStorePlaceholder(storeId),
    queryFn: ({ signal }) =>
      inventoryService.list(
        {
          store_id: storeId,
          page: ui.inventoryPage,
          ...(ui.pageSize !== null ? { per_page: ui.pageSize } : {}),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        { signal }
      ),
    select: (response) => toPaginatedResult(response, ui.pageSize ?? undefined),
  });

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

  useEffect(() => {
    if (ui.historyPageSize === null && historyQuery.data?.perPage) {
      ui.setHistoryPageSize(historyQuery.data.perPage);
    }
  }, [ui.historyPageSize, historyQuery.data?.perPage, ui.setHistoryPageSize]);

  // ── products dropdown ─────────────────────────────────────────────────────
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

  const totalSkus = inventoryPagination.total || 0;

  const totalValue = useMemo(
    () =>
      inventoryRows.reduce((sum, row) => {
        const price = Number(row.product?.price || 0);
        const qty = Number(row.quantity || 0);
        return sum + price * qty;
      }, 0),
    [inventoryRows]
  );

  const lowStockCount = useMemo(
    () =>
      inventoryRows.filter((row) => {
        const s = getInventoryStatus(row);
        return s.tone === 'low' || s.tone === 'critical';
      }).length,
    [inventoryRows]
  );

  const deadStockCount = useMemo(
    () => inventoryRows.filter((row) => Number(row.quantity || 0) === 0).length,
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
    mutationFn: async ({ inventoryId, payload, mode }) => {
      if (!inventoryId)        return inventoryService.create(payload);
      if (mode === 'adjust')   return inventoryService.adjust(inventoryId, payload);
      return inventoryService.update(inventoryId, payload); // 'restock' + 'edit'
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-history', storeId] }),
      ]);

      // Advance bulk queue if one is active
      const queue = bulkQueueRef.current;
      const nextIndex = queue.index + 1;

      if (queue.rows.length > 0 && nextIndex < queue.rows.length) {
        bulkQueueRef.current = { ...queue, index: nextIndex };
        ui.openEditModal(queue.rows[nextIndex], queue.mode);
      } else {
        // Queue done or single-item save — close and clean up
        bulkQueueRef.current = { rows: [], mode: null, index: 0 };
        ui.setShowModal(false);
        ui.resetForm();
        ui.setInventoryPage(1);
        ui.setHistoryPage(1);
        ui.clearSelection();
      }
    },
    onError: (err) => {
      ui.setFormError(getErrorMessage(err, 'Unable to save inventory.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (inventoryId) => inventoryService.remove(inventoryId),
    onSuccess: async () => {
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
    () => ui.setInventoryPage(Math.max((inventoryPagination.current_page || 1) - 1, 1)),
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
    () => ui.setHistoryPage(Math.max((historyPagination.current_page || 1) - 1, 1)),
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

  // ── Bulk action handler ───────────────────────────────────────────────────
  const handleBulkAction = useCallback(
    (action) => {
      const ids = Array.from(ui.selectedIds);
      if (!ids.length) {
        window.alert('Select at least one row first.');
        return;
      }

      if (action === 'delete') {
        if (!window.confirm(`Delete ${ids.length} selected row(s)? Quantity must be zero.`)) return;
        Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)))
          .then(() => ui.clearSelection())
          .catch((err) => window.alert(getErrorMessage(err, 'Bulk delete failed.')));
        return;
      }

      // restock / adjust — open modal sequentially for each selected row
      const mode = action; // 'restock' | 'adjust'
      const rows = inventoryRows.filter((r) => ids.includes(r.inventory_id));
      if (!rows.length) return;

      bulkQueueRef.current = { rows, mode, index: 0 };
      ui.openEditModal(rows[0], mode);
    },
    [ui, inventoryRows, deleteMutation]
  );

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!storeId) return;
      ui.setFormError('');

      const mode = ui.modalMode;

      // edit — no quantity, only batch_no + reorder_level
      if (mode === 'edit') {
        const payload = {
          store_id:      Number(storeId),
          product_id:    Number(ui.form.product_id),
          batch_no:      ui.form.batch_no.trim(),
          reorder_level: Number(ui.form.reorder_level || 0),
        };
        saveMutation.mutate({ inventoryId: ui.editingId, payload, mode });
        return;
      }

      // adjust — signed delta, cannot be zero
      if (mode === 'adjust') {
        const delta = parseInt(ui.form.quantity, 10);
        if (isNaN(delta) || delta === 0) {
          ui.setFormError('Adjustment amount cannot be zero.');
          return;
        }
        const payload = {
          quantity:      delta,
          reorder_level: Number(ui.form.reorder_level || 0),
        };
        saveMutation.mutate({ inventoryId: ui.editingId, payload, mode });
        return;
      }

      // restock or create — quantity >= 1
      const qty = parseInt(ui.form.quantity, 10);
      if (isNaN(qty) || qty < 1) {
        ui.setFormError('Quantity must be at least 1.');
        return;
      }
      const payload = {
        store_id:      Number(storeId),
        product_id:    Number(ui.form.product_id),
        batch_no:      ui.form.batch_no.trim(),
        quantity:      qty,
        reorder_level: Number(ui.form.reorder_level || 0),
      };
      saveMutation.mutate({ inventoryId: ui.editingId, payload, mode });
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

  // ── Export handler ────────────────────────────────────────────────────────
  const handleExport = useCallback(
    (format) => {
      if (format === 'csv') {
        const headers = ['Product', 'SKU', 'Category', 'Batch No', 'Quantity', 'Reorder Level', 'Status'];
        const csvRows = inventoryRows.map((row) => {
          const status = getInventoryStatus(row);
          return [
            row.product?.product_name || '',
            row.product?.sku || '',
            row.product?.category?.category_name || '',
            row.batch_no || '',
            row.quantity,
            row.reorder_level || 0,
            status.label,
          ].join(',');
        });
        const csv = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventory-${storeId}-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        window.alert('PDF export requires a server-side endpoint. CSV is available.');
      }
    },
    [inventoryRows, storeId]
  );

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <section className="inventory-page stack-lg">
        <InventoryHeaderToolbar
          total={inventoryPagination.total}
          totalSkus={totalSkus}
          totalValue={totalValue}
          lowStockCount={lowStockCount}
          deadStockCount={deadStockCount}
          isRefreshing={inventoryQuery.isFetching && inventoryRows.length > 0}
          storeId={storeId}
          canManage={canManage}
          onAddClick={ui.openCreateModal}
          search={ui.search}
          onSearchChange={handleSearchChange}
          pageSize={ui.pageSize}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onExport={handleExport}
          onBulkAction={handleBulkAction}
          selectedCount={ui.selectedIds.size}
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
          selectedIds={ui.selectedIds}
          onToggleSelect={ui.toggleSelectRow}
          onSelectAll={ui.selectAll}
          onClearSelection={ui.clearSelection}
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
          mode={ui.modalMode}
          currentQty={ui.editingRow?.quantity}
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