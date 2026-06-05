export const EMPTY_META = {
  current_page: 1,
  last_page: 1,
  per_page: 10,
  total: 0,
  from: 0,
  to: 0,
  has_prev_page: false,
  has_next_page: false,
};

export const extractList = (response) => {
  const payload = response?.data ?? response ?? {};

  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
};

export const extractMeta = (response, fallbackPerPage = 10) => {
  const payload = response?.data ?? response ?? {};
  const rows = extractList(response);
  const meta = payload?.meta ?? {};

  const current_page = Number(meta?.current_page ?? 1);
  const last_page = Number(meta?.last_page ?? 1);
  const per_page = Number(meta?.per_page ?? fallbackPerPage);
  const total = Number(meta?.total ?? rows.length ?? 0);

  const from =
    meta?.from ??
    (rows.length ? (current_page - 1) * per_page + 1 : 0);

  const to =
    meta?.to ??
    (rows.length ? from + rows.length - 1 : 0);

  return {
    current_page,
    last_page,
    per_page,
    total,
    from,
    to,
    has_prev_page: current_page > 1,
    has_next_page: current_page < last_page,
  };
};

export const extractPaginated = (response, fallbackPerPage = 10) => {
  return {
    data: extractList(response),
    meta: extractMeta(response, fallbackPerPage),
  };
};
