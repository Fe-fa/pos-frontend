import { useEffect, useState } from 'react';
import { CreditCard, Gift, Smartphone, Wallet, X } from 'lucide-react';

const PAYMENT_METHODS = [
  { key: 'cash', title: 'CASH', description: 'Receive cash and enter tendered amount', icon: Wallet },
  { key: 'mpesa', title: 'MPESA', description: 'Enter phone number and transaction code', icon: Smartphone },
  { key: 'card', title: 'CARD', description: 'Enter card reference', icon: CreditCard },
];

export default function PaymentModal({
  isOpen,
  billing,
  currentStore,
  itemCount,
  selectedCustomer,
  customerCurrentBalance,
  submitting,
  currency,
  onClose,
  onCharge, 
  loyaltyPoints = 0,
  loyaltyPointValue = 1,
  pointsToRedeem = 0,
  setPointsToRedeem,
  chapa5Preview = null,
  onClaimChapa5Reward,
  loyaltyMinPoints = 0,
}) {
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountReceived, setAmountReceived] = useState('');
  const [amountTendered, setAmountTendered] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaCode, setMpesaCode] = useState('');
  const [cardReference, setCardReference] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [loyaltyError, setLoyaltyError] = useState('');

  const invoiceAmount = Number(billing?.total || 0);
  const activeBalance = Number(
    billing?.customer?.current_balance ??
    selectedCustomer?.current_balance ??
    customerCurrentBalance ??
    0
  );

  const loyaltyDiscount = Math.max(
    0,
    Math.min(invoiceAmount, Number(pointsToRedeem || 0) * Number(loyaltyPointValue || 0))
  );
  const discountedInvoiceAmount = Math.max(invoiceAmount - loyaltyDiscount, 0);
  const combinedPayable = discountedInvoiceAmount + activeBalance;

  // Initialize fields fresh every time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setPaymentMethod('');
    setAmountReceived(combinedPayable > 0 ? String(combinedPayable) : '');
    setAmountTendered('');
    setMpesaPhone('');
    setMpesaCode('');
    setCardReference('');
    setCardHolder('');
    setPaymentError('');
    setLoyaltyError('');
    // intentionally only re-running on open/close, not on every combinedPayable tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Keep the suggested amount in sync while open if loyalty redemption changes.
  useEffect(() => {
    if (!isOpen) return;
    setAmountReceived(combinedPayable > 0 ? String(combinedPayable) : '');
  }, [pointsToRedeem, isOpen, combinedPayable]);

  if (!isOpen) return null;

  const effectiveAmountToBePaid = Number(amountReceived || combinedPayable || 0);
  const effectiveCashTendered = Number(amountTendered || 0);
  const changeAmount =
    paymentMethod === 'cash'
      ? Math.max(effectiveCashTendered - effectiveAmountToBePaid, 0).toFixed(2)
      : '0.00';

  const canClaimFreeReward =
    !!chapa5Preview?.qualifies && Number(chapa5Preview?.claimable_free_items || 0) > 0;

  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method);
    setPaymentError('');
    if (method !== 'cash') setAmountTendered('');
  };

  const validatePayment = () => {
    if (!paymentMethod) return setPaymentError('Please select a payment method.'), false;
    if (!amountReceived || Number(amountReceived) <= 0)
      return setPaymentError('Please enter a valid amount received.'), false;
    if (paymentMethod === 'cash' && (!amountTendered || Number(amountTendered) <= 0))
      return setPaymentError('Please enter the cash received amount.'), false;
    if (paymentMethod === 'mpesa') {
      if (!mpesaPhone.trim()) return setPaymentError('Please enter MPESA phone number.'), false;
      if (!mpesaCode.trim()) return setPaymentError('Please enter MPESA transaction code.'), false;
    }
    if (paymentMethod === 'card' && !cardReference.trim())
      return setPaymentError('Please enter card reference.'), false;
    return true;
  };

  const handleChargeClick = async () => {
    setPaymentError('');
    if (!validatePayment()) return;

    try {
      await onCharge({
        paymentMethod,
        amountReceived: Number(amountReceived || 0),
        amountTendered:
          paymentMethod === 'cash'
            ? Number(amountTendered || amountReceived || 0)
            : Number(amountReceived || 0),
        mpesaPhone: paymentMethod === 'mpesa' ? mpesaPhone : null,
        mpesaCode: paymentMethod === 'mpesa' ? mpesaCode : null,
        cardReference: paymentMethod === 'card' ? cardReference : null,
        cardHolder: paymentMethod === 'card' ? cardHolder || null : null,
        pointsToRedeem: Number(pointsToRedeem || 0),
      });
    } catch (err) {
      setPaymentError(err?.message || 'Unable to process payment.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <div className="modal-card payment-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Payment</h3>
            <p className="muted">{billing?.invnumber || `Draft #${billing?.billing_id || ''}`}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={submitting}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-content payment-modal-content">
          <div className="payment-summary-strip">
            <div className="payment-summary-pill">
              <span>Sale total</span>
              <strong>{currency(discountedInvoiceAmount, currentStore?.currency)}</strong>
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

            {loyaltyPoints > 0 && selectedCustomer ? (
              <div className="payment-summary-pill">
                <span>Loyalty points</span>
                <strong style={{ color: 'var(--success)' }}>{loyaltyPoints} pts</strong>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {pointsToRedeem <= 0 ? (
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                          const minPoints = loyaltyMinPoints ?? 0;
                          if (loyaltyPoints < minPoints) {
                            setLoyaltyError(`Minimum redemption is ${minPoints.toFixed(2)} points.`);
                            return;
                          }
                          setLoyaltyError('');
                          const maxPoints = Math.min(
                            loyaltyPoints,
                            Math.floor(invoiceAmount / loyaltyPointValue)
                          );
                          setPointsToRedeem(maxPoints);
                        }}
                      >
                        Redeem
                      </button>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>
                        -{currency(loyaltyDiscount, currentStore?.currency)} applied
                      </span>
                    )}

                    <button
                      type="button"
                      className="icon-button danger-icon"
                      style={{ padding: '4px' }}
                      title="Clear redemption"
                      onClick={() => {
                        setPointsToRedeem(0);
                        setLoyaltyError('');
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {loyaltyError ? (
                    <span style={{ fontSize: 12, color: 'var(--danger, #e53e3e)' }}>{loyaltyError}</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {chapa5Preview?.qualifies ? (
            <div className="payment-fields-card" style={{ borderColor: '#ccead7', background: '#f6fffa' }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: '#eaf8ef',
                    border: '1px solid #ccead7',
                  }}
                >
                  <div style={{ display: 'grid', gap: 4 }}>
                    <strong style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Gift size={16} />
                      Reward ready
                    </strong>
                    <span style={{ fontSize: 13, color: 'var(--text)' }}>
                      {chapa5Preview.free_items} free item(s) available from this checkout.
                    </span>
                  </div>

                  {canClaimFreeReward ? (
                    <button type="button" className="primary-button" onClick={onClaimChapa5Reward} disabled={submitting}>
                      Claim reward
                    </button>
                  ) : (
                    <span className="badge success">Added to cart</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <div className="payment-method-card-grid">
            {PAYMENT_METHODS.map((method) => {
              const Icon = method.icon;
              return (
                <button
                  key={method.key}
                  type="button"
                  className={`payment-method-card ${paymentMethod === method.key ? 'active' : ''}`}
                  onClick={() => handlePaymentMethodChange(method.key)}
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
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Amount to be paid</span>
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder={combinedPayable.toFixed(2)}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Change</span>
                    <input
                      className="text-input"
                      type="text"
                      value={changeAmount}
                      readOnly
                      style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}
                    />
                  </label>
                </div>
              ) : null}

              {paymentMethod === 'mpesa' ? (
                <div className="form-grid two-columns payment-fields-grid">
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Amount to be paid</span>
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
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>MPESA phone number</span>
                    <input
                      className="text-input"
                      type="text"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                      placeholder="e.g. 07XXXXXXXX"
                    />
                  </label>
                  <label className="span-2" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Amount to be paid</span>
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
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span>Card holder</span>
                    <input
                      className="text-input"
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      placeholder="Card holder name"
                    />
                  </label>
                  <label className="span-2" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

          {paymentError ? <div className="form-error" style={{ margin: '0 0 8px' }}>{paymentError}</div> : null}

          <div className="payment-modal-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleChargeClick}
              disabled={!billing?.items?.length || submitting || !paymentMethod || billing?.status === 'paid'}
            >
              {billing?.status === 'paid' ? 'Already paid' : 'Charge Payment'}
            </button>
            <button type="button" className="ghost-button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}