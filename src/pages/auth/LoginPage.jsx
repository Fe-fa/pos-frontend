import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getUserHomePath } from '../../utils/helpers';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: '', password: '', device_name: 'web-browser' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const response = await login(form);

      if (response.requires_verification) {
        navigate('/verify-email', { state: { user: response.user } });
        return;
      }

      const next = location.state?.from?.pathname || getUserHomePath(response.user);
      navigate(next, { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.response?.data?.errors?.username?.[0] ||
        'Login failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="stack-md">
          <div>
            <span className="eyebrow">SwiftPOS</span>
            <h1>Log in</h1>
            <p>Welcome back!</p>
          </div>
        </div>
        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Username
            <input className="text-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </label>
          <label>
            Password
            <input className="text-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <div className="auth-links-row">
          <p className="auth-switch">No account yet? <Link to="/register">Create one</Link></p>
          <Link className="text-link" to="/forgot-password">Forgot password</Link>
        </div>
      </div>
    </div>
  );
}