const DEFAULT_STORE_SETTINGS = {
  default_vat_rate: 15,
  low_stock_alert: 5,

  spacious_layout: true,
  show_product_images: true,

  receipt_header: '',
  invoice_header: '',
  receipt_footer: 'Thank you for your purchase.',
  invoice_footer: 'Goods once sold are not returnable.',

  show_barcode: true,
  show_qrcode: true,
  show_vat_summary: true,
  show_customer_on_print: true,
  show_cashier_on_print: true,
  show_logo_on_print: true,
  show_store_contacts_on_print: true,
  show_store_pin_on_print: true,
  show_payment_method_on_print: true,

  paper_width: 80,
  print_delay_ms: 300,

  document_sequences: {
    invoice: {
      prefix: 'INV-',
      suffix: '',
      last_number: 0,
    },
    receipt: {
      prefix: 'REC-',
      suffix: '',
      last_number: 0,
    },
  },
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }

  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }

  return fallback;
};

const normalizeSequencesFromArray = (sequenceArray = []) => {
  if (!Array.isArray(sequenceArray)) {
    return {};
  }

  return sequenceArray.reduce((acc, item) => {
    if (!item?.document_type) {
      return acc;
    }

    acc[item.document_type] = {
      prefix: item.prefix ?? '',
      suffix: item.suffix ?? '',
      last_number: toNumber(item.last_number, 0),
    };

    return acc;
  }, {});
};

export function mergeStoreSettings(source = {}) {
  const rawSettings =
    source?.settings && !Array.isArray(source.settings)
      ? source.settings
      : source?.settings ?? source ?? {};

  const sequenceMap =
    source?.document_sequences && !Array.isArray(source.document_sequences)
      ? source.document_sequences
      : normalizeSequencesFromArray(source?.document_sequences ?? source?.documentSequences ?? []);

  return {
    ...DEFAULT_STORE_SETTINGS,

    default_vat_rate: toNumber(rawSettings.default_vat_rate, DEFAULT_STORE_SETTINGS.default_vat_rate),
    low_stock_alert: toNumber(rawSettings.low_stock_alert, DEFAULT_STORE_SETTINGS.low_stock_alert),

    spacious_layout: toBoolean(rawSettings.spacious_layout, DEFAULT_STORE_SETTINGS.spacious_layout),
    show_product_images: toBoolean(rawSettings.show_product_images, DEFAULT_STORE_SETTINGS.show_product_images),

    receipt_header: rawSettings.receipt_header ?? DEFAULT_STORE_SETTINGS.receipt_header,
    invoice_header: rawSettings.invoice_header ?? DEFAULT_STORE_SETTINGS.invoice_header,
    receipt_footer: rawSettings.receipt_footer ?? DEFAULT_STORE_SETTINGS.receipt_footer,
    invoice_footer: rawSettings.invoice_footer ?? DEFAULT_STORE_SETTINGS.invoice_footer,

    show_barcode: toBoolean(rawSettings.show_barcode, DEFAULT_STORE_SETTINGS.show_barcode),
    show_qrcode: toBoolean(rawSettings.show_qrcode, DEFAULT_STORE_SETTINGS.show_qrcode),
    show_vat_summary: toBoolean(rawSettings.show_vat_summary, DEFAULT_STORE_SETTINGS.show_vat_summary),
    show_customer_on_print: toBoolean(rawSettings.show_customer_on_print, DEFAULT_STORE_SETTINGS.show_customer_on_print),
    show_cashier_on_print: toBoolean(rawSettings.show_cashier_on_print, DEFAULT_STORE_SETTINGS.show_cashier_on_print),
    show_logo_on_print: toBoolean(rawSettings.show_logo_on_print, DEFAULT_STORE_SETTINGS.show_logo_on_print),
    show_store_contacts_on_print: toBoolean(rawSettings.show_store_contacts_on_print, DEFAULT_STORE_SETTINGS.show_store_contacts_on_print),
    show_store_pin_on_print: toBoolean(rawSettings.show_store_pin_on_print, DEFAULT_STORE_SETTINGS.show_store_pin_on_print),
    show_payment_method_on_print: toBoolean(rawSettings.show_payment_method_on_print, DEFAULT_STORE_SETTINGS.show_payment_method_on_print),

    paper_width: toNumber(rawSettings.paper_width, DEFAULT_STORE_SETTINGS.paper_width),
    print_delay_ms: toNumber(rawSettings.print_delay_ms, DEFAULT_STORE_SETTINGS.print_delay_ms),

    document_sequences: {
      invoice: {
        ...DEFAULT_STORE_SETTINGS.document_sequences.invoice,
        ...(sequenceMap.invoice ?? {}),
        last_number: toNumber(
          sequenceMap.invoice?.last_number,
          DEFAULT_STORE_SETTINGS.document_sequences.invoice.last_number
        ),
      },
      receipt: {
        ...DEFAULT_STORE_SETTINGS.document_sequences.receipt,
        ...(sequenceMap.receipt ?? {}),
        last_number: toNumber(
          sequenceMap.receipt?.last_number,
          DEFAULT_STORE_SETTINGS.document_sequences.receipt.last_number
        ),
      },
    },
  };
}
