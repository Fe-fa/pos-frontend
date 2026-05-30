import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../../services/authService';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialForm = useMemo(() => ({
    email: searchParams.get('email') || '',
    token: searchParams.get('token') || '',
    password: '',
    password_confirmation: '',
  }), [searchParams]);

  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const response = await authService.resetPassword(form);
      setSuccess(response?.message || 'Password reset successful.');
      setTimeout(() => navigate('/login'), 1000);
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.errors?.password?.[0] || 'Password reset failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-wide">
        <div>
          <span className="eyebrow">SwiftPOS</span>
          <h1>Reset password</h1>
          <p>Set a new password using the email and token from the reset message.</p>
        </div>

        <form className="form-grid two-columns" onSubmit={handleSubmit}>
          <label>
            Email address
            <input className="text-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            Reset token
            <input className="text-input" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} required />
          </label>
          <label>
            New password
            <input className="text-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </label>
          <label>
            Confirm password
            <input className="text-input" type="password" value={form.password_confirmation} onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })} required />
          </label>
          {error ? <p className="form-error span-2">{error}</p> : null}
          {success ? <p className="form-success span-2">{success}</p> : null}
          <button className="primary-button span-2" disabled={submitting}>{submitting ? 'Updating...' : 'Reset password'}</button>
        </form>

        <p className="auth-switch"><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
}
