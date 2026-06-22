import { extractPaginated, EMPTY_META } from '../../../utils/pagination';

export const extractList = (res) => {
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
};

export const getErrorMessage = (err, fallback) =>
  err?.response?.data?.message || err?.message || fallback;

export const getInventoryStatus = (row) => {
  const quantity = Number(row?.quantity || 0);
  const reorder = Number(row?.reorder_level || 0);

  if (quantity <= 0) return { label: 'Out of stock', tone: 'out' };
  if ((reorder > 0 && quantity <= reorder) || quantity <= 12) {
    return { label: 'Low stock', tone: 'low' };
  }
  return { label: 'In stock', tone: 'normal' };
};

export const getHistoryTone = (value) => {
  const qty = Number(value || 0);
  if (qty > 0) return 'success';
  if (qty < 0) return 'danger';
  return 'neutral';
};

export const formatSignedQty = (value) => {
  const qty = Number(value || 0);
  if (qty > 0) return `+${qty}`;
  return `${qty}`;
};

export const toPaginatedResult = (response, fallbackPerPage) => {
  const parsed = extractPaginated(response, fallbackPerPage);
  const pagination = parsed?.meta || { ...EMPTY_META };

  return {
    rows: parsed?.data || [],
    pagination,
    perPage: pagination.per_page ? Number(pagination.per_page) : null,
  };
};

export const sameStorePlaceholder = (storeId) => (previousData, previousQuery) => {
  const previousStoreId = previousQuery?.queryKey?.[1];
  return previousStoreId === storeId ? previousData : undefined;
};
