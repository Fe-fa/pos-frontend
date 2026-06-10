import { Search, Trash2, X } from 'lucide-react';

export default function DraftModal({
  isOpen,
  onClose,
  draftSearch,
  setDraftSearch,
  draftsLoading,
  filteredDrafts,
  billing,
  currentStore,
  currency,
  formatDateTime,
  onLoadDraft,
  onDeleteDraft,
  submitting,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="modal-card draft-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Saved Drafts</h3>
            <p className="muted">Only your drafts for this store are shown</p>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <div className="toolbar-row pos-toolbar-wrap" style={{ marginBottom: 12, padding: '0 16px' }}>
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
                  String(billing?.billing_id) === String(draft.billing_id)
                    ? 'active'
                    : ''
                }`}
              >
                <button
                  type="button"
                  className="draft-modal-row-main"
                  onClick={() => onLoadDraft(draft.billing_id)}
                  disabled={submitting}
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
                    onClick={() => onLoadDraft(draft.billing_id)}
                    disabled={submitting}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    className="ghost-button danger-button"
                    onClick={() => onDeleteDraft(draft.billing_id)}
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
  );
}
