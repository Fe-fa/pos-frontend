import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export default function PendingApprovalPage() {
  const navigate = useNavigate();
  const { user, refreshProfile, logout } = useAuth();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    setMessage('');

    try {
      const refreshed = await refreshProfile();
      const assigned = (refreshed?.stores?.length || 0) > 0 || !!refreshed?.default_store_id;
      if (assigned) {
        navigate('/cashier/pos', { replace: true });
        return;
      }
      setMessage('No store assignment yet. Please check again later.');
    } catch {
      setMessage('Unable to refresh right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card auth-card-wide waiting-card">
        <div className="stack-md">
          <div>
            <span className="eyebrow">SwiftPOS</span>
            <h1>Waiting for store assignment</h1>
            <p>Your cashier account is active, but the POS will unlock only after a manager or system admin assigns you to a store.</p>
          </div>

          <div className="dashboard-grid two-wide">
            <article className="info-tile">
              <strong>Name</strong>
              <span>{user?.full_name || '-'}</span>
            </article>
            <article className="info-tile">
              <strong>Email</strong>
              <span>{user?.email || '-'}</span>
            </article>
          </div>
        </div>

        {message ? <p className="form-success">{message}</p> : null}

        <div className="row-actions">
          <button type="button" className="primary-button" onClick={handleRefresh} disabled={loading}>
            {loading ? 'Checking...' : 'Check assignment again'}
          </button>
          <button type="button" className="ghost-button" onClick={logout}>Logout</button>
        </div>
      </div>
    </div>
  );
}
