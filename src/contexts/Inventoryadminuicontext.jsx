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

const DEFAULT_INVENTORY_PAGE_SIZE = 5;
const DEFAULT_HISTORY_PAGE_SIZE = 10;

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
  const [pageSize, setPageSize] = useState(DEFAULT_INVENTORY_PAGE_SIZE);
  const [historyPageSize, setHistoryPageSize] = useState(DEFAULT_HISTORY_PAGE_SIZE);

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState('');

  const resetForm = useCallback(() => {
    setForm(initialForm);
    setEditingId(null);
    setFormError('');
  }, []);

  const openCreateModal = useCallback(() => {
    resetForm();
    setShowModal(true);
  }, [resetForm]);

  const openEditModal = useCallback((row) => {
    setEditingId(row.inventory_id);
    setForm({
      product_id: row.product_id,
      batch_no: row.batch_no || '',
      quantity: '',
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
    setPageSize(DEFAULT_INVENTORY_PAGE_SIZE);
    setHistoryPageSize(DEFAULT_HISTORY_PAGE_SIZE);
    setShowModal(false);
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
    ]
  );

  return (
    <InventoryAdminUIContext.Provider value={value}>
      {children}
    </InventoryAdminUIContext.Provider>
  );
}
