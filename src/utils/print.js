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
  const envBaseUrl = stripTrailingSlash(
    import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || ''
  );

  if (envBaseUrl) return envBaseUrl;
  // return `${stripTrailingSlash(window.location.origin)}/api`;
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

export function openBillingPrint(
  billing,
  currentStore,
  mode = 'receipt',
  storeSettings = {}
) {
  if (!billing) return;

  const settings = mergeStoreSettings(storeSettings);
  const payment = billing.payments?.[billing.payments.length - 1];

const isPaid = Number(billing?.balance_due || 0) <= 0; // ← keep only this one at top

const documentNumber =
  mode === 'invoice'
    ? billing.invnumber || payment?.receiptnumber || (billing.billing_id ? `INV-${billing.billing_id}` : 'DRAFT')
    : isPaid
      ? payment?.receiptnumber || billing.invnumber || (billing.billing_id ? `RCT-${billing.billing_id}` : 'DRAFT')
      : billing.invnumber || payment?.receiptnumber || (billing.billing_id ? `INV-${billing.billing_id}` : 'DRAFT');

const barcodeValue = documentNumber;
const qrUrl =
  resolvePublicDocumentUrl(billing, mode, 'view') ||
  `${window.location.origin}`;

const footerText =
  mode === 'invoice'
    ? settings.invoice_footer || 'Goods once sold are not returnable.'
    : isPaid
      ? settings.receipt_footer || 'Thank you for your purchase.'
      : `Balance due: ${currency(Number(billing?.balance_due || 0), currentStore?.currency || 'KES')}. Please settle your outstanding balance.`;

const headerText =
  mode === 'invoice'
    ? settings.invoice_header || ''
    : settings.receipt_header || '';

const documentTitle = mode === 'invoice'
  ? 'Tax Invoice'
  : isPaid
    ? 'Sales Receipt'
    : 'Payment Receipt';

  const vatRows = groupVatSummary(billing.items || []);
  const netAmount = Number(billing.subtotal || 0);
  const vatAmount = Number(billing.vat_amount || 0);
  const totalAmount = Number(billing.total || 0);
  const paidAmount = Number(billing.paid_amount || 0);
  const balanceDue = Number(billing.balance_due || 0);

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
            <div class="item-meta">${qty} x ${currency(
              unitPrice,
              currentStore?.currency || 'KES'
            )} &nbsp; ${escapeHtml(vatAmountText)}(VAT)</div>
          </td>
          <td class="amount-cell">${currency(total, currentStore?.currency || 'KES')}</td>
        </tr>
      `;
    })
    .join('');

  const vatHtml = vatRows
    .map(
      (row) => `
      <tr>
        <td>${row.rate}%</td>
        <td>${currency(row.net, currentStore?.currency || 'KES')}</td>
        <td>${currency(row.vat, currentStore?.currency || 'KES')}</td>
        <td>${currency(row.amount, currentStore?.currency || 'KES')}</td>
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
          margin: 4mm;
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
          font-size: 12px;
          line-height: 1.35;
        }

        body {
          width: ${bodyWidth}mm;
          margin: 0 auto;
          padding: 2mm 0;
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
          showLogo && currentStore?.logo_url
            ? `<div class="logo-wrap"><img src="${escapeHtml(currentStore.logo_url)}" alt="Store Logo" /></div>`
            : ''
        }

        <div class="brand">${escapeHtml(currentStore?.store_name || 'Store')}</div>

        ${
          showStoreContacts && currentStore?.location
            ? `<div class="small">Location: ${escapeHtml(currentStore.location)}</div>`
            : ''
        }
        ${
          showStoreContacts && currentStore?.telephone
            ? `<div class="small">Tel: ${escapeHtml(currentStore.telephone)}</div>`
            : ''
        }
        ${
          showStoreContacts && currentStore?.email_address
            ? `<div class="small">Email: ${escapeHtml(currentStore.email_address)}</div>`
            : ''
        }
        ${
          showStorePin && currentStore?.pin
            ? `<div class="small">KRA PIN: ${escapeHtml(currentStore.pin)}</div>`
            : ''
        }

        <div class="doc-title">${escapeHtml(documentTitle)}</div>

        ${
          headerText
            ? `<div class="header-note">${escapeHtml(headerText)}</div>`
            : ''
        }
      </div>

      <div class="divider"></div>

      <div class="meta-row">
        <div class="label">No</div>
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
          <div class="value">${currency(netAmount, currentStore?.currency || 'KES')}</div>
        </div>

        <div class="line-row">
          <div class="label">VAT Amount</div>
          <div class="value">${currency(vatAmount, currentStore?.currency || 'KES')}</div>
        </div>

        <div class="grand-total">
          <div class="total-row">
            <div class="label"><strong>Total</strong></div>
            <div class="value"><strong>${currency(totalAmount, currentStore?.currency || 'KES')}</strong></div>
          </div>
        </div>

        <div class="line-row">
          <div class="label">Paid</div>
          <div class="value">${currency(paidAmount, currentStore?.currency || 'KES')}</div>
        </div>

        <div class="line-row">
          <div class="label">Balance Due</div>
          <div class="value">${currency(balanceDue, currentStore?.currency || 'KES')}</div>
        </div>

        ${
          payment?.change_returned
            ? `
            <div class="line-row">
              <div class="label">Change</div>
              <div class="value">${currency(payment.change_returned, currentStore?.currency || 'KES')}</div>
            </div>
          `
            : ''
        }
      </div>

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

      <div class="divider"></div>

      <div class="footer-note">${escapeHtml(footerText)}</div>
      ${
        billing.notes
          ? `<div class="footer-note">${escapeHtml(billing.notes)}</div>`
          : ''
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

  const printWindow = window.open('', '_blank', 'width=420,height=900');
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = async () => {
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

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, Number(settings.print_delay_ms || 300));
  };
}
