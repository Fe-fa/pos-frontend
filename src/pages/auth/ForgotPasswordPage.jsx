import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../../services/authService';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const response = await authService.forgotPassword({ email });
      setSuccess(response?.message || 'Password reset link sent.');
    } catch (err) {
      setError(err?.response?.data?.message || err?.response?.data?.errors?.email?.[0] || 'Unable to send reset link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div>
          <span className="eyebrow">SwiftPOS</span>
          <h1>Forgot password</h1>
          <p>Enter the email address attached to your SwiftPOS account.</p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Email address
            <input className="text-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error ? <p className="form-error">{error}</p> : null}
          {success ? <p className="form-success">{success}</p> : null}
          <button className="primary-button" disabled={submitting}>{submitting ? 'Sending...' : 'Send reset link'}</button>
        </form>

        <p className="auth-switch"><Link to="/login">Back to login</Link></p>
      </div>
    </div>
  );
}
