import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { currency, formatDateTime } from './helpers';
import { mergeStoreSettings } from './storeSettings';

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function groupVatSummary(items = []) {
  const summary = {};

  items.forEach((item) => {
    const rate = Number(item.vat_rate || 0);
    const total = Number(item.total_amount || 0);
    const net = rate > 0 ? total / (1 + rate / 100) : total;
    const vat = total - net;
    const key = `${rate}`;

    if (!summary[key]) {
      summary[key] = {
        rate,
        net: 0,
        vat: 0,
        amount: 0,
      };
    }

    summary[key].net += net;
    summary[key].vat += vat;
    summary[key].amount += total;
  });

  return Object.values(summary);
}

const stripTrailingSlash = (value = '') => String(value).replace(/\/+$/, '');

const resolveApiBaseUrl = () => {
  const envBaseUrl = stripTrailingSlash(import.meta.env.VITE_API_BASE_URL);

  if (envBaseUrl) return envBaseUrl;

  return stripTrailingSlash(window.location.origin.replace(':5173', ':8000')) + '/api';
};

export const resolvePublicDocumentUrl = (billing, mode = 'receipt', action = 'view') => {
  if (!billing?.uuid) return '';

  const baseUrl = resolveApiBaseUrl();
  const suffix = action === 'download' ? '/download' : '';

  return `${baseUrl}/public/documents/${mode}/${billing.uuid}${suffix}`;
};

export const downloadBillingDocument = (billing, mode = 'receipt') => {
  const url = resolvePublicDocumentUrl(billing, mode, 'download');
  if (!url) return;

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

const getUsablePrintWindow = (existingWindow, features = 'width=320,height=900') => {
  if (existingWindow && !existingWindow.closed) return existingWindow;
  return window.open('', '_blank', features);
};

const triggerPrint = (printWindow, delayMs = 300, closeAfterPrint = false) => {
  window.setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();

      if (closeAfterPrint) {
        window.setTimeout(() => {
          try {
            if (!printWindow.closed) printWindow.close();
          } catch {
            /* ignore */
          }
        }, 250);
      }
    } catch {
      /* ignore */
    }
  }, Number(delayMs || 300));
};

const runWhenDocumentReady = (printWindow, callback) => {
  const run = () => {
    try {
      callback();
    } catch {
      /* ignore */
    }
  };

  if (printWindow.document.readyState === 'complete') {
    window.setTimeout(run, 0);
    return;
  }

  printWindow.onload = run;
};

export function openBillingPrint(
  billing,
  currentStore,
  mode = 'receipt',
  storeSettings = {},
  existingWindow = null
) {
  if (!billing) return;

  const settings =
    storeSettings && Object.keys(storeSettings).length > 0
      ? storeSettings
      : mergeStoreSettings(billing.store ?? currentStore);

  const store = { ...currentStore, ...billing.store };
  const payment = billing.payments?.[billing.payments.length - 1];
  const storeCurrency = store?.currency || currentStore?.currency || 'KES';

  const isPaid = Number(billing?.balance_due || 0) <= 0;

  const documentNumber =
    mode === 'invoice'
      ? billing.invnumber ||
        payment?.receiptnumber ||
        (billing.billing_id ? `INV-${billing.billing_id}` : 'DRAFT')
      : isPaid
        ? payment?.receiptnumber ||
          billing.invnumber ||
          (billing.billing_id ? `RCT-${billing.billing_id}` : 'DRAFT')
        : billing.invnumber ||
          payment?.receiptnumber ||
          (billing.billing_id ? `INV-${billing.billing_id}` : 'DRAFT');

  const documentLabel = mode === 'receipt' && isPaid ? 'Receipt No' : 'Invoice No';

  const barcodeValue = documentNumber;
  const qrUrl = resolvePublicDocumentUrl(billing, mode, 'view') || `${window.location.origin}`;

  const footerText =
    mode === 'invoice'
      ? settings.invoice_footer || 'Goods once sold are not returnable.'
      : isPaid
        ? settings.receipt_footer || 'Thank you for your purchase.'
        : `Balance due: ${currency(
            Number(billing?.balance_due || 0),
            storeCurrency
          )}. Please settle your outstanding balance.`;

  const headerText =
    mode === 'invoice' ? settings.invoice_header || '' : settings.receipt_header || '';

  const documentTitle =
    mode === 'invoice' ? 'Tax Invoice' : isPaid ? 'Sales Receipt' : 'Payment Receipt';

  const vatRows = groupVatSummary(billing.items || []);
  const netAmount = Number(billing.subtotal || 0);
  const vatAmount = Number(billing.vat_amount || 0);
  const totalAmount = Number(billing.total || 0);
  const paidAmount = Number(billing.paid_amount || 0);
  const balanceDue = Number(billing.balance_due || 0);
  const pointsDiscount = Number(billing.points_discount || 0);

  const loyaltyPointsBefore = Number(
    billing.customer?.loyalty_points_before ?? billing.customer?.loyalty_points ?? 0
  );
  const loyaltyPointsEarned = Number(billing.points_earned || 0);
  const loyaltyPointsAfter = Number(
    billing.customer?.loyalty_points_after ?? loyaltyPointsBefore + loyaltyPointsEarned
  );
  const hasLoyaltyPoints =
    !!billing.customer && (loyaltyPointsBefore > 0 || loyaltyPointsEarned > 0);

  const paperWidth = Number(settings.paper_width || 80);
  const bodyWidth = Math.max(paperWidth - 8, 50);

  const showBarcode = settings.show_barcode !== false;
  const showQrCode = settings.show_qrcode !== false;
  const showVatSummary = settings.show_vat_summary !== false;
  const showCustomer = settings.show_customer_on_print !== false;
  const showCashier = settings.show_cashier_on_print !== false;
  const showLogo = settings.show_logo_on_print !== false;
  const showStoreContacts = settings.show_store_contacts_on_print !== false;
  const showStorePin = settings.show_store_pin_on_print !== false;
  const showPaymentMethod = settings.show_payment_method_on_print !== false;

  const itemsHtml = (billing.items || [])
    .map((item) => {
      const name = item.product?.product_name || 'Product';
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const total = Number(item.total_amount || 0);
      const vatAmountText =
        item.vat_amount !== undefined && item.vat_amount !== null
          ? ` +${Number(item.vat_amount).toFixed(2)}`
          : '';

      return `
        <tr>
          <td class="item-desc">
            <div class="item-name">${escapeHtml(name)}</div>
            <div class="item-meta">
              ${qty} x ${currency(unitPrice, storeCurrency)} &nbsp; ${escapeHtml(vatAmountText)}(VAT)
            </div>
          </td>
          <td class="amount-cell">${currency(total, storeCurrency)}</td>
        </tr>
      `;
    })
    .join('');

  const vatHtml = vatRows
    .map(
      (row) => `
        <tr>
          <td>${row.rate}%</td>
          <td>${currency(row.net, storeCurrency)}</td>
          <td>${currency(row.vat, storeCurrency)}</td>
          <td>${currency(row.amount, storeCurrency)}</td>
        </tr>
      `
    )
    .join('');

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${mode === 'invoice' ? 'Invoice Print' : 'Receipt Print'}</title>
      <style>
        @page {
          size: ${paperWidth}mm auto;
          margin: 2mm;
        }

        * {
          box-sizing: border-box;
        }

        html, body {
          margin: 0;
          padding: 0;
          background: #fff;
          color: #000;
          font-family: "Courier New", Courier, monospace;
          font-size: 11px;
          line-height: 1.3;
        }

        body {
          width: ${bodyWidth}mm;
          margin: 0 auto;
          padding: 1mm 0;
        }

        .center {
          text-align: center;
        }

        .brand {
          font-size: 20px;
          font-weight: 700;
          margin-bottom: 3px;
          text-transform: uppercase;
        }

        .doc-title {
          margin-top: 6px;
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .header-note {
          margin-top: 4px;
          font-size: 11px;
          white-space: pre-line;
        }

        .logo-wrap {
          display: flex;
          justify-content: center;
          margin-bottom: 6px;
        }

        .logo-wrap img {
          max-width: 52mm;
          max-height: 20mm;
          object-fit: contain;
        }

        .small {
          font-size: 11px;
        }

        .divider {
          border-top: 1px dashed #000;
          margin: 8px 0;
        }

        .meta-row,
        .line-row,
        .total-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin: 2px 0;
          align-items: flex-start;
        }

        .label {
          flex: 1;
        }

        .value {
          text-align: right;
          white-space: nowrap;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        .items-table th,
        .items-table td {
          padding: 4px 0;
          vertical-align: top;
        }

        .items-table thead th {
          border-bottom: 1px solid #000;
          border-top: 1px solid #000;
          font-size: 12px;
        }

        .items-table th:first-child {
          text-align: left;
        }

        .items-table th:last-child,
        .items-table td:last-child {
          text-align: right;
        }

        .item-name {
          font-weight: 700;
        }

        .item-meta {
          font-size: 11px;
        }

        .amount-cell {
          white-space: nowrap;
          padding-left: 8px;
        }

        .totals {
          margin-top: 6px;
        }

        .grand-total {
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
          padding: 4px 0;
          margin: 4px 0;
          font-weight: 700;
        }

        .vat-table {
          margin-top: 6px;
        }

        .vat-table th,
        .vat-table td {
          padding: 3px 2px;
          font-size: 11px;
          text-align: right;
        }

        .vat-table th:first-child,
        .vat-table td:first-child {
          text-align: left;
        }

        .vat-table thead th {
          border-bottom: 1px solid #000;
          border-top: 1px solid #000;
        }

        .footer-note {
          margin-top: 8px;
          text-align: center;
          font-size: 11px;
          white-space: pre-line;
        }

        .codes-wrap {
          margin-top: 10px;
          display: grid;
          gap: 10px;
        }

        .barcode-wrap,
        .qrcode-wrap {
          text-align: center;
        }

        .barcode-text,
        .qrcode-text {
          font-size: 11px;
          margin-top: 3px;
          letter-spacing: 0.5px;
          word-break: break-word;
        }

        .qrcode-image {
          width: 96px;
          height: 96px;
          display: inline-block;
        }

        .scan-hint {
          font-size: 10px;
          margin-top: 4px;
        }
      </style>
    </head>
    <body>
      <div class="center">
        ${
          showLogo && store?.logo_url
            ? `<div class="logo-wrap"><img src="${escapeHtml(store.logo_url)}" alt="Store Logo" /></div>`
            : ''
        }

        <div class="brand">${escapeHtml(store?.store_name || 'Store')}</div>

        ${
          showStoreContacts && store?.location
            ? `<div class="small">Location: ${escapeHtml(store.location)}</div>`
            : ''
        }
        ${
          showStoreContacts && store?.telephone
            ? `<div class="small">Tel: ${escapeHtml(store.telephone)}</div>`
            : ''
        }
        ${
          showStoreContacts && store?.email_address
            ? `<div class="small">Email: ${escapeHtml(store.email_address)}</div>`
            : ''
        }
        ${
          showStorePin && store?.pin
            ? `<div class="small">KRA PIN: ${escapeHtml(store.pin)}</div>`
            : ''
        }

        <div class="doc-title">${escapeHtml(documentTitle)}</div>

        ${headerText ? `<div class="header-note">${escapeHtml(headerText)}</div>` : ''}
      </div>

      <div class="divider"></div>

      <div class="meta-row">
        <div class="label">${escapeHtml(documentLabel)}</div>
        <div class="value">${escapeHtml(documentNumber)}</div>
      </div>

      <div class="meta-row">
        <div class="label">Date</div>
        <div class="value">${escapeHtml(
          formatDateTime(payment?.payment_date || billing.billing_date || new Date().toISOString())
        )}</div>
      </div>

      ${
        showCustomer
          ? `
            <div class="meta-row">
              <div class="label">Customer</div>
              <div class="value">${escapeHtml(
                billing.customer?.full_name || 'Walk-in Customer'
              )}</div>
            </div>
          `
          : ''
      }

      ${
        showCashier
          ? `
            <div class="meta-row">
              <div class="label">Served By</div>
              <div class="value">${escapeHtml(billing.user?.full_name || 'Cashier')}</div>
            </div>
          `
          : ''
      }

      ${
        showPaymentMethod && payment?.payment_method
          ? `
            <div class="meta-row">
              <div class="label">Payment</div>
              <div class="value">${escapeHtml(String(payment.payment_method).toUpperCase())}</div>
            </div>
          `
          : ''
      }

      <div class="divider"></div>

      <table class="items-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="divider"></div>

      <div class="totals">
        <div class="line-row">
          <div class="label">Net Amount</div>
          <div class="value">${currency(netAmount, storeCurrency)}</div>
        </div>

        <div class="line-row">
          <div class="label">VAT Amount</div>
          <div class="value">${currency(vatAmount, storeCurrency)}</div>
        </div>

        ${
          pointsDiscount > 0
            ? `
              <div class="line-row">
                <div class="label">Points Discount</div>
                <div class="value">- ${currency(pointsDiscount, storeCurrency)}</div>
              </div>
            `
            : ''
        }

        <div class="grand-total">
          <div class="total-row">
            <div class="label"><strong>Total</strong></div>
            <div class="value"><strong>${currency(totalAmount, storeCurrency)}</strong></div>
          </div>
        </div>

        <div class="line-row">
          <div class="label">Paid</div>
          <div class="value">${currency(paidAmount, storeCurrency)}</div>
        </div>

        <div class="line-row">
          <div class="label">Balance Due</div>
          <div class="value">${currency(balanceDue, storeCurrency)}</div>
        </div>

        ${
          payment?.change_returned
            ? `
              <div class="line-row">
                <div class="label">Change</div>
                <div class="value">${currency(payment.change_returned, storeCurrency)}</div>
              </div>
            `
            : ''
        }

        ${
          showVatSummary && vatRows.length
            ? `
              <table class="vat-table">
                <thead>
                  <tr>
                    <th>VAT%</th>
                    <th>Net</th>
                    <th>VAT</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${vatHtml}
                </tbody>
              </table>
            `
            : ''
        }
      </div>

      ${
        hasLoyaltyPoints
          ? `
            <div class="divider"></div>
            <div style="font-size:11px; text-align:center;">
              ${
                loyaltyPointsEarned > 0
                  ? `
                    <div class="line-row">
                      <div class="label">Points Earned</div>
                      <div class="value">+ ${loyaltyPointsEarned.toLocaleString()} pts</div>
                    </div>
                  `
                  : ''
              }

              <div style="
                border-top: 1px solid #000;
                border-bottom: 1px solid #000;
                padding: 4px 0;
                margin: 4px 0;
              ">
                <div class="line-row" style="font-weight:700;">
                  <div class="label">LOYALTY POINTS</div>
                  <div class="value">${loyaltyPointsAfter.toLocaleString()} pts</div>
                </div>
                <div class="line-row" style="font-size:11px;">
                  <div class="label">Est. Value (${storeCurrency})</div>
                  <div class="value">${currency(loyaltyPointsAfter, storeCurrency)}</div>
                </div>
              </div>
            </div>
          `
          : ''
      }

      <div class="divider"></div>

      <div class="footer-note">${escapeHtml(footerText)}</div>
      ${
        billing.notes ? `<div class="footer-note">${escapeHtml(billing.notes)}</div>` : ''
      }

      ${
        showBarcode || showQrCode
          ? `
            <div class="codes-wrap">
              ${
                showQrCode
                  ? `
                    <div class="qrcode-wrap">
                      <img id="receipt-qrcode" class="qrcode-image" alt="QR Code" />
                    </div>
                  `
                  : ''
              }

              ${
                showBarcode
                  ? `
                    <div class="barcode-wrap">
                      <svg id="receipt-barcode"></svg>
                      <div class="barcode-text">${escapeHtml(barcodeValue)}</div>
                    </div>
                  `
                  : ''
              }
            </div>
          `
          : ''
      }
    </body>
  </html>`;

  const printWindow = getUsablePrintWindow(existingWindow, 'width=320,height=900');
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  const renderCodesAndPrint = async () => {
    try {
      const svg = printWindow.document.getElementById('receipt-barcode');
      const qrImage = printWindow.document.getElementById('receipt-qrcode');

      if (svg && showBarcode) {
        JsBarcode(svg, barcodeValue, {
          format: 'CODE128',
          displayValue: false,
          width: 1.4,
          height: 42,
          margin: 0,
        });
      }

      if (qrImage && showQrCode) {
        const dataUrl = await QRCode.toDataURL(qrUrl, {
          width: 140,
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        qrImage.src = dataUrl;
      }
    } catch (error) {
      console.error('Print code generation failed:', error);
    }

    triggerPrint(printWindow, Number(settings.print_delay_ms || 300), false);
  };

  runWhenDocumentReady(printWindow, () => {
    void renderCodesAndPrint();
  });
}

export function openZReportPrint(report) {
  if (!report) return;

  const cur = report.currency;
  const variance = report.variance;
  const isShort = variance !== null && variance < 0;
  const isOver = variance !== null && variance > 0;

  const varianceLabel =
    variance === null
      ? 'N/A'
      : isShort
        ? `SHORT (-${cur} ${Math.abs(variance).toFixed(2)})`
        : isOver
          ? `OVER (+${cur} ${variance.toFixed(2)})`
          : `BALANCED (${cur} 0.00)`;

  const varianceColor = isShort ? '#c0392b' : isOver ? '#e67e22' : '#27ae60';

  const paymentRowsHtml = report.payment_breakdown?.length
    ? report.payment_breakdown
        .map(
          (pm) => `
            <div class="line-row">
              <div class="label">${pm.method} <span class="dim">(${pm.count} txn)</span></div>
              <div class="value">${cur} ${pm.amount.toFixed(2)}</div>
            </div>
          `
        )
        .join('')
    : '<div class="dim">No payment data</div>';

  const html = `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Z-Report — ${report.store_name}</title>
      <style>
        @page { size: 80mm auto; margin: 2mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
          font-family: "Courier New", Courier, monospace;
          font-size: 11px;
          color: #000;
          background: #fff;
          width: 74mm;
          margin: 0 auto;
          padding: 2mm 0;
        }
        .center { text-align: center; }
        .brand { font-size: 16px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
        .doc-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin: 4px 0; }
        .divider { border-top: 1px dashed #000; margin: 6px 0; }
        .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; color: #444; }
        .line-row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; font-size: 11px; }
        .line-row .label { flex: 1; }
        .line-row .value { text-align: right; white-space: nowrap; }
        .grand-total { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin: 4px 0; font-weight: 700; font-size: 12px; }
        .variance-row { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin: 4px 0; font-weight: 700; font-size: 12px; color: ${varianceColor}; }
        .dim { color: #666; font-size: 10px; }
        .footer { text-align: center; font-size: 10px; margin-top: 8px; color: #444; }
      </style>
    </head>
    <body>
      <div class="center">
        <div class="brand">${report.store_name}</div>
        <div class="doc-title">Z-Report / End of Day</div>
        <div style="font-size:10px;color:#444;">${report.closed_at_label}</div>
      </div>

      <div class="divider"></div>

      <div class="section-title">Sales Summary</div>
      <div class="line-row"><div class="label">Gross Sales</div><div class="value">${cur} ${report.gross_sales.toFixed(2)}</div></div>
      <div class="line-row"><div class="label">Total Refunds</div><div class="value">- ${cur} ${report.total_refunds.toFixed(2)}</div></div>
      <div class="grand-total">
        <div class="line-row"><div class="label">Net Sales</div><div class="value">${cur} ${report.net_sales.toFixed(2)}</div></div>
      </div>

      <div class="divider"></div>

      <div class="section-title">Transaction Counts</div>
      <div class="line-row"><div class="label">Completed</div><div class="value">${report.total_transactions}</div></div>
      <div class="line-row"><div class="label">Voids</div><div class="value">${report.total_voids}</div></div>
      <div class="line-row"><div class="label">Drafts / Parked</div><div class="value">${report.total_drafts}</div></div>

      <div class="divider"></div>

      <div class="section-title">Payment Methods</div>
      ${paymentRowsHtml}

      <div class="divider"></div>

      <div class="section-title">Drawer Reconciliation</div>
      <div class="line-row"><div class="label">Expected Cash</div><div class="value">${cur} ${report.expected_cash.toFixed(2)}</div></div>
      ${
        report.counted_cash !== null
          ? `<div class="line-row"><div class="label">Counted Cash</div><div class="value">${cur} ${report.counted_cash.toFixed(2)}</div></div>`
          : ''
      }
      <div class="variance-row">
        <div class="line-row"><div class="label">Variance</div><div class="value">${varianceLabel}</div></div>
      </div>

      <div class="footer">
        Printed: ${new Date().toLocaleString()}<br/>
        *** End of Z-Report ***
      </div>
    </body>
  </html>`;

  const printWindow = getUsablePrintWindow(null, 'width=400,height=900');
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  runWhenDocumentReady(printWindow, () => {
    triggerPrint(printWindow, 300, true);
  });
}
