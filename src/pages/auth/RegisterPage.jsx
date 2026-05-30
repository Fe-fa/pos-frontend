import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const initialState = {
  first_name: '',
  last_name: '',
  username: '',
  email: '',
  phone: '',
  password: '',
  password_confirmation: '',
};

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      await register(form);
      setSuccess('Registration successful. Your cashier account is waiting for store assignment by a manager or system admin.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      const errors = err?.response?.data?.errors;
      const firstError = errors ? Object.values(errors)[0]?.[0] : null;
      setError(firstError || err?.response?.data?.message || 'Registration failed.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-wide">
        <div className="stack-md">
          <div>
            <span className="eyebrow">SwiftPOS</span>
            <h1>Create cashier account</h1>
            <p>Welcome back!</p>
          </div>
        </div>

        <form className="form-grid two-columns" onSubmit={handleSubmit}>
          <label>
            First name
            <input className="text-input" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required />
          </label>
          <label>
            Last name
            <input className="text-input" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} required />
          </label>
          <label>
            Username
            <input className="text-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </label>
          <label>
            Email
            <input className="text-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            Phone
            <input className="text-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+2547..." />
          </label>
          <div className="info-tile compact">
            <strong>Default role</strong>
            <span>Cashier</span>
          </div>
          <label>
            Password
            <input className="text-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <label>
            Confirm password
            <input className="text-input" type="password" value={form.password_confirmation} onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })} required />
          </label>
          {error ? <p className="form-error span-2">{error}</p> : null}
          {success ? <p className="form-success span-2">{success}</p> : null}
          <button className="primary-button span-2" disabled={submitting}>{submitting ? 'Creating...' : 'Register'}</button>
        </form>

        <p className="auth-switch">Already have an account? <Link to="/login">Login</Link></p>
      </div>
    </div>
  );
}
