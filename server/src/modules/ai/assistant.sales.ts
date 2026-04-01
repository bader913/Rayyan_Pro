import { dbAll, dbGet } from '../../shared/db/pool.js';
import {
  convertFromUSD,
  getRatesFromSettings,
  type CurrencyCode,
} from '../../shared/utils/currency.js';
import type { AssistantReply } from './assistant.types.js';
import {
  formatDateTime,
  formatMoney,
  formatNumber,
} from './assistant.utils.js';

type SaleInvoiceRow = {
  id: string | number;
  invoice_number: string;
  created_at: string | null;
  sale_type: string | null;
  payment_method: string | null;
  subtotal: string | number | null;
  discount: string | number | null;
  total_amount: string | number | null;
  paid_amount: string | number | null;
  customer_name: string | null;
  cashier_name: string | null;
  warehouse_name: string | null;
  warehouse_code: string | null;
  returned_total: string | number | null;
  returns_count: string | number | null;
  notes: string | null;
};

type SaleInvoiceItemRow = {
  product_name: string | null;
  quantity: string | number | null;
  unit: string | null;
  unit_price: string | number | null;
  discount: string | number | null;
  total_price: string | number | null;
};

type SettingsRow = {
  key: string;
  value: string | null;
};

async function tryDbGet<T>(queries: Array<{ sql: string; params?: unknown[] }>): Promise<T | null> {
  for (const query of queries) {
    try {
      const row = await dbGet<T>(query.sql, query.params ?? []);
      if (row) return row;
    } catch {
      // try next query
    }
  }
  return null;
}

async function tryDbAll<T>(queries: Array<{ sql: string; params?: unknown[] }>): Promise<T[]> {
  for (const query of queries) {
    try {
      const rows = await dbAll<T>(query.sql, query.params ?? []);
      if (rows) return rows;
    } catch {
      // try next query
    }
  }
  return [];
}

function toCurrencyCode(value: string | null | undefined): CurrencyCode {
  const code = String(value || 'USD').trim().toUpperCase();
  if (code === 'SYP' || code === 'TRY' || code === 'SAR' || code === 'AED' || code === 'USD') {
    return code;
  }
  return 'USD';
}

async function getCurrencyContext(): Promise<{
  formatFromUSD: (amountUSD: number) => string;
}> {
  const rows = await tryDbAll<SettingsRow>([
    {
      sql: `
        SELECT key, value
        FROM settings
        WHERE key IN ('currency', 'usd_to_syp', 'usd_to_try', 'usd_to_sar', 'usd_to_aed')
      `,
    },
  ]);

  const settings = Object.fromEntries(
    rows.map((row) => [row.key, row.value ?? ''])
  ) as Record<string, string>;

  const currency = toCurrencyCode(settings.currency);
  const rates = getRatesFromSettings(settings);

  return {
    formatFromUSD: (amountUSD: number) =>
      formatMoney(convertFromUSD(Number(amountUSD || 0), currency, rates), currency),
  };
}

function toEnglishDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function normalizeInvoiceToken(value: string): string {
  return toEnglishDigits(value)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
    .toUpperCase();
}

function extractInvoiceLookupInput(message: string, normalized: string): {
  value: string | null;
  mode: 'full' | 'suffix';
} {
  const raw = toEnglishDigits(message);
  const normalizedText = toEnglishDigits(normalized);

  const hasInvoiceContext =
    /فاتور|مبيع|بيع|invoice/i.test(raw) ||
    /فاتور|مبيع|بيع|invoice/i.test(normalizedText);

  if (!hasInvoiceContext) {
    return { value: null, mode: 'suffix' };
  }

  const fullPattern =
    /\b([A-Z]{2,10}-\d{2,4}-\d{1,10})\b/i;

  const fullFromRaw = raw.match(fullPattern);
  if (fullFromRaw?.[1]) {
    return {
      value: normalizeInvoiceToken(fullFromRaw[1]),
      mode: 'full',
    };
  }

  const fullFromNormalized = normalizedText.match(fullPattern);
  if (fullFromNormalized?.[1]) {
    return {
      value: normalizeInvoiceToken(fullFromNormalized[1]),
      mode: 'full',
    };
  }

  const numberAfterKeyword =
    raw.match(/(?:رقم|number|no\.?|#)\s*[:\-]?\s*([A-Z]{2,10}-\d{2,4}-\d{1,10}|\d{1,10})\b/i) ||
    normalizedText.match(/(?:رقم|number|no\.?|#)\s*[:\-]?\s*([A-Z]{2,10}-\d{2,4}-\d{1,10}|\d{1,10})\b/i);

  if (numberAfterKeyword?.[1]) {
    const token = normalizeInvoiceToken(numberAfterKeyword[1]);
    return {
      value: token,
      mode: /^[0-9]+$/.test(token) ? 'suffix' : 'full',
    };
  }

  const standaloneNumber =
    raw.match(/\b(\d{1,10})\b/) ||
    normalizedText.match(/\b(\d{1,10})\b/);

  if (standaloneNumber?.[1]) {
    return {
      value: normalizeInvoiceToken(standaloneNumber[1]),
      mode: 'suffix',
    };
  }

  return { value: null, mode: 'suffix' };
}

function mapPaymentMethod(value: string | null): string {
  switch (String(value || '').toLowerCase()) {
    case 'cash':
      return 'نقدي';
    case 'card':
      return 'بطاقة';
    case 'credit':
      return 'آجل';
    case 'mixed':
      return 'مختلط';
    default:
      return value || 'غير محدد';
  }
}

function mapSaleType(value: string | null): string {
  switch (String(value || '').toLowerCase()) {
    case 'retail':
      return 'مفرق';
    case 'wholesale':
      return 'جملة';
    default:
      return value || 'غير محدد';
  }
}

async function findSaleInvoiceByFullInvoiceNumber(invoiceNumber: string): Promise<SaleInvoiceRow | null> {
  return tryDbGet<SaleInvoiceRow>([
    {
      sql: `
        SELECT
          s.id,
          s.invoice_number,
          s.created_at,
          s.sale_type,
          s.payment_method,
          s.subtotal,
          s.discount,
          s.total_amount,
          s.paid_amount,
          c.name AS customer_name,
          u.full_name AS cashier_name,
          w.name AS warehouse_name,
          w.code AS warehouse_code,
          COALESCE(sr.returned_total, 0) AS returned_total,
          COALESCE(sr.returns_count, 0) AS returns_count,
          s.notes
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN warehouses w ON w.id = s.warehouse_id
        LEFT JOIN (
          SELECT
            sale_id,
            COUNT(*) AS returns_count,
            COALESCE(SUM(total_amount), 0) AS returned_total
          FROM sales_returns
          GROUP BY sale_id
        ) sr ON sr.sale_id = s.id
        WHERE UPPER(s.invoice_number) = UPPER($1)
        LIMIT 1
      `,
      params: [invoiceNumber],
    },
  ]);
}

async function findSaleInvoicesByNumericSuffix(suffix: string): Promise<SaleInvoiceRow[]> {
  return tryDbAll<SaleInvoiceRow>([
    {
      sql: `
        SELECT
          s.id,
          s.invoice_number,
          s.created_at,
          s.sale_type,
          s.payment_method,
          s.subtotal,
          s.discount,
          s.total_amount,
          s.paid_amount,
          c.name AS customer_name,
          u.full_name AS cashier_name,
          w.name AS warehouse_name,
          w.code AS warehouse_code,
          COALESCE(sr.returned_total, 0) AS returned_total,
          COALESCE(sr.returns_count, 0) AS returns_count,
          s.notes
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN warehouses w ON w.id = s.warehouse_id
        LEFT JOIN (
          SELECT
            sale_id,
            COUNT(*) AS returns_count,
            COALESCE(SUM(total_amount), 0) AS returned_total
          FROM sales_returns
          GROUP BY sale_id
        ) sr ON sr.sale_id = s.id
        WHERE COALESCE(LTRIM(REGEXP_REPLACE(s.invoice_number, '^.*-', ''), '0'), '') =
              COALESCE(LTRIM($1, '0'), '')
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 3
      `,
      params: [suffix],
    },
  ]);
}

async function getSaleInvoiceItems(saleId: number): Promise<SaleInvoiceItemRow[]> {
  return tryDbAll<SaleInvoiceItemRow>([
    {
      sql: `
        SELECT
          p.name AS product_name,
          si.quantity,
          p.unit,
          si.unit_price,
          si.discount,
          si.total_price
        FROM sale_items si
        JOIN products p ON p.id = si.product_id
        WHERE si.sale_id = $1
        ORDER BY si.id ASC
      `,
      params: [saleId],
    },
  ]);
}

async function getLatestSales(limit: number): Promise<SaleInvoiceRow[]> {
  return tryDbAll<SaleInvoiceRow>([
    {
      sql: `
        SELECT
          s.id,
          s.invoice_number,
          s.created_at,
          s.sale_type,
          s.payment_method,
          s.subtotal,
          s.discount,
          s.total_amount,
          s.paid_amount,
          c.name AS customer_name,
          u.full_name AS cashier_name,
          w.name AS warehouse_name,
          w.code AS warehouse_code,
          COALESCE(sr.returned_total, 0) AS returned_total,
          COALESCE(sr.returns_count, 0) AS returns_count,
          s.notes
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN warehouses w ON w.id = s.warehouse_id
        LEFT JOIN (
          SELECT
            sale_id,
            COUNT(*) AS returns_count,
            COALESCE(SUM(total_amount), 0) AS returned_total
          FROM sales_returns
          GROUP BY sale_id
        ) sr ON sr.sale_id = s.id
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT $1
      `,
      params: [limit],
    },
  ]);
}

async function buildSaleInvoiceDetailsReply(
  sale: SaleInvoiceRow,
  formatFromUSD: (amountUSD: number) => string
): Promise<AssistantReply> {
  const items = await getSaleInvoiceItems(Number(sale.id));
  const returnedTotal = Number(sale.returned_total || 0);
  const returnsCount = Number(sale.returns_count || 0);
  const subtotal = Number(sale.subtotal || 0);
  const discount = Number(sale.discount || 0);
  const totalAmount = Number(sale.total_amount || 0);
  const paidAmount = Number(sale.paid_amount || 0);
  const dueAmount = totalAmount - paidAmount;

  const lines: string[] = [
    'تم العثور على فاتورة البيع:',
    `• رقم الفاتورة: ${sale.invoice_number}`,
    `• التاريخ: ${formatDateTime(sale.created_at)}`,
    `• العميل: ${sale.customer_name || 'زبون نقدي'}`,
    `• الكاشير: ${sale.cashier_name || 'غير محدد'}`,
    `• المستودع: ${sale.warehouse_name ? `${sale.warehouse_name}${sale.warehouse_code ? ` (${sale.warehouse_code})` : ''}` : 'غير محدد'}`,
    `• نوع البيع: ${mapSaleType(sale.sale_type)}`,
    `• طريقة الدفع: ${mapPaymentMethod(sale.payment_method)}`,
    `• الإجمالي الفرعي: ${formatFromUSD(subtotal)}`,
    `• الخصم: ${formatFromUSD(discount)}`,
    `• الإجمالي النهائي: ${formatFromUSD(totalAmount)}`,
    `• المدفوع: ${formatFromUSD(paidAmount)}`,
    `• المتبقي: ${formatFromUSD(dueAmount)}`,
  ];

  if (returnsCount > 0 || returnedTotal > 0) {
    lines.push(
      `• المرتجعات المسجلة عليها: ${formatNumber(returnsCount)} بقيمة ${formatFromUSD(returnedTotal)}`
    );
  }

  if (sale.notes && String(sale.notes).trim()) {
    lines.push(`• ملاحظات: ${String(sale.notes).trim()}`);
  }

  if (items.length > 0) {
    lines.push('', 'أصناف الفاتورة:');

    items.forEach((item, index) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      const itemDiscount = Number(item.discount || 0);
      const totalPrice = Number(item.total_price || 0);
      const unitText = item.unit ? ` ${item.unit}` : '';

      lines.push(
        `${index + 1}. ${item.product_name || 'منتج'} — ${formatNumber(quantity)}${unitText} × ${formatFromUSD(unitPrice)} = ${formatFromUSD(totalPrice)}${itemDiscount > 0 ? ` (خصم ${formatFromUSD(itemDiscount)})` : ''}`
      );
    });
  }

  return {
    intent: 'sale_invoice_lookup',
    mode: 'fallback',
    text: lines.join('\n'),
  };
}

export async function buildSaleInvoiceReplyByInvoiceNumber(
  invoiceNumber: string
): Promise<AssistantReply | null> {
  const { formatFromUSD } = await getCurrencyContext();
  const sale = await findSaleInvoiceByFullInvoiceNumber(invoiceNumber);

  if (!sale) return null;

  return buildSaleInvoiceDetailsReply(sale, formatFromUSD);
}

export async function buildSaleInvoiceReply(
  message: string,
  normalized: string
): Promise<AssistantReply> {
  const { formatFromUSD } = await getCurrencyContext();
  const extracted = extractInvoiceLookupInput(message, normalized);

  if (!extracted.value) {
    return {
      intent: 'sale_invoice_lookup',
      mode: 'fallback',
      text: 'اذكر رقم الفاتورة بوضوح، مثل: INV-2026-000123 أو 123.',
    };
  }

  let sale: SaleInvoiceRow | null = null;

  if (extracted.mode === 'full') {
    sale = await findSaleInvoiceByFullInvoiceNumber(extracted.value);
  } else {
    const matches = await findSaleInvoicesByNumericSuffix(extracted.value);

    if (matches.length > 1) {
      return {
        intent: 'sale_invoice_lookup',
        mode: 'fallback',
        text: [
          `وجدت أكثر من فاتورة تحمل الرقم التسلسلي ${extracted.value}.`,
          'اذكر رقم الفاتورة كاملًا لتحديدها بدقة.',
          ...matches.map((row) => `• ${row.invoice_number} — ${formatDateTime(row.created_at)}`),
        ].join('\n'),
      };
    }

    sale = matches[0] ?? null;
  }

  if (!sale) {
    return {
      intent: 'sale_invoice_lookup',
      mode: 'fallback',
      text: `لم أجد فاتورة بيع برقم ${extracted.value}.`,
    };
  }

  return buildSaleInvoiceDetailsReply(sale, formatFromUSD);
}

export async function buildLastFiveSalesReply(
  message?: string,
  normalized?: string
): Promise<AssistantReply> {
  const { formatFromUSD } = await getCurrencyContext();

  const cleanupText = (value: string): string =>
    value
      .replace(/[#:،,.;!؟?()[\]{}"'`~@%^&*_+=\\/|<>-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const stripKnownLastFiveCustomerPhrases = (value: string): string => {
    const phrases = [
      'آخر 5 فواتير للعميل',
      'اخر 5 فواتير للعميل',
      'آخر ٥ فواتير للعميل',
      'اخر ٥ فواتير للعميل',
      'آخر خمس فواتير للعميل',
      'اخر خمس فواتير للعميل',
      'آخر خمسة فواتير للعميل',
      'اخر خمسة فواتير للعميل',
      'آخر 5 فواتير للزبون',
      'اخر 5 فواتير للزبون',
      'آخر ٥ فواتير للزبون',
      'اخر ٥ فواتير للزبون',
      'آخر خمس فواتير للزبون',
      'اخر خمس فواتير للزبون',
      'آخر خمسة فواتير للزبون',
      'اخر خمسة فواتير للزبون',
      'آخر 5 فواتير',
      'اخر 5 فواتير',
      'آخر ٥ فواتير',
      'اخر ٥ فواتير',
      'آخر خمس فواتير',
      'اخر خمس فواتير',
      'آخر خمسة فواتير',
      'اخر خمسة فواتير',
      'للعميل',
      'للزبون',
      'العميل',
      'الزبون',
      'الزبونه',
      'اعرض',
      'ورجيني',
      'جبلي',
      'جيبلي',
      'هات',
      'اعطيني',
      'اعطني',
      'اريد',
      'أريد',
      'لو سمحت',
      'ممكن',
      'من فضلك',
    ];

    let result = ` ${value} `;

    for (const phrase of phrases.sort((a, b) => b.length - a.length)) {
      result = result.replaceAll(phrase, ' ');
    }

    return cleanupText(result);
  };

  const extractCustomerNameFromLastFiveRequest = (): string | null => {
    const candidates = [
      stripKnownLastFiveCustomerPhrases(message || ''),
      stripKnownLastFiveCustomerPhrases(normalized || ''),
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (candidate && candidate.length >= 2) {
        return candidate;
      }
    }

    return null;
  };

  const normalizeNameForCompare = (value: string): string =>
    value.replace(/\s+/g, ' ').trim().toLowerCase();

  const compactName = (value: string): string =>
    value.replace(/\s+/g, '').trim().toLowerCase();

  const findCustomerMatches = async (name: string) => {
    const compact = name.replace(/\s+/g, '').trim();

    return tryDbAll<{
      id: string | number;
      name: string;
      phone: string | null;
    }>([
      {
        sql: `
          SELECT
            c.id,
            c.name,
            c.phone
          FROM customers c
          WHERE
            c.name ILIKE $2
            OR REPLACE(c.name, ' ', '') ILIKE $3
          ORDER BY
            CASE
              WHEN LOWER(TRIM(c.name)) = LOWER(TRIM($1)) THEN 0
              WHEN LOWER(REPLACE(c.name, ' ', '')) = LOWER(REPLACE($1, ' ', '')) THEN 1
              ELSE 2
            END,
            c.created_at DESC,
            c.name ASC
          LIMIT 8
        `,
        params: [name, `%${name}%`, `%${compact}%`],
      },
    ]);
  };

  const resolveBestCustomerMatch = (
    inputName: string,
    matches: Array<{ id: string | number; name: string; phone: string | null }>
  ): {
    customer: { id: string | number; name: string; phone: string | null } | null;
    ambiguous: Array<{ id: string | number; name: string; phone: string | null }>;
  } => {
    if (!matches.length) {
      return { customer: null, ambiguous: [] };
    }

    const exactRows = matches.filter((row) => {
      return (
        normalizeNameForCompare(String(row.name || '')) === normalizeNameForCompare(inputName) ||
        compactName(String(row.name || '')) === compactName(inputName)
      );
    });

    if (exactRows.length === 1) {
      return { customer: exactRows[0], ambiguous: [] };
    }

    if (matches.length === 1) {
      return { customer: matches[0], ambiguous: [] };
    }

    return { customer: null, ambiguous: exactRows.length > 1 ? exactRows : matches };
  };

  const getLatestSalesByCustomerId = async (customerId: number, limit: number): Promise<SaleInvoiceRow[]> => {
    return tryDbAll<SaleInvoiceRow>([
      {
        sql: `
          SELECT
            s.id,
            s.invoice_number,
            s.created_at,
            s.sale_type,
            s.payment_method,
            s.subtotal,
            s.discount,
            s.total_amount,
            s.paid_amount,
            c.name AS customer_name,
            u.full_name AS cashier_name,
            w.name AS warehouse_name,
            w.code AS warehouse_code,
            COALESCE(sr.returned_total, 0) AS returned_total,
            COALESCE(sr.returns_count, 0) AS returns_count,
            s.notes
          FROM sales s
          LEFT JOIN customers c ON c.id = s.customer_id
          LEFT JOIN users u ON u.id = s.user_id
          LEFT JOIN warehouses w ON w.id = s.warehouse_id
          LEFT JOIN (
            SELECT
              sale_id,
              COUNT(*) AS returns_count,
              COALESCE(SUM(total_amount), 0) AS returned_total
            FROM sales_returns
            GROUP BY sale_id
          ) sr ON sr.sale_id = s.id
          WHERE s.customer_id = $1
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT $2
        `,
        params: [customerId, limit],
      },
    ]);
  };

  const requestedCustomerName = extractCustomerNameFromLastFiveRequest();

  if (requestedCustomerName) {
    const matches = await findCustomerMatches(requestedCustomerName);
    const resolved = resolveBestCustomerMatch(requestedCustomerName, matches);

    if (!resolved.customer) {
      if (resolved.ambiguous.length > 0) {
        return {
          intent: 'last_five_sales_lookup',
          mode: 'fallback',
          text: [
            `وجدت أكثر من عميل قريب من الاسم: ${requestedCustomerName}`,
            'حدد الاسم بشكل أدق:',
            ...resolved.ambiguous.slice(0, 6).map((row) => `• ${row.name}${row.phone ? ` — ${row.phone}` : ''}`),
          ].join('\n'),
        };
      }

      return {
        intent: 'last_five_sales_lookup',
        mode: 'fallback',
        text: `لم أجد عميلًا باسم ${requestedCustomerName}.`,
      };
    }

    const customer = resolved.customer;
    const rows = await getLatestSalesByCustomerId(Number(customer.id), 5);

    if (!rows.length) {
      return {
        intent: 'last_five_sales_lookup',
        mode: 'fallback',
        text: `لا توجد فواتير بيع لهذا العميل: ${customer.name}.`,
      };
    }

    const lines = rows.map((row, index) => {
      const totalAmount = Number(row.total_amount || 0);
      const returnedTotal = Number(row.returned_total || 0);
      const netAmount = Math.max(totalAmount - returnedTotal, 0);

      return `${index + 1}. ${row.invoice_number} — ${formatFromUSD(netAmount)} — ${formatDateTime(row.created_at)}`;
    });

    return {
      intent: 'last_five_sales_lookup',
      mode: 'fallback',
      text: [`آخر 5 فواتير للعميل ${customer.name}:`, ...lines].join('\n'),
    };
  }

  const rows = await getLatestSales(5);

  if (!rows.length) {
    return {
      intent: 'last_five_sales_lookup',
      mode: 'fallback',
      text: 'لا توجد فواتير بيع حديثة حاليًا.',
    };
  }

  const lines = rows.map((row, index) => {
    const totalAmount = Number(row.total_amount || 0);
    const returnedTotal = Number(row.returned_total || 0);
    const netAmount = Math.max(totalAmount - returnedTotal, 0);

    return `${index + 1}. ${row.invoice_number} — ${row.customer_name || 'زبون نقدي'} — ${formatFromUSD(netAmount)} — ${formatDateTime(row.created_at)}`;
  });

  return {
    intent: 'last_five_sales_lookup',
    mode: 'fallback',
    text: ['آخر 5 فواتير بيع:', ...lines].join('\n'),
  };
}