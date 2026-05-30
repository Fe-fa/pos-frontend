import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { categoryService } from '../../services/categoryService';
import { useStore } from '../../contexts/StoreContext';

const initialForm = { category_name: '' };

const extractList = (res) => {
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res)) return res;
  return [];
};

export default function AdminCategoriesPage() {
  const { storeId } = useStore();

  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadCategories = async () => {
    if (!storeId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const response = await categoryService.list({ store_id: storeId, search, per_page: 10 });
      setCategories(extractList(response));
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to load categories.');
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCategories([]);
    setSearch('');
    setShowModal(false);
    setEditingId(null);
    setForm(initialForm);
    setError('');

    if (!storeId) {
      setLoading(false);
      return;
    }

    loadCategories();
  }, [storeId]);

  useEffect(() => {
    loadCategories();
  }, [storeId, search]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setError('');
  };

  const openCreateModal = () => {
    resetForm();
    setShowModal(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        store_id: Number(storeId),
        category_name: form.category_name,
      };

      if (editingId) {
        await categoryService.update(editingId, payload);
      } else {
        await categoryService.create(payload);
      }

      setShowModal(false);
      resetForm();
      await loadCategories();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.response?.data?.errors?.category_name?.[0] ||
        'Unable to save category.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (category) => {
    setEditingId(category.category_uuid);
    setForm({ category_name: category.category_name || '' });
    setError('');
    setShowModal(true);
  };

  const handleDelete = async (category) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await categoryService.remove(category.category_uuid);
      await loadCategories();
    } catch (err) {
      setError(err?.response?.data?.message || 'Unable to delete category.');
    }
  };
  return (
    <>
      <section className="stack-lg">
        <div className="catalog-hero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="catalog-hero-copy">
            <h3 className="catalog-title">Categories</h3>
            <p className="catalog-subtitle">{categories.length} category records</p>
          </div>

          <button type="button" className="ghost-button" onClick={openCreateModal} style={{ whiteSpace: 'nowrap' }} disabled={!storeId}>
            New category
          </button>
        </div>

        <div className="catalog-toolbar">
          <label className="catalog-search">
            <input
              className="text-input"
              placeholder="Search category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={!storeId}
            />
          </label>
          <div className="inventory-store-pill">Store ID: {storeId || '-'}</div>
        </div>

        {error && !showModal ? <p className="form-error">{error}</p> : null}

        <article className="catalog-table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Products</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!storeId ? (
                  <tr><td colSpan="3">Select a store first.</td></tr>
                ) : loading ? (
                  <tr><td colSpan="3">Loading...</td></tr>
                ) : categories.length ? (
                  categories.map((category) => (
                    <tr key={category.category_uuid}>
                      <td>{category.category_name}</td>
                      <td>{category.products_count || 0}</td>
                      <td>
                        <div className="row-actions compact">
                          <button type="button" className="ghost-button" onClick={() => handleEdit(category)}>
                            Edit
                          </button>
                          <button type="button" className="ghost-button danger" onClick={() => handleDelete(category.category_uuid)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan="3">No categories found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      {showModal ? (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-card form-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>{editingId ? 'Edit category' : 'New category'}</h3>
                <p className="muted">Create or update your product categories.</p>
              </div>
              <button type="button" className="icon-button" onClick={closeModal} disabled={submitting}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-content">
              <form className="catalog-form-grid" onSubmit={handleSubmit}>
                <label className="span-2">
                  Category name
                  <input
                    className="text-input"
                    value={form.category_name}
                    onChange={(e) => setForm({ category_name: e.target.value })}
                    required
                  />
                </label>

                {error ? <p className="form-error span-2">{error}</p> : null}

                <div className="catalog-modal-actions span-2">
                  <button type="button" className="ghost-button" onClick={closeModal} disabled={submitting}>
                    Cancel
                  </button>
                  <button className="catalog-primary-btn" type="submit" disabled={submitting}>
                    {editingId ? 'Update category' : 'Create category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
