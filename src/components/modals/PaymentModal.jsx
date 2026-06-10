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
          </div>

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
