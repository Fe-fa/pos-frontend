import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  // Inventory search
  const debouncedInventorySearch = useDebouncedValue(ui.search, 300);

  // Dedicated history searches
  const [historySearch, setHistorySearch] = useState('');
  const [modalHistorySearch, setModalHistorySearch] = useState('');

  // Description / reason field used by modal
  const [modalDescription, setModalDescription] = useState('');

  // Stock level filter: 'all' | 'below' | 'above' (relative to reorder level)
  const [reorderFilter, setReorderFilter] = useState('all');

  const debouncedHistorySearch = useDebouncedValue(historySearch, 300);
  const debouncedModalHistorySearch = useDebouncedValue(modalHistorySearch, 300);

  useEffect(() => {
    ui.resetForStoreChange();
    setHistorySearch('');
    setModalHistorySearch('');
    setModalDescription('');
    setReorderFilter('all');
  }, [storeId, ui.resetForStoreChange]);

  useEffect(() => {
    if (!ui.showModal) {
      setModalHistorySearch('');
      setModalDescription('');
      return;
    }

    // reset when switching modal row/mode
    setModalHistorySearch('');
    setModalDescription('');
  }, [ui.showModal, ui.editingId, ui.modalMode]);

  // ── inventory list query ──────────────────────────────────────────────────
  const inventoryQuery = useQuery({
    queryKey: ['inventory', storeId, ui.inventoryPage, ui.pageSize, debouncedInventorySearch],
    enabled: Boolean(storeId),
    placeholderData: sameStorePlaceholder(storeId),
    queryFn: ({ signal }) =>
      inventoryService.list(
        {
          store_id: storeId,
          page: ui.inventoryPage,
          ...(ui.pageSize !== null ? { per_page: ui.pageSize } : {}),
          ...(debouncedInventorySearch ? { search: debouncedInventorySearch } : {}),
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
    queryKey: ['inventory-history', storeId, ui.historyPage, ui.historyPageSize, debouncedHistorySearch],
    enabled: Boolean(storeId),
    placeholderData: sameStorePlaceholder(storeId),
    queryFn: ({ signal }) =>
      inventoryService.history(
        {
          store_id: storeId,
          page: ui.historyPage,
          ...(ui.historyPageSize !== null ? { per_page: ui.historyPageSize } : {}),
          ...(debouncedHistorySearch ? { search: debouncedHistorySearch } : {}),
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

// ── modal history query ───────────────────────────────────────────────────
const modalHistoryQuery = useQuery({
  queryKey: [
    'inventory-history',
    storeId,
    ui.editingId,
    ui.editingRow?.product?.product_id,   // ← add product_id to key
    ui.modalMode,
    debouncedModalHistorySearch,
    'modal',
  ],
  enabled: Boolean(
    storeId &&
    ui.showModal &&
    ui.editingId &&
    (ui.modalMode === 'edit' || ui.modalMode === 'restock' || ui.modalMode === 'adjust')
  ),
  staleTime: 30_000,
  queryFn: ({ signal }) =>
    inventoryService.history(
      {
        store_id: storeId,
        product_id: ui.editingRow?.product?.product_id,  // ← swap inventory_id → product_id
        ...(debouncedModalHistorySearch ? { search: debouncedModalHistorySearch } : {}),
      },
      { signal }
    ),
  select: (response) => toPaginatedResult(response),
});

  // ── derived values ────────────────────────────────────────────────────────
  const rawInventoryRows = inventoryQuery.data?.rows || [];
  const inventoryPagination = inventoryQuery.data?.pagination || { ...EMPTY_META };
  const historyRows = historyQuery.data?.rows || [];
  const historyPagination = historyQuery.data?.pagination || { ...EMPTY_META };
  const modalHistoryRows = modalHistoryQuery.data?.rows || [];
  const products = productsQuery.data || [];

  // ── reorder-level filtering (client-side, applied to current page) ────────
  const inventoryRows = useMemo(() => {
    if (reorderFilter === 'all') return rawInventoryRows;

    return rawInventoryRows.filter((row) => {
      const quantity = Number(row.quantity || 0);
      const reorder = Number(row.reorder_level || 0);
      const isBelow = quantity <= reorder;
      return reorderFilter === 'below' ? isBelow : !isBelow;
    });
  }, [rawInventoryRows, reorderFilter]);

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
    if (modalHistoryQuery.isError)
      return getErrorMessage(modalHistoryQuery.error, 'Unable to load layer history.');
    return '';
  }, [ui.formError, productsQuery.isError, productsQuery.error, modalHistoryQuery.isError, modalHistoryQuery.error]);

  // ── mutations ─────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async ({ inventoryId, payload, mode }) => {
      if (!inventoryId)      return inventoryService.create(payload);
      if (mode === 'adjust') return inventoryService.adjust(inventoryId, payload);
      return inventoryService.update(inventoryId, payload); // 'restock' + 'edit'
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory', storeId] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-history', storeId] }),
      ]);

      const queue = bulkQueueRef.current;
      const nextIndex = queue.index + 1;

      if (queue.rows.length > 0 && nextIndex < queue.rows.length) {
        bulkQueueRef.current = { ...queue, index: nextIndex };
        ui.openEditModal(queue.rows[nextIndex], queue.mode);
      } else {
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
    },
    [ui.setSearch, ui.setInventoryPage]
  );

  const handleHistorySearchChange = useCallback(
    (e) => {
      setHistorySearch(e.target.value);
      ui.setHistoryPage(1);
    },
    [ui.setHistoryPage]
  );

  const handleModalHistorySearchChange = useCallback((e) => {
    setModalHistorySearch(e.target.value);
  }, []);

  const handleReorderFilterChange = useCallback((e) => {
    setReorderFilter(e.target.value);
  }, []);

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
      const reason = modalDescription.trim() || null;

      // edit — no quantity, only batch_no + reorder_level + description
      if (mode === 'edit') {
        const payload = {
          store_id: Number(storeId),
          product_id: Number(ui.form.product_id),
          batch_no: ui.form.batch_no.trim(),
          reorder_level: Number(ui.form.reorder_level || 0),
          ...(reason ? { reason } : {}),
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
          quantity: delta,
          reorder_level: Number(ui.form.reorder_level || 0),
          ...(reason ? { reason } : {}),
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
        store_id: Number(storeId),
        product_id: Number(ui.form.product_id),
        batch_no: ui.form.batch_no.trim(),
        quantity: qty,
        reorder_level: Number(ui.form.reorder_level || 0),
        ...(reason ? { reason } : {}),
      };
      saveMutation.mutate({ inventoryId: ui.editingId, payload, mode });
    },
    [storeId, ui, saveMutation, modalDescription]
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

  // ── Print report handler ──────────────────────────────────────────────────
  const handlePrintReport = useCallback(() => {
    const escapeHtml = (val) =>
      String(val ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[c]));

    const rowsHtml = inventoryRows
      .map((row) => {
        const status = getInventoryStatus(row);
        return `
          <tr>
            <td>${escapeHtml(row.product?.product_name || 'Unknown product')}</td>
            <td>${escapeHtml(row.product?.sku || '')}</td>
            <td>${escapeHtml(row.product?.category?.category_name || '')}</td>
            <td>${escapeHtml(row.batch_no || '—')}</td>
            <td>${escapeHtml(row.quantity)}</td>
            <td>${escapeHtml(row.reorder_level || 0)}</td>
            <td>${escapeHtml(status.label)}</td>
          </tr>
        `;
      })
      .join('');

    const filterLabel =
      reorderFilter === 'below'
        ? 'Below Reorder Level (Low Stock)'
        : reorderFilter === 'above'
        ? 'Above Reorder Level (Healthy)'
        : 'All Items';

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      window.alert('Please allow pop-ups to print the inventory report.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Inventory Report — Store ${escapeHtml(storeId || '-')}</title>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            th { background: #f3f4f6; }
            tfoot td { font-weight: bold; }
            @media print {
              body { margin: 0.5in; }
            }
          </style>
        </head>
        <body>
          <h1>Inventory Report</h1>
          <div class="meta">
            Store ID: ${escapeHtml(storeId || '-')} &nbsp;|&nbsp;
            Filter: ${escapeHtml(filterLabel)} &nbsp;|&nbsp;
            Generated: ${escapeHtml(new Date().toLocaleString())} &nbsp;|&nbsp;
            Rows: ${inventoryRows.length}
          </div>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Batch No</th>
                <th>Quantity</th>
                <th>Reorder Level</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="7" style="text-align:center;">No rows to display.</td></tr>'}
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => {
      printWindow.print();
    };
  }, [inventoryRows, storeId, reorderFilter]);

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
          onPrint={handlePrintReport}
          onBulkAction={handleBulkAction}
          selectedCount={ui.selectedIds.size}
          reorderFilter={reorderFilter}
          onReorderFilterChange={handleReorderFilterChange}
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
          search={historySearch}
          onSearchChange={handleHistorySearchChange}
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
          editingRow={ui.editingRow}
          recentHistory={modalHistoryRows}
          historyLoading={modalHistoryQuery.isFetching}
          historySearch={modalHistorySearch}
          onHistorySearchChange={handleModalHistorySearchChange}
          description={modalDescription}
          onDescriptionChange={setModalDescription}
        />
      ) : null}
    </>
  );
}