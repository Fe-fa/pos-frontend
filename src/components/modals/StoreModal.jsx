import { X } from 'lucide-react';

export default function StoreModal({
  isOpen,
  onClose,
  form,
  setForm,
  handleSubmit,
  editingId,
  error,
  message,
  resetForm,
}) {
  if (!isOpen) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="card-header modal-header">
          <div>
            <h3>{editingId ? 'Edit store' : 'Create store'}</h3>
            <p>System admin access only</p>
          </div>

          <button
            type="button"
            className="ghost-button"
            onClick={handleClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form className="form-grid two-columns" onSubmit={handleSubmit}>
          <label>
            Store name
            <input
              className="text-input"
              value={form.store_name}
              onChange={(e) => setForm({ ...form, store_name: e.target.value })}
              required
            />
          </label>

          <label>
            Location
            <input
              className="text-input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              required
            />
          </label>

          <label>
            Currency
            <input
              className="text-input"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              required
            />
          </label>

          <label>
            Telephone
            <input
              className="text-input"
              value={form.telephone}
              onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            />
          </label>

          <label>
            PIN / registration
            <input
              className="text-input"
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value })}
            />
          </label>

          <label>
            Email address
            <input
              className="text-input"
              type="email"
              value={form.email_address}
              onChange={(e) => setForm({ ...form, email_address: e.target.value })}
            />
          </label>

          <label className="span-2">
            Physical address
            <textarea
              className="text-input"
              rows="3"
              value={form.physical_address}
              onChange={(e) => setForm({ ...form, physical_address: e.target.value })}
            />
          </label>

          <label className="span-2">
            Logo URL
            <input
              className="text-input"
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
          </label>

          <label className="checkbox-row span-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span>Store is active</span>
          </label>

          {error ? <p className="form-error span-2">{error}</p> : null}
          {message ? <p className="form-success span-2">{message}</p> : null}

          <div className="row-actions span-2">
            <button className="primary-button" type="submit">
              {editingId ? 'Update store' : 'Create store'}
            </button>

            <button type="button" className="ghost-button" onClick={handleClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
