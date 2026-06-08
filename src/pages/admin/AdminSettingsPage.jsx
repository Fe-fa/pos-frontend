import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useStore } from '../../contexts/StoreContext';
import { storeService } from '../../services/storeService';
import { mergeStoreSettings } from '../../utils/storeSettings';

const PRINT_OPTIONS = [
  ['show_barcode', 'Show barcode on receipt / invoice'],
  ['show_qrcode', 'Show QR code on receipt / invoice'],
  ['show_vat_summary', 'Show VAT summary table on print'],
  ['show_logo_on_print', 'Show store logo on print'],
  ['show_store_contacts_on_print', 'Show store contacts on print'],
  ['show_store_pin_on_print', 'Show store PIN on print'],
  ['show_customer_on_print', 'Show customer on print'],
  ['show_cashier_on_print', 'Show cashier on print'],
  ['show_payment_method_on_print', 'Show payment method on receipt / invoice'],
];

const extractApiData = (response) => response?.data?.data ?? response?.data ?? response ?? {};

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const { stores, storeId, activeStore } = useStore();

  const currentStore = useMemo(
    () => activeStore || stores.find((store) => String(store.store_id) === String(storeId)),
    [activeStore, stores, storeId]
  );

  const [form, setForm] = useState(mergeStoreSettings());
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    document.documentElement.classList.toggle('spacious-ui', !!form.spacious_layout);

    return () => {
      document.documentElement.classList.remove('spacious-ui');
    };
  }, [form.spacious_layout]);

  useEffect(() => {
    if (!currentStore?.store_id) {
      setForm(mergeStoreSettings());
      setMessage('');
      setError('');
      return;
    }

    let isMounted = true;

    const loadSettings = async () => {
      setLoadingSettings(true);
      setMessage('');
      setError('');

      try {
        const response = await storeService.getSettings(currentStore.store_id);
        const payload = extractApiData(response);

        if (!isMounted) return;

        setForm(mergeStoreSettings(payload));
      } catch (err) {
        if (!isMounted) return;

        setForm(mergeStoreSettings(currentStore));
        setError(err?.response?.data?.message || 'Unable to load store settings.');
      } finally {
        if (isMounted) {
          setLoadingSettings(false);
        }
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, [currentStore]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage('');
    setError('');
  };

  const updateSequenceField = (documentType, key, value) => {
    setForm((prev) => ({
      ...prev,
      document_sequences: {
        ...prev.document_sequences,
        [documentType]: {
          ...prev.document_sequences[documentType],
          [key]: value,
        },
      },
    }));
    setMessage('');
    setError('');
  };

  

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!currentStore?.store_id) {
      setError('Please select a store first.');
      return;
    }

    setSaving(true);
    setMessage('');
    setError('');

    try {
      const { document_sequences, ...settingsPayload } = form;

      const response = await storeService.updateSettings(currentStore.store_id, {
        settings: settingsPayload,
        document_sequences,
      });

      const payload = extractApiData(response);
      setForm(mergeStoreSettings(payload));
      setMessage('Store settings and document numbering saved successfully.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to save store settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <section className="stack-lg admin-settings-page">
        <article className="card settings-empty-state">
          <div className="section-header">
            <div>
              <h2>Admin settings</h2>
              <p>Only system administrators can update POS system settings.</p>
            </div>
          </div>
        </article>
      </section>
    );
  }

  if (!currentStore) {
    return (
      <section className="stack-lg admin-settings-page">
        <article className="card settings-empty-state">
          <div className="section-header">
            <div>
              <h2>Admin settings</h2>
              <p>Select a store to configure POS settings.</p>
            </div>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="stack-lg admin-settings-page">
      <div className="dashboard-grid two-wide admin-settings-layout">
        <article className="card admin-settings-card">
          <div className="card-header">
            <div>
              <h3>POS settings</h3>
              <p>{currentStore?.store_name}</p>
            </div>
          </div>

          <form className="form-grid two-columns admin-settings-form" onSubmit={handleSubmit}>
            <section className="settings-section span-2">
              <div className="settings-input-grid">
                <label>
                  Default VAT rate (%)
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.default_vat_rate}
                    onChange={(e) => updateField('default_vat_rate', Number(e.target.value))}
                    disabled={loadingSettings || saving}
                  />
                </label>

                <label>
                  Low stock alert threshold
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    value={form.low_stock_alert}
                    onChange={(e) => updateField('low_stock_alert', Number(e.target.value))}
                    disabled={loadingSettings || saving}
                  />
                </label>

                <label>
                  Paper width
                  <select
                    className="select-input"
                    value={form.paper_width}
                    onChange={(e) => updateField('paper_width', Number(e.target.value))}
                    disabled={loadingSettings || saving}
                  >
                    <option value={80}>80 mm</option>
                    <option value={58}>58 mm</option>
                  </select>
                </label>

                <label>
                  Print delay (ms)
                  <input
                    className="text-input"
                    type="number"
                    min="0"
                    step="50"
                    value={form.print_delay_ms}
                    onChange={(e) => updateField('print_delay_ms', Number(e.target.value))}
                    disabled={loadingSettings || saving}
                  />
                </label>
              </div>

              <div className="settings-toggle-grid">
                <label className="settings-toggle-card">
                  <input
                    type="checkbox"
                    checked={form.show_product_images}
                    onChange={(e) => updateField('show_product_images', e.target.checked)}
                    disabled={loadingSettings || saving}
                  />
                  <span>Show product images in POS / admin tables</span>
                </label>

                <label className="settings-toggle-card">
                  <input
                    type="checkbox"
                    checked={form.spacious_layout}
                    onChange={(e) => updateField('spacious_layout', e.target.checked)}
                    disabled={loadingSettings || saving}
                  />
                  <span>Use spacious page layout</span>
                </label>
              </div>
            </section>

            <section className="settings-section span-2">
              <div className="settings-section__header">
                <div>
                  <h4>Print content</h4>
                  <p>Choose what appears on receipts and invoices.</p>
                </div>
              </div>

              <div className="settings-toggle-grid">
                {PRINT_OPTIONS.map(([key, label]) => (
                  <label key={key} className="settings-toggle-card">
                    <input
                      type="checkbox"
                      checked={!!form[key]}
                      onChange={(e) => updateField(key, e.target.checked)}
                      disabled={loadingSettings || saving}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </section>

            <section className="settings-section span-2">
              <div className="settings-section__header">
                <div>
                  <h4>Print messages</h4>
                  <p>Short messages that appear in the printable output for customers.</p>
                </div>
              </div>

              <div className="settings-input-grid">
                <label className="span-2">
                  Receipt header
                  <textarea
                    className="text-input"
                    rows="3"
                    value={form.receipt_header}
                    onChange={(e) => updateField('receipt_header', e.target.value)}
                    placeholder="Optional short message shown under store name on receipt"
                    disabled={loadingSettings || saving}
                  />
                </label>

                <label className="span-2">
                  Invoice header
                  <textarea
                    className="text-input"
                    rows="3"
                    value={form.invoice_header}
                    onChange={(e) => updateField('invoice_header', e.target.value)}
                    placeholder="Optional short message shown under store name on invoice"
                    disabled={loadingSettings || saving}
                  />
                </label>

                <label className="span-2">
                  Receipt footer
                  <textarea
                    className="text-input"
                    rows="4"
                    value={form.receipt_footer}
                    onChange={(e) => updateField('receipt_footer', e.target.value)}
                    disabled={loadingSettings || saving}
                  />
                </label>

                <label className="span-2">
                  Invoice footer
                  <textarea
                    className="text-input"
                    rows="4"
                    value={form.invoice_footer}
                    onChange={(e) => updateField('invoice_footer', e.target.value)}
                    disabled={loadingSettings || saving}
                  />
                </label>
              </div>
            </section>

            <section className="settings-section span-2">
              <div className="settings-section__header">
                <div>
                  <h4>Document numbering</h4>
                  <p>Manage invoice and receipt sequence prefixes, suffixes and counters per store.</p>
                </div>
              </div>

              <div className="sequence-settings-grid">
                <div className="sequence-card">
                  <div className="sequence-card__header">
                    <h5>Receipt sequence</h5>
                    <p>Used for POS receipts generated in this store.</p>
                  </div>

                  <div className="settings-input-grid">
                    <label>
                      Prefix
                      <input
                        className="text-input"
                        type="text"
                        maxLength={15}
                        value={form.document_sequences.receipt.prefix}
                        onChange={(e) => updateSequenceField('receipt', 'prefix', e.target.value)}
                        disabled={loadingSettings || saving}
                        placeholder="REC-"
                      />
                    </label>

                    <label>
                      Suffix
                      <input
                        className="text-input"
                        type="text"
                        maxLength={15}
                        value={form.document_sequences.receipt.suffix}
                        onChange={(e) => updateSequenceField('receipt', 'suffix', e.target.value)}
                        disabled={loadingSettings || saving}
                        placeholder="Optional"
                      />
                    </label>

                    <label className="span-2">
                      Last number
                      <input
                        className="text-input"
                        type="number"
                        min="0"
                        value={form.document_sequences.receipt.last_number}
                        onChange={(e) =>
                          updateSequenceField('receipt', 'last_number', Number(e.target.value))
                        }
                        disabled={loadingSettings || saving}
                      />
                    </label>
                  </div>
                </div>

                <div className="sequence-card">
                  <div className="sequence-card__header">
                    <h5>Invoice sequence</h5>
                    <p>Used for invoices generated in this store.</p>
                  </div>

                  <div className="settings-input-grid">
                    <label>
                      Prefix
                      <input
                        className="text-input"
                        type="text"
                        maxLength={15}
                        value={form.document_sequences.invoice.prefix}
                        onChange={(e) => updateSequenceField('invoice', 'prefix', e.target.value)}
                        disabled={loadingSettings || saving}
                        placeholder="INV-"
                      />
                    </label>

                    <label>
                      Suffix
                      <input
                        className="text-input"
                        type="text"
                        maxLength={15}
                        value={form.document_sequences.invoice.suffix}
                        onChange={(e) => updateSequenceField('invoice', 'suffix', e.target.value)}
                        disabled={loadingSettings || saving}
                        placeholder="Optional"
                      />
                    </label>

                    <label className="span-2">
                      Last number
                      <input
                        className="text-input"
                        type="number"
                        min="0"
                        value={form.document_sequences.invoice.last_number}
                        onChange={(e) =>
                          updateSequenceField('invoice', 'last_number', Number(e.target.value))
                        }
                        disabled={loadingSettings || saving}
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>

            {error ? <p className="form-error span-2">{error}</p> : null}
            {message ? <p className="form-success span-2">{message}</p> : null}

            <div className="row-actions span-2 admin-settings-actions">
              <button className="ghost-button" type="button" disabled={saving || loadingSettings}>
                {loadingSettings ? 'Loading settings...' : 'Store ready'}
              </button>

              <button className="primary-button admin-save-button" type="submit" disabled={saving || loadingSettings}>
                {saving ? 'Saving...' : 'Save settings'}
              </button>
            </div>
          </form>
        </article>
      </div>
    </section>
  );
}
