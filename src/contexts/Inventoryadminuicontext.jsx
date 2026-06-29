import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

const initialForm = {
  product_id: '',
  batch_no: '',
  quantity: '',
  reorder_level: 0,
};

const InventoryAdminUIContext = createContext(null);

export function useInventoryAdminUI() {
  const context = useContext(InventoryAdminUIContext);
  if (!context) {
    throw new Error('useInventoryAdminUI must be used inside InventoryAdminUIProvider');
  }
  return context;
}

export function InventoryAdminUIProvider({ children }) {
  const [search, setSearch] = useState('');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);

  // null = not yet seeded — seeded from the first successful API response
  const [pageSize, setPageSize] = useState(null);
  const [historyPageSize, setHistoryPageSize] = useState(null);

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [modalMode, setModalMode] = useState(null);
  const [editingRow, setEditingRow] = useState(null);

  const resetForm = useCallback(() => {
    setForm(initialForm);
    setEditingId(null);
    setFormError('');
    setModalMode(null);
    setEditingRow(null);
  }, []);

  const toggleSelectRow = useCallback((inventoryId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(inventoryId) ? next.delete(inventoryId) : next.add(inventoryId);
      return next;
    });
  }, []);

  const selectAll = useCallback((rows) => {
    setSelectedIds(new Set(rows.map((r) => r.inventory_id)));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setShowModal(true);
  }, [resetForm]);

  const openEditModal = useCallback((row, mode = 'edit') => {
    setEditingId(row.inventory_id);
    setEditingRow(row);
    setModalMode(mode);
    setForm({
      product_id:    row.product_id,
      batch_no:      row.batch_no || '',
      quantity:      '',
      reorder_level: row.reorder_level || 0,
    });
    setFormError('');
    setShowModal(true);
  }, []);

  const closeModal = useCallback((busy = false) => {
    if (busy) return;
    setShowModal(false);
    resetForm();
  }, [resetForm]);

  const resetForStoreChange = useCallback(() => {
    setSearch('');
    setInventoryPage(1);
    setHistoryPage(1);
    // reset to null so the next store's backend default takes effect
    setPageSize(null);
    setHistoryPageSize(null);
    setShowModal(false);
    setSelectedIds(new Set());
    resetForm();
  }, [resetForm]);

  const value = useMemo(
    () => ({
      search,
      setSearch,
      inventoryPage,
      setInventoryPage,
      historyPage,
      setHistoryPage,
      pageSize,
      setPageSize,
      historyPageSize,
      setHistoryPageSize,
      form,
      setForm,
      editingId,
      setEditingId,
      showModal,
      setShowModal,
      formError,
      setFormError,
      resetForm,
      openCreateModal,
      openEditModal,
      closeModal,
      resetForStoreChange,
      modalMode,
      setModalMode,
      editingRow,
      setEditingRow,
      selectedIds,
      toggleSelectRow,
      selectAll,
      clearSelection,
    }),
    [
      search,
      inventoryPage,
      historyPage,
      pageSize,
      historyPageSize,
      form,
      editingId,
      showModal,
      formError,
      resetForm,
      openCreateModal,
      openEditModal,
      closeModal,
      resetForStoreChange,
      modalMode,
      editingRow,
      selectedIds,
      toggleSelectRow,
      selectAll,
      clearSelection,
    ]
  );

  return (
    <InventoryAdminUIContext.Provider value={value}>
      {children}
    </InventoryAdminUIContext.Provider>
  );
}