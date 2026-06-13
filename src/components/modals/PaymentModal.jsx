import {
  CreditCard,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';

const PAYMENT_METHODS = [
  {
    key: 'cash',
    title: 'CASH',
    description: 'Receive cash and enter tendered amount',
    icon: Wallet,
  },
  {
    key: 'mpesa',
    title: 'MPESA',
    description: 'Enter phone number and transaction code',
    icon: Smartphone,
  },
  {
    key: 'card',
    title: 'CARD',
    description: 'Enter card reference',
    icon: CreditCard,
  },
];

export default function PaymentModal({
  isOpen,
  billing,
  currentStore,
  itemCount,
  selectedCustomer,
  customerCurrentBalance,
  paymentMethod,
  amountReceived,
  setAmountReceived,
  amountTendered,
  setAmountTendered,
  mpesaPhone,
  setMpesaPhone,
  mpesaCode,
  setMpesaCode,
  cardReference,
  setCardReference,
  cardHolder,
  setCardHolder,
  submitting,
  currency,
  onPaymentMethodChange,
  onClose,
  onCharge,
  loyaltyPoints = 0,
  loyaltyPointValue = 1,
  pointsToRedeem,
  setPointsToRedeem,
  chapa5 = null,          // ← add
  loyaltyDiscount,
}) {
  if (!isOpen) return null;

  const invoiceAmount = Number(billing?.total || 0);
  const activeBalance = Number(
    billing?.customer?.current_balance ??
      selectedCustomer?.current_balance ??
      customerCurrentBalance ??
      0
  );

  const combinedPayable = invoiceAmount + activeBalance;

  const changeAmount = (() => {
    const cashTendered = Number(amountTendered || 0);
    const invoiceTarget = Number(amountReceived || billing?.total || 0);
    const realChange = cashTendered - (invoiceTarget + activeBalance);
    return realChange > 0 ? realChange.toFixed(2) : '0.00';
  })();

  return (
    <div
      className="modal-backdrop"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="modal-card payment-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3>Payment</h3>
            <p className="muted">
              {billing?.invnumber || `Draft #${billing?.billing_id || ''}`}
            </p>
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

        <div className="modal-content payment-modal-content">
          <div className="payment-summary-strip">
            <div className="payment-summary-pill">
              <span>Total due</span>
              <strong>{currency(invoiceAmount, currentStore?.currency)}</strong>
            </div>

            <div className="payment-summary-pill">
              <span>Items</span>
              <strong>{itemCount}</strong>
            </div>

            {selectedCustomer ? (
              <div className="payment-summary-pill">
                <span>Customer</span>
                <strong>{selectedCustomer?.full_name || 'Selected'}</strong>
              </div>
            ) : null}
                        {loyaltyPoints > 0 ? (
              <div className="payment-summary-pill" style={{ borderColor: 'var(--color-border-success)' }}>
                <span>Loyalty points</span>
                <strong style={{ color: 'var(--color-text-success)' }}>
                  {loyaltyPoints} pts
                </strong>
              </div>
            ) : null}
          </div>
          {/* Chapa 5 punch card banner */}
          {chapa5?.enabled && selectedCustomer ? (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: chapa5.punches_needed === 0
                ? 'var(--color-background-success)'
                : 'var(--color-background-info)',
              border: `1px solid ${chapa5.punches_needed === 0
                ? 'var(--color-border-success)'
                : 'var(--color-border-info)'}`,
              marginBottom: 12,
            }}>
              {chapa5.punches_needed === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: 'var(--color-text-success)' }}>
                      🎉 {chapa5.label} Reward Ready!
                    </strong>
                    <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--color-text-success)' }}>
                      Customer gets {chapa5.free_count} free item(s) — apply discount manually
                    </p>
                  </div>
                  <span className="status-badge paid" style={{ fontSize: 13 }}>
                    {chapa5.free_count} FREE
                  </span>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <strong style={{ fontSize: 13 }}>
                      🥊 {chapa5.label}
                    </strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {chapa5.progress} / {chapa5.buy_count} punches
                    </span>
                  </div>
                  <div style={{
                    height: 8,
                    background: 'var(--color-border-tertiary)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${(chapa5.progress / chapa5.buy_count) * 100}%`,
                      background: 'var(--color-text-info)',
                      borderRadius: 4,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {chapa5.punches_needed} more purchase(s) to earn {chapa5.free_count} free item
                  </p>
                </div>
              )}
            </div>
          ) : null}
                    {/* ✅ ADD HERE — loyalty redemption block */}
          {loyaltyPoints > 0 && selectedCustomer ? (
            <div className="payment-fields-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong>Redeem loyalty points</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {loyaltyPoints} available · {currency(loyaltyPoints * loyaltyPointValue, currentStore?.currency)} value
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="text-input"
                  type="number"
                  min="0"
                  max={loyaltyPoints}
                  value={pointsToRedeem || ''}
                  onChange={(e) => setPointsToRedeem(Number(e.target.value))}
                  placeholder="Points to redeem"
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    const maxPoints = Math.min(
                      loyaltyPoints,
                      Math.floor(invoiceAmount / loyaltyPointValue)
                    );
                    setPointsToRedeem(maxPoints);
                  }}
                >
                  Redeem max
                </button>
                {pointsToRedeem > 0 ? (
                  <button
                    type="button"
                    className="ghost-button danger"
                    onClick={() => setPointsToRedeem(0)}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
              {pointsToRedeem > 0 ? (
                <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  Discount: <strong>{currency(pointsToRedeem * loyaltyPointValue, currentStore?.currency)}</strong>
                  {' · '}
                  Remaining due: <strong>
                    {currency(Math.max(invoiceAmount - (pointsToRedeem * loyaltyPointValue), 0), currentStore?.currency)}
                  </strong>
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="payment-method-card-grid">
            {PAYMENT_METHODS.map((method) => {
              const Icon = method.icon;

              return (
                <button
                  key={method.key}
                  type="button"
                  className={`payment-method-card ${
                    paymentMethod === method.key ? 'active' : ''
                  }`}
                  onClick={() => onPaymentMethodChange(method.key)}
                >
                  <div className="payment-method-card-top">
                    <span className="payment-method-icon">
                      <Icon size={18} />
                    </span>
                    <strong>{method.title}</strong>
                  </div>
                  <p>{method.description}</p>
                </button>
              );
            })}
          </div>

          {paymentMethod ? (
            <div className="payment-fields-card">
              {paymentMethod === 'cash' ? (
                <div className="form-grid two-columns payment-fields-grid">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>
                      Amount to be paid
                      {selectedCustomer && activeBalance > 0 ? (
                        <span
                          style={{
                            color: '#2563eb',
                            fontWeight: 'bold',
                            marginLeft: '6px',
                          }}
                        >
                          ({`+${activeBalance.toFixed(2)}`})
                        </span>
                      ) : null}
                    </span>

                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder="Amount to be paid"
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>Cash received</span>
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                      placeholder="Cash tendered"
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>Change</span>
                    <input
                      className="text-input"
                      type="text"
                      value={changeAmount}
                      readOnly
                      placeholder="0.00"
                      style={{
                        fontWeight: 'bold',
                        backgroundColor: '#f5f5f5',
                      }}
                    />
                  </label>
                </div>
              ) : null}

              {paymentMethod === 'mpesa' ? (
                <div className="form-grid two-columns payment-fields-grid">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>
                      Amount to be paid
                      {selectedCustomer && activeBalance > 0 ? (
                        <span
                          style={{
                            color: '#2563eb',
                            fontWeight: 'bold',
                            marginLeft: '6px',
                          }}
                        >
                          ({`+${activeBalance.toFixed(2)}`})
                        </span>
                      ) : null}
                    </span>

                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountReceived || combinedPayable.toFixed(2)}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder="Amount to be paid"
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>MPESA phone number</span>
                    <input
                      className="text-input"
                      type="text"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                      placeholder="e.g. 07XXXXXXXX"
                    />
                  </label>

                  <label
                    className="span-2"
                    style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
                  >
                    <span>MPESA transaction code</span>
                    <input
                      className="text-input"
                      type="text"
                      value={mpesaCode}
                      onChange={(e) => setMpesaCode(e.target.value)}
                      placeholder="Enter transaction code"
                    />
                  </label>
                </div>
              ) : null}

              {paymentMethod === 'card' ? (
                <div className="form-grid two-columns payment-fields-grid">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>
                      Amount to be paid
                      {selectedCustomer && activeBalance > 0 ? (
                        <span
                          style={{
                            color: '#2563eb',
                            fontWeight: 'bold',
                            marginLeft: '6px',
                          }}
                        >
                          ({`+${activeBalance.toFixed(2)}`})
                        </span>
                      ) : null}
                    </span>

                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountReceived || combinedPayable.toFixed(2)}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder="Paid amount"
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span>Card holder</span>
                    <input
                      className="text-input"
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      placeholder="Card holder name"
                    />
                  </label>

                  <label
                    className="span-2"
                    style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
                  >
                    <span>Card reference</span>
                    <input
                      className="text-input"
                      type="text"
                      value={cardReference}
                      onChange={(e) => setCardReference(e.target.value)}
                      placeholder="POS slip or card reference"
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="payment-empty-state">
              <p>Select a payment method to show the required fields.</p>
            </div>
          )}

          <div className="payment-modal-actions">
<button
  type="button"
  className="primary-button"
  onClick={onCharge}
  disabled={!billing?.items?.length || submitting || !paymentMethod || billing?.status === 'paid'}
>
  {billing?.status === 'paid' ? 'Already paid' : 'Charge Payment'}
</button>

            <button
              type="button"
              className="ghost-button"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
