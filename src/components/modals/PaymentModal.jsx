import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Gift, Smartphone, Wallet, X } from 'lucide-react';

const PAYMENT_METHODS = [
  { key: 'cash', title: 'CASH', icon: Wallet, tone: 'cash' },
  { key: 'mpesa', title: 'MPESA', icon: Smartphone, tone: 'mpesa' },
  { key: 'card', title: 'CARD', icon: CreditCard, tone: 'card' },
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
  isBalanceSettlement = false,
  isPreparingPayment = false,
}) {
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [amountTendered, setAmountTendered] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [mpesaCode, setMpesaCode] = useState('');
  const [cardReference, setCardReference] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [loyaltyError, setLoyaltyError] = useState('');
  const [receiptPreview, setReceiptPreview] = useState(false);

  function withLimiter(max, val) {
    return val > max ? max : val;
  }

  const invoiceSubtotal = Number(billing?.subtotal || 0);
  const invoiceTax = Number(billing?.vat_amount || 0);
  const invoiceAmount = Number(billing?.total || 0);

  const activeBalance = Number(
    billing?.customer?.current_balance ??
      selectedCustomer?.current_balance ??
      customerCurrentBalance ??
      0
  );

  const loyaltyDiscount = Math.max(
    0,
    withLimiter(invoiceAmount, Number(pointsToRedeem || 0) * Number(loyaltyPointValue || 0))
  );

  const discountedInvoiceAmount = Math.max(invoiceAmount - loyaltyDiscount, 0);
  const isFullyCoveredByPoints = discountedInvoiceAmount <= 0 && pointsToRedeem > 0;

  const combinedPayable = isBalanceSettlement
    ? Number(billing?.balance_due || 0)
    : discountedInvoiceAmount + activeBalance;

  const effectiveAmountToBePaid = isFullyCoveredByPoints ? 0 : combinedPayable;
  const effectiveCashTendered = Number(amountTendered || 0);

  const changeAmount =
    paymentMethod === 'cash'
      ? Math.max(effectiveCashTendered - effectiveAmountToBePaid, 0)
      : 0;

  const canClaimFreeReward =
    !!chapa5Preview?.qualifies && Number(chapa5Preview?.claimable_free_items || 0) > 0;

  const loyaltyDiscountLabel = useMemo(
    () => currency(loyaltyDiscount, currentStore?.currency),
    [currency, loyaltyDiscount, currentStore?.currency]
  );

  useEffect(() => {
    if (!isOpen) return;

    const payableString = combinedPayable > 0 ? String(combinedPayable.toFixed(2)) : '';

    setPaymentMethod('cash');
    setAmountTendered(payableString);
    setMpesaPhone('');
    setMpesaCode('');
    setCardReference('');
    setCardHolder('');
    setPaymentError('');
    setLoyaltyError('');
    setReceiptPreview(false);
  }, [isOpen, combinedPayable]);

  useEffect(() => {
    if (!isOpen) return;
    setAmountTendered(
      effectiveAmountToBePaid > 0 ? String(effectiveAmountToBePaid.toFixed(2)) : ''
    );
  }, [isOpen, pointsToRedeem, effectiveAmountToBePaid]);

  useEffect(() => {
    if (!isOpen) return;
    setPaymentError('');
  }, [billing?.items?.length, billing?.total, isOpen]);

  if (!isOpen) return null;

  const handlePaymentMethodChange = (method) => {
    setPaymentMethod(method);
    setPaymentError('');
    setAmountTendered(
      effectiveAmountToBePaid > 0 ? String(effectiveAmountToBePaid.toFixed(2)) : ''
    );
  };

  const handleQuickCashSelect = (preset) => {
    if (preset === 'exact') {
      setAmountTendered(String(effectiveAmountToBePaid.toFixed(2)));
      return;
    }
    setAmountTendered(String(Number(preset).toFixed(2)));
  };

  const handleRedeem = () => {
    const minPoints = Number(loyaltyMinPoints ?? 0);

    if (loyaltyPoints < minPoints) {
      setLoyaltyError(`Minimum redemption is ${minPoints.toFixed(2)} points.`);
      return;
    }

    const maxPoints = Math.min(
      Number(loyaltyPoints || 0),
      Math.floor(invoiceAmount / Number(loyaltyPointValue || 1))
    );

    setLoyaltyError('');
    setPointsToRedeem(maxPoints);
  };

  const clearRedeem = () => {
    setPointsToRedeem(0);
    setLoyaltyError('');
  };

  const validatePayment = () => {
    if (!paymentMethod) {
      setPaymentError('Please select a payment method.');
      return false;
    }

    if (!isFullyCoveredByPoints) {
      const parsedTendered = Number(amountTendered || 0);
      if (parsedTendered <= 0) {
        setPaymentError('Please enter a valid amount to be paid.');
        return false;
      }

      if (paymentMethod === 'cash' && parsedTendered < effectiveAmountToBePaid) {
        setPaymentError('Cash received cannot be less than amount to be paid.');
        return false;
      }
    }

    if (paymentMethod === 'mpesa') {
      if (!mpesaPhone.trim()) {
        setPaymentError('Please enter MPESA phone number.');
        return false;
      }
      if (!mpesaCode.trim()) {
        setPaymentError('Please enter MPESA transaction code.');
        return false;
      }
    }

    if (paymentMethod === 'card' && !cardReference.trim()) {
      setPaymentError('Please enter card reference.');
      return false;
    }

    return true;
  };

  const handleChargeClick = async () => {
    setPaymentError('');
    if (!validatePayment()) return;

    try {
      await onCharge({
        paymentMethod,
        amountReceived: isFullyCoveredByPoints ? 0 : effectiveAmountToBePaid,
        amountTendered: isFullyCoveredByPoints ? 0 : Number(amountTendered || 0),
        mpesaPhone: paymentMethod === 'mpesa' ? mpesaPhone : null,
        mpesaCode: paymentMethod === 'mpesa' ? mpesaCode : null,
        cardReference: paymentMethod === 'card' ? cardReference : null,
        cardHolder: paymentMethod === 'card' ? cardHolder || null : null,
        pointsToRedeem: Number(pointsToRedeem || 0),
        receiptPreview,
      });
    } catch (err) {
      setPaymentError(err?.message || 'Unable to process payment.');
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <div
        className="modal-card payment-modal-card payment-modal-card--wide"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header payment-modal-header">
          <div>
            <h3>Payment</h3>
            {/* <p className="muted">
              {billing?.invnumber || (billing?.billing_id ? `Draft #${billing.billing_id}` : 'Local sale')}
            </p> */}
          </div>

          <button
            type="button"
            className="icon-button payment-modal-close"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-content payment-modal-content payment-modal-layout">
          <div className="payment-modal-pane payment-modal-pane--left">
            <div className="payment-panel-title-row">
              <h4>Transaction Context</h4>
            </div>

            <div className="payment-panel-card">
              <div className="payment-context-summary">
                <div className="payment-context-box-title">Detailed Summary</div>

                <div className="payment-kv-list">
                  <div className="payment-kv-row">
                    <span>SUBTOTAL</span>
                    <strong>{currency(invoiceSubtotal, currentStore?.currency)}</strong>
                  </div>

                  <div className="payment-kv-row">
                    <span>DISCOUNTS (Rewards)</span>
                    <strong className={loyaltyDiscount > 0 ? 'is-discount' : ''}>
                      {loyaltyDiscount > 0
                        ? `-${loyaltyDiscountLabel}`
                        : currency(0, currentStore?.currency)}
                    </strong>
                  </div>

                  <div className="payment-kv-row">
                    <span>TAX ({Number(billing?.vat_rate || 16)}%)</span>
                    <strong>{currency(invoiceTax, currentStore?.currency)}</strong>
                  </div>

                  {!isBalanceSettlement && activeBalance > 0 ? (
                    <div className="payment-kv-row">
                      <span>PREVIOUS BALANCE</span>
                      <strong>{currency(activeBalance, currentStore?.currency)}</strong>
                    </div>
                  ) : null}
                </div>

                <div className="payment-summary-divider" />

                <div className="payment-kv-row payment-kv-row--net">
                  <span>NET TOTAL</span>
                  <strong>{currency(combinedPayable, currentStore?.currency)}</strong>
                </div>

                <div className="payment-summary-divider payment-summary-divider--soft" />

                <div className="payment-kv-row">
                  <span>TOTAL ITEMS</span>
                  <strong>{itemCount}</strong>
                </div>

                <div className="payment-switch-row">
                  <span>RECEIPT PREVIEW</span>
                  <button
                    type="button"
                    className={`payment-switch ${receiptPreview ? 'is-active' : ''}`}
                    onClick={() => setReceiptPreview((prev) => !prev)}
                    aria-pressed={receiptPreview}
                  >
                    <span className="payment-switch-thumb" />
                  </button>
                </div>
              </div>
            </div>

            <div className="payment-panel-title-row payment-panel-title-row--split">
              <h4>Customer &amp; Loyalty</h4>
              <span className="muted small">(if applicable)</span>
            </div>

            <div className="payment-panel-card">
              {selectedCustomer ? (
                <div className="payment-customer-card">
                  <div className="payment-customer-header">
                    <strong>Customer: {selectedCustomer?.full_name || 'Selected customer'}</strong>
                  </div>

                  <div className="payment-summary-divider payment-summary-divider--soft" />

                  <div className="payment-loyalty-block">
                    <div className="payment-loyalty-copy">
                      <span className="payment-loyalty-label">Loyalty Details</span>
                      <strong className="payment-loyalty-points">
                        {Number(loyaltyPoints || 0)} pts
                      </strong>
                    </div>

                    {pointsToRedeem > 0 ? <span className="badge success">Reward claimed</span> : null}
                  </div>

                  <div className="payment-loyalty-actions">
                    {loyaltyPoints > 0 ? (
                      <button type="button" className="primary-button" onClick={handleRedeem}>
                        Redeem ({currency(Math.max(loyaltyPointValue, 0), currentStore?.currency)} reward)
                      </button>
                    ) : (
                      <button type="button" className="primary-button" disabled>
                        Redeem
                      </button>
                    )}

                    <button
                      type="button"
                      className="ghost-button danger"
                      onClick={clearRedeem}
                      disabled={pointsToRedeem <= 0}
                    >
                      Cancel
                    </button>
                  </div>

                  <button type="button" className="payment-benefits-link">
                    View Benefits
                  </button>

                  {pointsToRedeem > 0 ? (
                    <div className="payment-loyalty-applied">
                      Applied reward discount: <strong>{loyaltyDiscountLabel}</strong>
                    </div>
                  ) : null}

                  {loyaltyError ? <div className="payment-inline-error">{loyaltyError}</div> : null}
                </div>
              ) : (
                <div className="payment-empty-mini">
                  No customer selected. Add a customer to use loyalty rewards.
                </div>
              )}
            </div>

            {chapa5Preview?.qualifies ? (
              <div className="payment-panel-card payment-panel-card--reward">
                <div className="payment-reward-banner">
                  <div className="payment-reward-copy">
                    <strong>
                      <Gift size={16} />
                      Reward ready
                    </strong>
                    <span>
                      {chapa5Preview.free_items} free item(s) available from this checkout.
                    </span>
                  </div>

                  {canClaimFreeReward ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={onClaimChapa5Reward}
                      disabled={submitting}
                    >
                      Claim reward
                    </button>
                  ) : (
                    <span className="badge success">Added to cart</span>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="payment-modal-pane payment-modal-pane--right">
            <div className="payment-panel-title-row">
              <h4>Payment Actions</h4>
            </div>

            <div className="payment-method-tabs">
              {PAYMENT_METHODS.map((method) => {
                const Icon = method.icon;
                const isActive = paymentMethod === method.key;

                return (
                  <button
                    key={method.key}
                    type="button"
                    className={`payment-method-tab ${isActive ? 'active' : ''}`}
                    onClick={() => handlePaymentMethodChange(method.key)}
                  >
                    <span className={`payment-method-tab-icon payment-method-tab-icon--${method.tone}`}>
                      <Icon size={16} />
                    </span>
                    <strong>{method.title}</strong>
                  </button>
                );
              })}
            </div>

            <div className="payment-entry-card">
              {isFullyCoveredByPoints ? (
                <div className="payment-covered-banner">
                  ✓ Fully covered by loyalty points — no cash required. Click Charge Payment to confirm.
                </div>
              ) : null}

              {!isFullyCoveredByPoints && paymentMethod === 'cash' ? (
                <>
                  <div className="payment-amount-box">
                    <span>Amount to be Paid</span>
                    <strong>{currency(effectiveAmountToBePaid, currentStore?.currency)}</strong>
                  </div>

                  <label className="payment-field">
                    <span>Cash received</span>
                    <input
                      className="text-input payment-cash-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                      placeholder="Cash received"
                    />
                  </label>

                  <div className="payment-change-box">
                    <span>Change:</span>
                    <strong>{currency(changeAmount, currentStore?.currency)}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="ghost-button" onClick={() => handleQuickCashSelect('exact')}>
                      Exact
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleQuickCashSelect(Math.ceil(effectiveAmountToBePaid))}
                    >
                      Round Up
                    </button>
                  </div>
                </>
              ) : null}

              {!isFullyCoveredByPoints && paymentMethod === 'mpesa' ? (
                <div className="payment-method-form">
                  <label className="payment-field">
                    <span>Amount to be paid</span>
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                      placeholder="Amount to be paid"
                    />
                  </label>

                  <label className="payment-field">
                    <span>MPESA phone number</span>
                    <input
                      className="text-input"
                      type="text"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                      placeholder="e.g. 07XXXXXXXX"
                    />
                  </label>

                  <label className="payment-field payment-field--full">
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

              {!isFullyCoveredByPoints && paymentMethod === 'card' ? (
                <div className="payment-method-form">
                  <label className="payment-field">
                    <span>Amount to be paid</span>
                    <input
                      className="text-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountTendered}
                      onChange={(e) => setAmountTendered(e.target.value)}
                      placeholder="Paid amount"
                    />
                  </label>

                  <label className="payment-field">
                    <span>Card holder</span>
                    <input
                      className="text-input"
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      placeholder="Card holder name"
                    />
                  </label>

                  <label className="payment-field payment-field--full">
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

            {paymentError ? <div className="form-error payment-form-error">{paymentError}</div> : null}

            <div className="payment-modal-actions payment-modal-actions--bottom">
              <button
                type="button"
                className="primary-button payment-submit-btn"
                onClick={handleChargeClick}
                disabled={
                  submitting ||
                  isPreparingPayment ||
                  !paymentMethod ||
                  billing?.status === 'paid' ||
                  (!billing?.items?.length && !isBalanceSettlement && activeBalance <= 0)
                }
              >
                {billing?.status === 'paid'
                  ? 'Already paid'
                  : submitting
                  ? 'Processing...'
                  : 'Charge Payment'}
              </button>

              <button
                type="button"
                className="ghost-button payment-cancel-btn"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
