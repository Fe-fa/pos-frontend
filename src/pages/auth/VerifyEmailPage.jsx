
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authService } from '../../services/authService';
import { useAuth } from '../../contexts/AuthContext';
import { storageKeys } from '../../lib/api';
import { writeJSON, getUserHomePath } from '../../utils/helpers';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, clearSession } = useAuth();
  const user = location.state?.user;

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  const handleBackToLogin = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // 1. Verify the code
      await authService.verifyEmailCode({ code });

      // 2. Remove the pending-verification flag BEFORE fetching /me
      //    so the AuthContext bootstrap (and ProtectedRoute) sees a clean state
      localStorage.removeItem(storageKeys.pendingVerification);

      // 3. Fetch fresh profile
      const meResponse = await authService.me();

      // 4. Persist & surface the user
      writeJSON(storageKeys.user, meResponse.user);
      setUser(meResponse.user);

      // 5. Navigate home
      navigate(getUserHomePath(meResponse.user), { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.errors?.code?.[0] ||
        err?.response?.data?.message ||
        'Verification failed.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');
    setResending(true);
    try {
      const res = await authService.resendVerification();
      setSuccess(res.message || 'A new code has been sent to your email.');
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div>
          <span className="eyebrow">SwiftPOS</span>
          <h1>Verify your email</h1>
          <p>
            We sent a 6-digit code to{' '}
            <strong>{user?.email ?? 'your email'}</strong>.
            Enter it below to activate your account.
          </p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Verification code
            <input
              className="text-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </label>
          {error   ? <p className="form-error">{error}</p>   : null}
          {success ? <p className="form-success">{success}</p> : null}
          <button
            className="primary-button"
            disabled={submitting || code.length < 6}
          >
            {submitting ? 'Verifying...' : 'Verify email'}
          </button>
        </form>

        <p className="auth-switch">
          Didn't receive a code?{' '}
          <button
            type="button"
            className="text-link"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? 'Sending...' : 'Resend code'}
          </button>
        </p>
        <p className="auth-switch">
          <button
            type="button"
            className="text-link"
            onClick={handleBackToLogin}
          >
            Back to login
          </button>
        </p>
      </div>
    </div>
  );
}
