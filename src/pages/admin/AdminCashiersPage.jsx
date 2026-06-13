import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock3,
  Store as StoreIcon,
  BadgeDollarSign,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { userService } from '../../services/userService';


const emptyState = {
  loading: true,
  error: '',
};

const extractList = (response) => {
  if (Array.isArray(response?.data?.data)) return response.data.data;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const titleCase = (value) =>
  String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

const buildFullName = (row) =>
  row?.full_name ||
  [row?.first_name, row?.last_name].filter(Boolean).join(' ').trim() ||
  row?.username ||
  'Unknown user';

const extractStoresForUser = (row) => {
  if (Array.isArray(row?.stores)) return row.stores;
  if (Array.isArray(row?.store_assignments)) return row.store_assignments;

  if (row?.store_id || row?.store_name) {
    return [
      {
        store_id: row.store_id,
        store_name: row.store_name,
        location: row.location,
      },
    ];
  }

  return [];
};

const getShiftLabel = (row) => {
  if (row?.shift?.label) return row.shift.label;
  if (row?.shift_label) return row.shift_label;
  if (row?.shift?.name && row?.shift?.start && row?.shift?.end) {
    return `${row.shift.name} (${row.shift.start} - ${row.shift.end})`;
  }
  if (row?.shift?.name) return row.shift.name;
  if (row?.shift_name && row?.shift_start && row?.shift_end) {
    return `${row.shift_name} (${row.shift_start} - ${row.shift_end})`;
  }
  if (row?.shift_name) return row.shift_name;
  if (row?.shift) return titleCase(row.shift);
  if (row?.work_shift) return titleCase(row.work_shift);
  if (row?.roster_shift) return titleCase(row.roster_shift);
  return 'No shift assigned';
};

// Source of truth: backend sales_today
const getTodaySales = (row) => toNumber(row?.sales_today ?? 0);

const getCurrency = (row, activeStore) =>
  row?.currency || row?.default_currency || activeStore?.currency || 'KES';

const getStatus = (row) => (row?.is_active ? 'Active' : 'Inactive');

const getInitials = (row) => {
  const name = buildFullName(row)
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return name || 'NA';
};

const getRoleKey = (row) => String(row?.role || 'cashier').toLowerCase();

const normalizeUser = (row, activeStore) => {
  const stores = extractStoresForUser(row);
  const primaryStore = stores[0] || null;
  const managerRef = row?.manager || null;
  const unitRef = row?.unit || null;
  const roleKey = getRoleKey(row);

  return {
    ...row,
    full_name: buildFullName(row),
    stores,
    primaryStore,
    primaryStoreId: String(
      row?.store_id || primaryStore?.store_id || row?.default_store_id || ''
    ),
    primaryStoreName:
      row?.store_name ||
      primaryStore?.store_name ||
      activeStore?.store_name ||
      'Unassigned store',
    location: row?.location || primaryStore?.location || '',
    shiftLabel: getShiftLabel(row),
    salesToday: getTodaySales(row),
    currency: getCurrency(row, activeStore),
    statusLabel: getStatus(row),
    initials: getInitials(row),
    roleKey,
    roleLabel: titleCase(roleKey || 'cashier'),
    scope: String(
      row?.scope ||
        row?.cashier_scope ||
        row?.assignment_scope ||
        row?.access_scope ||
        ''
    ).toLowerCase(),
    managerId: String(
      row?.manager_id || managerRef?.user_id || unitRef?.manager_id || ''
    ),
    managerName:
      row?.manager_name ||
      managerRef?.full_name ||
      [managerRef?.first_name, managerRef?.last_name].filter(Boolean).join(' ') ||
      '',
    unitId: String(row?.unit_id || unitRef?.unit_id || ''),
    unitName: row?.unit_name || unitRef?.name || '',
  };
};

function formatMoney(value, currency) {
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency: currency || 'KES',
      maximumFractionDigits: 0,
    }).format(toNumber(value));
  } catch {
    return `${currency || 'KES'} ${toNumber(value).toLocaleString()}`;
  }
}

function roleWithShift(member) {
  return `${member.roleLabel} · ${member.shiftLabel}`;
}

function SummaryCard({ icon: Icon, label, value }) {
  return (
    <article className="info-tile compact cashier-summary-card">
      <div className="cashier-summary-card-top">
        <span className="cashier-summary-icon">
          <Icon size={15} />
        </span>
        <span className="muted">{label}</span>
      </div>
      <strong>{value}</strong>
    </article>
  );
}

export default function AdminCashiersPage() {
  const { user, can } = useAuth();
  const canManage = can('cashiers.manage'); 

  const { stores = [], activeStore, storeId } = useStore();

  const [rows, setRows] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [state, setState] = useState(emptyState);

  const isAdmin = user?.role === 'admin';
  const scopedStoreId = isAdmin
    ? String(storeId || '')
    : String(activeStore?.store_id || '');

  const load = useCallback(async () => {
    setState({ loading: true, error: '' });

    try {
      const params = { per_page: 10 };
      if (scopedStoreId) params.store_id = scopedStoreId;

      const response = await userService.list(params);
      const nextRows = extractList(response).map((row) =>
        normalizeUser(row, activeStore)
      );

      setRows(nextRows);
      setState({ loading: false, error: '' });
    } catch (err) {
      setRows([]);
      setState({
        loading: false,
        error:
          err?.response?.data?.message || 'Unable to load cashier roster.',
      });
    }
  }, [scopedStoreId, activeStore]);

  useEffect(() => {
    load();
  }, [load]);

  const { managers, cashiers } = useMemo(() => {
    const normalizedManagers = rows.filter((row) => row.roleKey === 'manager');
    const normalizedCashiers = rows.filter((row) => row.roleKey === 'cashier');

    return { managers: normalizedManagers, cashiers: normalizedCashiers };
  }, [rows]);

  const filteredCashiers = useMemo(() => {
    const searchValue = query.trim().toLowerCase();

    return cashiers.filter((cashier) => {
      const matchesQuery =
        !searchValue ||
        cashier.full_name.toLowerCase().includes(searchValue) ||
        cashier.roleLabel.toLowerCase().includes(searchValue) ||
        cashier.shiftLabel.toLowerCase().includes(searchValue) ||
        cashier.primaryStoreName.toLowerCase().includes(searchValue) ||
        cashier.managerName.toLowerCase().includes(searchValue) ||
        cashier.unitName.toLowerCase().includes(searchValue);

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && cashier.is_active) ||
        (statusFilter === 'inactive' && !cashier.is_active);

      return matchesQuery && matchesStatus;
    });
  }, [cashiers, query, statusFilter]);

  const groupedSections = useMemo(() => {
    const managerMap = new Map(
      managers.map((manager) => [String(manager.user_id), manager])
    );
    const storeMap = new Map(
      stores.map((store) => [String(store.store_id), store])
    );
    const sections = new Map();

    filteredCashiers.forEach((cashier) => {
      const belongsToUnit =
        cashier.scope === 'unit' || Boolean(cashier.managerId || cashier.unitId);

      const manager = managerMap.get(cashier.managerId);
      const store = storeMap.get(cashier.primaryStoreId) || activeStore;

      let key = `store-${cashier.primaryStoreId || 'unassigned'}`;
      let title = store?.store_name || cashier.primaryStoreName || 'Unassigned store';
      let description = store?.location || cashier.location || 'Store roster';

      if (belongsToUnit && (manager || cashier.managerName || cashier.unitName)) {
        key = `unit-${cashier.managerId || cashier.unitId || cashier.user_id}`;
        title =
          cashier.unitName ||
          manager?.unitName ||
          `${manager?.full_name || cashier.managerName}'s unit`;

        description = manager
          ? `${manager.full_name} • ${manager.primaryStoreName || title}`
          : cashier.managerName || 'Assigned unit';
      }

      if (!sections.has(key)) {
        sections.set(key, {
          key,
          title,
          description,
          staff: [],
        });
      }

      sections.get(key).staff.push(cashier);
    });

    return Array.from(sections.values())
      .map((section) => ({
        ...section,
        staff: [...section.staff].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        ),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [filteredCashiers, managers, stores, activeStore]);

  return (
    <section className="cashier-page">
      {state.error ? <p className="form-error">{state.error}</p> : null}
      {state.loading ? (
        <article className="card">
          <p className="muted">Loading cashier roster...</p>
        </article>
      ) : groupedSections.length ? (
        <div className="cashier-sections">
          {groupedSections.map((section) => (
            <section key={section.key} className="cashier-section">
              <div className="cashier-section-head">
                <div>
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                <span className="cashier-section-count">
                  {section.staff.length} cashier
                  {section.staff.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="cashier-cards-grid">
                {section.staff.map((member) => (
                  <article key={member.user_id} className="cashier-member-card">
                    <div className="cashier-member-top">
                      <div className="cashier-member-left">
                        <div className="cashier-avatar">{member.initials}</div>

                        <div className="cashier-member-meta">
                          <h4>{member.full_name}</h4>
                          <p>{roleWithShift(member)}</p>
                        </div>
                      </div>

                      <span
                        className={`cashier-status-pill ${
                          member.is_active ? 'is-active' : 'is-inactive'
                        }`}
                      >
                        {member.statusLabel}
                      </span>
                    </div>

                    <div className="cashier-divider" />

                    <div className="cashier-member-bottom">
                      <div className="cashier-sales-block">
                        <span className="cashier-sales-label">Sales today</span>
                        <strong className="cashier-sales-amount">
                          {formatMoney(member.salesToday, member.amount_received_currency)}
                        </strong>
                      </div>

                      <button
                        type="button"
                        className="cashier-view-btn"
                        onClick={() => setSelectedMember(member)}
                      >
                        View shifts
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <article className="card">
          <p className="muted">No cashiers found for this store or filter.</p>
        </article>
      )}

      {selectedMember ? (
        <div className="modal-backdrop" onClick={() => setSelectedMember(null)}>
          <div
            className="modal-card form-modal-card cashier-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>{selectedMember.full_name}</h3>
                <p className="muted">Shift, unit and store assignment</p>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedMember(null)}
                aria-label="Close cashier details"
              >
                <X size={16} />
              </button>
            </div>

            <div className="modal-content stack-md">
              <div className="info-grid cashier-modal-grid">
                <SummaryCard
                  icon={UserRound}
                  label="Role"
                  value={selectedMember.roleLabel}
                />
                <SummaryCard
                  icon={Clock3}
                  label="Shift"
                  value={selectedMember.shiftLabel}
                />
                <SummaryCard
                  icon={StoreIcon}
                  label="Store"
                  value={selectedMember.primaryStoreName}
                />
                <SummaryCard
                  icon={BadgeDollarSign}
                  label="Sales today"
                  value={formatMoney(
                    selectedMember.salesToday,
                    selectedMember.currency
                  )}
                />
              </div>

              <article className="cardless-panel staff-detail-panel cashier-detail-panel">
                <strong>Assignment details</strong>

                <p className="muted">
                  {selectedMember.unitName || selectedMember.managerName
                    ? `${selectedMember.unitName || 'Unit'} • ${
                        selectedMember.managerName || 'No manager name provided'
                      }`
                    : 'This cashier is displayed directly under the selected store.'}
                </p>

                <p className="muted">
                  Status: {selectedMember.statusLabel}
                  {selectedMember.location ? ` • ${selectedMember.location}` : ''}
                </p>
              </article>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
