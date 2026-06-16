import { Edit, Gift, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { rewardService } from '../../services/rewardService';

const initialForm = {
  rule_name: '',
  points_per_shilling: '1',
  min_spend_required: '0',
  point_value: '1',
  min_redemption_points: '1',
  is_active: true,
  chapa5_enabled: false,
  chapa5_product_sku: '',
  chapa5_buy_count: '5',
  chapa5_free_count: '1',
  chapa5_label: 'Chapa 5',
};

const numberOrNull = (value) => {
  if (value === '' || value == null) return null;
  return Number(value);
};

export default function RewardRuleModal({ isOpen, onClose, storeId }) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [rules, setRules] = useState([]);
  const [activeRule, setActiveRule] = useState(null);

  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => Number(b.id || 0) - Number(a.id || 0)),
    [rules]
  );

  const loadRules = async () => {
    if (!storeId) return;

    setLoading(true);
    setError('');

    try {
      const response = await rewardService.list({ store_id: Number(storeId) });
      setRules(Array.isArray(response?.data) ? response.data : []);
      setActiveRule(response?.active_rule ?? null);
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load reward rules.');
      setRules([]);
      setActiveRule(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, storeId]);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(''), 2500);
    return () => clearTimeout(timer);
  }, [success]);

  const resetForm = () => {
    setEditingId(null);
    setForm(initialForm);
    setError('');
  };

  const populateEdit = (rule) => {
    setEditingId(rule.id);
    setForm({
      rule_name: rule.rule_name ?? '',
      points_per_shilling: String(rule.points_per_shilling ?? '1'),
      min_spend_required: String(rule.min_spend_required ?? '0'),
      point_value: String(rule.point_value ?? '1'),
      min_redemption_points: String(rule.min_redemption_points ?? '1'),
      is_active: Boolean(rule.is_active),
      chapa5_enabled: Boolean(rule.chapa5_enabled),
      chapa5_product_sku: rule.chapa5_product_sku ?? '',
      chapa5_buy_count: String(rule.chapa5_buy_count ?? '5'),
      chapa5_free_count: String(rule.chapa5_free_count ?? '1'),
      chapa5_label: rule.chapa5_label ?? 'Chapa 5',
    });
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!storeId) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    const payload = {
      rule_name: form.rule_name,
      points_per_shilling: numberOrNull(form.points_per_shilling) ?? 0,
      min_spend_required: numberOrNull(form.min_spend_required) ?? 0,
      point_value: numberOrNull(form.point_value) ?? 0,
      min_redemption_points: numberOrNull(form.min_redemption_points) ?? 0,
      is_active: Boolean(form.is_active),
      chapa5_enabled: Boolean(form.chapa5_enabled),
      chapa5_product_sku: form.chapa5_enabled ? form.chapa5_product_sku || null : null,
      chapa5_buy_count: form.chapa5_enabled ? numberOrNull(form.chapa5_buy_count) : null,
      chapa5_free_count: form.chapa5_enabled ? numberOrNull(form.chapa5_free_count) : null,
      chapa5_label: form.chapa5_enabled ? form.chapa5_label || null : null,
    };

    try {
      if (editingId) {
        await rewardService.update(editingId, payload);
        setSuccess('Reward rule updated successfully.');
      } else {
        await rewardService.create({
          store_id: Number(storeId),
          ...payload,
        });
        setSuccess('Reward rule created successfully.');
      }

      resetForm();
      await loadRules();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to save reward rule.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm('Delete this reward rule?')) return;

    try {
      await rewardService.destroy(ruleId);
      if (editingId === ruleId) resetForm();
      await loadRules();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to delete reward rule.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <div
        className="modal-card form-modal-card-wide customers-rewards-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Manage Rewards</h3>
            <p className="muted">Configure points redemption and SKU-based Chapa promotion.</p>
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

        <div className="modal-content stack-lg">
          {activeRule ? (
            <div className="card customers-reward-active-card">
              <div className="customers-reward-active-top">
                <div>
                  <span className="eyebrow">Active rule</span>
                  <h4>{activeRule.rule_name}</h4>
                </div>
                <span className="badge success">Active</span>
              </div>

              <div className="customers-reward-summary-grid">
                <div className="info-tile compact">
                  <span>Points / Shilling</span>
                  <strong>{activeRule.points_per_shilling}</strong>
                </div>
                <div className="info-tile compact">
                  <span>Point value</span>
                  <strong>{activeRule.point_value}</strong>
                </div>
                <div className="info-tile compact">
                  <span>Min redemption</span>
                  <strong>{activeRule.min_redemption_points}</strong>
                </div>
                <div className="info-tile compact">
                  <span>Chapa SKU</span>
                  <strong>{activeRule.chapa5_product_sku || '-'}</strong>
                </div>
              </div>
            </div>
          ) : null}

          {error ? <div className="form-error">{error}</div> : null}
          {success ? <div className="form-success">{success}</div> : null}

          <div className="dashboard-grid two-wide">
            <div className="card">
              <div className="card-header">
                <div>
                  <h3>{editingId ? 'Edit reward rule' : 'Create reward rule'}</h3>
                  <p>Only Chapa fields were extended for SKU-based tracking.</p>
                </div>

                {editingId ? (
                  <button type="button" className="ghost-button" onClick={resetForm}>
                    <Plus size={15} />
                    New rule
                  </button>
                ) : null}
              </div>

              <div className="modal-content" style={{ padding: 0, marginTop: 16 }}>
                <form className="catalog-form-grid" onSubmit={handleSubmit}>
                  <label>
                    Rule name
                    <input
                      className="text-input"
                      value={form.rule_name}
                      onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
                      required
                    />
                  </label>

                  <label>
                    Points per shilling
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.points_per_shilling}
                      onChange={(e) =>
                        setForm({ ...form, points_per_shilling: e.target.value })
                      }
                      required
                    />
                  </label>

                  <label>
                    Minimum spend required
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.min_spend_required}
                      onChange={(e) =>
                        setForm({ ...form, min_spend_required: e.target.value })
                      }
                      required
                    />
                  </label>

                  <label>
                    Point value
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.point_value}
                      onChange={(e) => setForm({ ...form, point_value: e.target.value })}
                      required
                    />
                  </label>

                  <label>
                    Minimum redemption points
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="1"
                      value={form.min_redemption_points}
                      onChange={(e) =>
                        setForm({ ...form, min_redemption_points: e.target.value })
                      }
                      required
                    />
                  </label>

                  <label className="checkbox-row" style={{ marginTop: 30 }}>
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    />
                    Activate this rule
                  </label>

                  <div className="span-2 card" style={{ background: 'var(--panel-2)' }}>
                    <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                      <div>
                        <strong>Chapa 5 Promotion</strong>
                        <p className="muted">
                          Configure the exact product SKU to track for buy-count rewards.
                        </p>
                      </div>

                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={form.chapa5_enabled}
                          onChange={(e) =>
                            setForm({ ...form, chapa5_enabled: e.target.checked })
                          }
                        />
                        Enable
                      </label>
                    </div>

                    <div className="catalog-form-grid" style={{ marginTop: 16 }}>
                      <label>
                        Chapa label
                        <input
                          className="text-input"
                          value={form.chapa5_label}
                          onChange={(e) => setForm({ ...form, chapa5_label: e.target.value })}
                          disabled={!form.chapa5_enabled}
                          placeholder="e.g. Mandazi Chapa 5"
                        />
                      </label>

                      <label>
                        Product SKU
                        <input
                          className="text-input"
                          value={form.chapa5_product_sku}
                          onChange={(e) =>
                            setForm({ ...form, chapa5_product_sku: e.target.value })
                          }
                          disabled={!form.chapa5_enabled}
                          placeholder="Exact SKU to track"
                        />
                      </label>

                      <label>
                        Buy count
                        <input
                          className="text-input"
                          type="number"
                          min="1"
                          step="1"
                          value={form.chapa5_buy_count}
                          onChange={(e) =>
                            setForm({ ...form, chapa5_buy_count: e.target.value })
                          }
                          disabled={!form.chapa5_enabled}
                        />
                      </label>

                      <label>
                        Free count
                        <input
                          className="text-input"
                          type="number"
                          min="1"
                          step="1"
                          value={form.chapa5_free_count}
                          onChange={(e) =>
                            setForm({ ...form, chapa5_free_count: e.target.value })
                          }
                          disabled={!form.chapa5_enabled}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="catalog-modal-actions span-2">
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={resetForm}
                      disabled={submitting}
                    >
                      Reset
                    </button>

                    <button type="submit" className="primary-button" disabled={submitting}>
                      {editingId ? 'Update Rule' : 'Create Rule'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <div>
                  <h3>Existing reward rules</h3>
                  <p>{loading ? 'Loading rules...' : `${sortedRules.length} rules found`}</p>
                </div>
              </div>

              <div className="stack-md" style={{ marginTop: 16 }}>
                {sortedRules.length ? (
                  sortedRules.map((rule) => (
                    <div key={rule.id} className="customers-rule-row">
                      <div className="customers-rule-copy">
                        <div className="row-actions" style={{ justifyContent: 'space-between' }}>
                          <strong>{rule.rule_name}</strong>
                          <span className={`badge ${rule.is_active ? 'success' : ''}`}>
                            {rule.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>

                        <p className="muted">
                          Point value: {rule.point_value} · Min redemption:{' '}
                          {rule.min_redemption_points}
                        </p>

                        <p className="muted">
                          Chapa: {rule.chapa5_enabled ? 'Enabled' : 'Disabled'} · SKU:{' '}
                          {rule.chapa5_product_sku || '-'} · Buy {rule.chapa5_buy_count || '-'} Get{' '}
                          {rule.chapa5_free_count || '-'}
                        </p>
                      </div>

                      <div className="row-actions compact">
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => populateEdit(rule)}
                        >
                          <Edit size={16} />
                        </button>

                        <button
                          type="button"
                          className="ghost-button danger"
                          onClick={() => handleDelete(rule.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-draft-state">
                    <p>No reward rules yet.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
