import { useEffect, useMemo } from 'react';
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

  // Only reset filters/modal/form when the store actually changes —
  // not on every ui-state update.
  useEffect(() => {
    ui.resetForStoreChange();
  }, [storeId, ui.resetForStoreChange]);

  const inventoryQuery = useQuery({
    queryKey: ['inventory', storeId, ui.inventoryPage, ui.pageSize, debouncedSearch],
    enabled: Boolean(storeId),
    placeholderData: sameStorePlaceholder(storeId),
    queryFn: ({ signal }) =>
      inventoryService.list(
        {
          store_id: storeId,
          page: ui.inventoryPage,
          per_page: ui.pageSize,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        { signal }
      ),
    select: (response) => toPaginatedResult(response, ui.pageSize),
  });

  const historyQuery = useQuery({
    queryKey: ['inventory-history', storeId, ui.historyPage, ui.historyPageSize, debouncedSearch],
    enabled: Boolean(storeId),
    placeholderData: sameStorePlaceholder(storeId),
    queryFn: ({ signal }) =>
      inventoryService.history(
        {
          store_id: storeId,
          page: ui.historyPage,
          per_page: ui.historyPageSize,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        },
        { signal }
      ),
    select: (response) => toPaginatedResult(response, ui.historyPageSize),
  });

  // Only fetch the products dropdown while the modal is actually open.
  const productsQuery = useQuery({
    queryKey: ['products', storeId, 'inventory-form'],
    enabled: Boolean(storeId && ui.showModal),
    staleTime: 5 * 60 * 1000,
    queryFn: ({ signal }) =>
      productService.list({ store_id: storeId, per_page: 100 }, { signal }),
    select: extractList,
  });

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
    if (inventoryQuery.isError) {
      return getErrorMessage(inventoryQuery.error, 'Unable to load inventory.');
    }
    if (historyQuery.isError) {
      return getErrorMessage(historyQuery.error, 'Unable to load inventory history.');
    }
    return '';
  }, [inventoryQuery.isError, inventoryQuery.error, historyQuery.isError, historyQuery.error]);

  const modalError = useMemo(() => {
    if (ui.formError) return ui.formError;
    if (productsQuery.isError) {
      return getErrorMessage(productsQuery.error, 'Unable to load products.');
    }
    return '';
  }, [ui.formError, productsQuery.isError, productsQuery.error]);

  const saveMutation = useMutation({
    mutationFn: async ({ inventoryId, payload }) => {
      if (inventoryId) {
        return inventoryService.update(inventoryId, payload);
      }
      return inventoryService.create(payload);
    },
    onSuccess: async () => {
      ui.setShowModal(false);
      ui.resetForm();
      ui.setInventoryPage(1);
      ui.setHistoryPage(1);

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

  const handleSearchChange = (e) => {
    ui.setSearch(e.target.value);
    ui.setInventoryPage(1);
    ui.setHistoryPage(1);
  };

  const handleSubmit = (e) => {
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
  };

  const handleDelete = (inventoryId) => {
    if (!window.confirm('Delete this inventory row? Quantity must be zero.')) return;
    deleteMutation.mutate(inventoryId);
  };

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
          onPageSizeChange={(e) => {
            ui.setPageSize(Number(e.target.value));
            ui.setInventoryPage(1);
          }}
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
          onPreviousPage={() =>
            ui.setInventoryPage(Math.max((inventoryPagination.current_page || 1) - 1, 1))
          }
          onNextPage={() =>
            ui.setInventoryPage(
              Math.min((inventoryPagination.current_page || 1) + 1, inventoryPagination.last_page || 1)
            )
          }
        />

        <InventoryHistoryTable
          storeId={storeId}
          isLoading={historyQuery.isLoading}
          isFetching={historyQuery.isFetching}
          rows={historyRows}
          pagination={historyPagination}
          pageSize={ui.historyPageSize}
          onPageSizeChange={(e) => {
            ui.setHistoryPageSize(Number(e.target.value));
            ui.setHistoryPage(1);
          }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPreviousPage={() =>
            ui.setHistoryPage(Math.max((historyPagination.current_page || 1) - 1, 1))
          }
          onNextPage={() =>
            ui.setHistoryPage(
              Math.min((historyPagination.current_page || 1) + 1, historyPagination.last_page || 1)
            )
          }
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
