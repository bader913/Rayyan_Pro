import { dbAll, dbGet } from '../../shared/db/pool.js';
import {
  convertFromUSD,
  getRatesFromSettings,
  type CurrencyCode,
} from '../../shared/utils/currency.js';
import { buildSaleInvoiceReplyByInvoiceNumber } from './assistant.sales.js';
import type { AssistantReply } from './assistant.types.js';
import {
  formatDateTime,
  formatMoney,
  formatNumber,
} from './assistant.utils.js';

type CustomerLookupRow = {
  id: string | number;
  name: string;
  phone: string | null;
  customer_type: string | null;
  credit_limit: string | number | null;
  balance: string | number | null;
};

type CustomerStatementSummaryRow = {
  total_transactions: string | number | null;
  total_debit: string | number | null;
  total_credit: string | number | null;
};

type CustomerStatementTransactionRow = {
  id: string | number;
  transaction_type: string | null;
  reference_id: string | number | null;
  reference_type: string | null;
  debit_amount: string | number | null;
  credit_amount: string | number | null;
  balance_after: string | number | null;
  note: string | null;
  created_at: string | null;
  created_by_name: string | null;
  invoice_number: string | null;
};

type CustomerMonthPurchaseRow = {
  name: string;
  invoices_count: string | number | null;
  net_total: string | number | null;
};

type CustomerDebtRow = {
  name: string;
  balance: string | number | null;
  credit_limit: string | number | null;
  phone: string | null;
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

function cleanupText(value: string): string {
  return value
    .replace(/[#:،,.;!؟?()[\]{}"'`~@%^&*_+=\\/|<>-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripKnownCustomerStatementPhrases(value: string): string {
  const phrases = [
    'كشف حساب العميل',
    'كشف حساب الزبون',
    'كشف حساب الزبونه',
    'كشف العميل',
    'كشف الزبون',
    'كشف الزبونه',
    'حساب العميل',
    'حساب الزبون',
    'حساب الزبونه',
    'كشف حساب',
    'العميل',
    'الزبون',
    'الزبونه',
    'عميل',
    'زبون',
    'زبونه',
    'اريد',
    'أريد',
    'اعرض',
    'ورجيني',
    'جبلي',
    'جيبلي',
    'هات',
    'اعطيني',
    'اعطني',
    'لو سمحت',
    'ممكن',
    'من فضلك',
    'تبع',
    'للعميل',
    'للزبون',
    'للزبونه',
    'الخاص',
    'الخاصة',
    'الخاصه',
    'الحساب',
    'حساب',
    'كشف',
  ];

  let result = ` ${value} `;

  for (const phrase of phrases.sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(phrase, ' ');
  }

  return cleanupText(result);
}

function stripKnownLastCustomerInvoicePhrases(value: string): string {
  const phrases = [
    'آخر فاتورة للعميل',
    'اخر فاتورة للعميل',
    'آخر فاتوره للعميل',
    'اخر فاتوره للعميل',
    'آخر فاتورة للزبون',
    'اخر فاتورة للزبون',
    'آخر فاتوره للزبون',
    'اخر فاتوره للزبون',
    'آخر فاتورة',
    'اخر فاتورة',
    'آخر فاتوره',
    'اخر فاتوره',
    'الفاتورة الاخيرة للعميل',
    'الفاتوره الاخيره للعميل',
    'الفاتورة الاخيرة للزبون',
    'الفاتوره الاخيره للزبون',
    'العميل',
    'الزبون',
    'الزبونه',
    'للعميل',
    'للزبون',
    'للزبونه',
    'فاتورة',
    'فاتوره',
    'الاخيرة',
    'الاخيره',
    'آخر',
    'اخر',
    'اريد',
    'أريد',
    'اعرض',
    'ورجيني',
    'جبلي',
    'جيبلي',
    'هات',
    'اعطيني',
    'اعطني',
    'لو سمحت',
    'ممكن',
    'من فضلك',
  ];

  let result = ` ${value} `;

  for (const phrase of phrases.sort((a, b) => b.length - a.length)) {
    result = result.replaceAll(phrase, ' ');
  }

  return cleanupText(result);
}

function extractCustomerName(message: string, normalized: string): string | null {
  const candidates = [
    stripKnownCustomerStatementPhrases(message),
    stripKnownCustomerStatementPhrases(normalized),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && candidate.length >= 2) {
      return candidate;
    }
  }

  return null;
}

function extractCustomerNameFromLastInvoiceRequest(message: string, normalized: string): string | null {
  const candidates = [
    stripKnownLastCustomerInvoicePhrases(message),
    stripKnownLastCustomerInvoicePhrases(normalized),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && candidate.length >= 2) {
      return candidate;
    }
  }

  return null;
}

function normalizeNameForCompare(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function compactName(value: string): string {
  return value.replace(/\s+/g, '').trim().toLowerCase();
}

async function findCustomerMatches(name: string): Promise<CustomerLookupRow[]> {
  const compact = name.replace(/\s+/g, '').trim();

  return tryDbAll<CustomerLookupRow>([
    {
      sql: `
        SELECT
          c.id,
          c.name,
          c.phone,
          c.customer_type,
          c.credit_limit,
          c.balance
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
}

function resolveBestCustomerMatch(
  inputName: string,
  matches: CustomerLookupRow[]
): { customer: CustomerLookupRow | null; ambiguous: CustomerLookupRow[] } {
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
}

async function getCustomerStatementSummary(customerId: number): Promise<CustomerStatementSummaryRow | null> {
  return tryDbGet<CustomerStatementSummaryRow>([
    {
      sql: `
        SELECT
          COUNT(*) AS total_transactions,
          COALESCE(SUM(debit_amount), 0) AS total_debit,
          COALESCE(SUM(credit_amount), 0) AS total_credit
        FROM customer_account_transactions
        WHERE customer_id = $1
      `,
      params: [customerId],
    },
  ]);
}

async function getCustomerStatementTransactions(
  customerId: number,
  limit = 25
): Promise<CustomerStatementTransactionRow[]> {
  return tryDbAll<CustomerStatementTransactionRow>([
    {
      sql: `
        SELECT
          t.id,
          t.transaction_type,
          t.reference_id,
          t.reference_type,
          t.debit_amount,
          t.credit_amount,
          t.balance_after,
          t.note,
          t.created_at,
          u.full_name AS created_by_name,
          s.invoice_number
        FROM customer_account_transactions t
        LEFT JOIN users u ON u.id = t.created_by
        LEFT JOIN sales s
          ON t.reference_type = 'sale'
         AND t.reference_id = s.id
        WHERE t.customer_id = $1
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $2
      `,
      params: [customerId, limit],
    },
  ]);
}

async function findLatestSaleInvoiceNumberByCustomerId(customerId: number): Promise<string | null> {
  const row = await tryDbGet<{ invoice_number: string | null }>([
    {
      sql: `
        SELECT s.invoice_number
        FROM sales s
        WHERE s.customer_id = $1
        ORDER BY s.created_at DESC, s.id DESC
        LIMIT 1
      `,
      params: [customerId],
    },
  ]);

  return row?.invoice_number || null;
}

async function getTopCustomersMonthRows(limit = 10): Promise<CustomerMonthPurchaseRow[]> {
  return tryDbAll<CustomerMonthPurchaseRow>([
    {
      sql: `
        SELECT
          c.name,
          COUNT(*) AS invoices_count,
          COALESCE(
            SUM(
              GREATEST(COALESCE(s.total_amount, 0) - COALESCE(sr.returned_total, 0), 0)
            ),
            0
          ) AS net_total
        FROM sales s
        JOIN customers c ON c.id = s.customer_id
        LEFT JOIN (
          SELECT
            sale_id,
            COALESCE(SUM(total_amount), 0) AS returned_total
          FROM sales_returns
          GROUP BY sale_id
        ) sr ON sr.sale_id = s.id
        WHERE DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())
        GROUP BY c.id, c.name
        ORDER BY net_total DESC, invoices_count DESC, c.name ASC
        LIMIT $1
      `,
      params: [limit],
    },
  ]);
}

async function getTopCustomersDebtRows(limit = 10): Promise<CustomerDebtRow[]> {
  return tryDbAll<CustomerDebtRow>([
    {
      sql: `
        SELECT
          c.name,
          c.balance,
          c.credit_limit,
          c.phone
        FROM customers c
        WHERE COALESCE(c.balance, 0) > 0
        ORDER BY COALESCE(c.balance, 0) DESC, c.name ASC
        LIMIT $1
      `,
      params: [limit],
    },
  ]);
}

function mapCustomerType(value: string | null): string {
  switch (String(value || '').toLowerCase()) {
    case 'retail':
      return 'مفرق';
    case 'wholesale':
      return 'جملة';
    default:
      return value || 'غير محدد';
  }
}

function describeCustomerBalance(
  balanceUSD: number,
  formatFromUSD: (amountUSD: number) => string
): string {
  if (balanceUSD > 0.000001) {
    return `عليه ${formatFromUSD(balanceUSD)}`;
  }

  if (balanceUSD < -0.000001) {
    return `له رصيد دائن ${formatFromUSD(Math.abs(balanceUSD))}`;
  }

  return 'مسدد بالكامل';
}

function buildBalanceAfterText(
  balanceAfterUSD: number,
  formatFromUSD: (amountUSD: number) => string
): string {
  if (balanceAfterUSD > 0.000001) {
    return `الرصيد بعد الحركة: ${formatFromUSD(balanceAfterUSD)} عليه`;
  }

  if (balanceAfterUSD < -0.000001) {
    return `الرصيد بعد الحركة: ${formatFromUSD(Math.abs(balanceAfterUSD))} له`;
  }

  return 'الرصيد بعد الحركة: 0';
}

function buildTransactionLine(
  row: CustomerStatementTransactionRow,
  index: number,
  formatFromUSD: (amountUSD: number) => string
): string {
  const txType = String(row.transaction_type || '').toLowerCase();
  const debitUSD = Number(row.debit_amount || 0);
  const creditUSD = Number(row.credit_amount || 0);
  const balanceAfterUSD = Number(row.balance_after || 0);
  const note = String(row.note || '').trim();
  const dateText = formatDateTime(row.created_at);
  const balanceText = buildBalanceAfterText(balanceAfterUSD, formatFromUSD);

  if (txType === 'sale') {
    return `${index}. بتاريخ ${dateText} اشترى بمبلغ ${formatFromUSD(debitUSD)}${row.invoice_number ? ` برقم فاتورة ${row.invoice_number}` : ''} — ${balanceText}`;
  }

  if (txType === 'payment') {
    return `${index}. بتاريخ ${dateText} دفع مبلغ ${formatFromUSD(creditUSD)} — ${balanceText}`;
  }

  if (txType === 'adjustment') {
    const amountText =
      debitUSD > 0
        ? `زيادة ${formatFromUSD(debitUSD)}`
        : creditUSD > 0
          ? `تخفيض ${formatFromUSD(creditUSD)}`
          : 'تعديل بدون مبلغ';

    return `${index}. بتاريخ ${dateText} تعديل على الحساب (${amountText})${note ? ` — ${note}` : ''} — ${balanceText}`;
  }

  const movementText =
    debitUSD > 0
      ? `مدين ${formatFromUSD(debitUSD)}`
      : creditUSD > 0
        ? `دائن ${formatFromUSD(creditUSD)}`
        : 'حركة بلا مبلغ';

  return `${index}. بتاريخ ${dateText} ${movementText}${row.invoice_number ? ` — الفاتورة ${row.invoice_number}` : ''}${note ? ` — ${note}` : ''} — ${balanceText}`;
}

export async function buildCustomerStatementReply(
  message: string,
  normalized: string
): Promise<AssistantReply> {
  const { formatFromUSD } = await getCurrencyContext();
  const customerName = extractCustomerName(message, normalized);

  if (!customerName) {
    return {
      intent: 'customer_statement_lookup',
      mode: 'fallback',
      text: 'اذكر اسم العميل بوضوح، مثل: كشف حساب العميل خالد.',
    };
  }

  const matches = await findCustomerMatches(customerName);
  const resolved = resolveBestCustomerMatch(customerName, matches);

  if (!resolved.customer) {
    if (resolved.ambiguous.length > 0) {
      return {
        intent: 'customer_statement_lookup',
        mode: 'fallback',
        text: [
          `وجدت أكثر من عميل قريب من الاسم: ${customerName}`,
          'حدد الاسم بشكل أدق:',
          ...resolved.ambiguous.slice(0, 6).map((row) => `• ${row.name}${row.phone ? ` — ${row.phone}` : ''}`),
        ].join('\n'),
      };
    }

    return {
      intent: 'customer_statement_lookup',
      mode: 'fallback',
      text: `لم أجد عميلًا باسم ${customerName}.`,
    };
  }

  const customer = resolved.customer;
  const customerId = Number(customer.id);
  const summary = await getCustomerStatementSummary(customerId);
  const transactions = await getCustomerStatementTransactions(customerId, 25);

  const balanceUSD = Number(customer.balance || 0);
  const creditLimitUSD = Number(customer.credit_limit || 0);
  const totalTransactions = Number(summary?.total_transactions || 0);
  const totalDebitUSD = Number(summary?.total_debit || 0);
  const totalCreditUSD = Number(summary?.total_credit || 0);

  const lines: string[] = [
    `كشف حساب العميل: ${customer.name}`,
    `• نوع العميل: ${mapCustomerType(customer.customer_type)}`,
    `• الهاتف: ${customer.phone || 'غير مسجل'}`,
    `• الرصيد الحالي: ${describeCustomerBalance(balanceUSD, formatFromUSD)}`,
    `• حد الائتمان: ${formatFromUSD(creditLimitUSD)}`,
    `• إجمالي المبيعات/المدين: ${formatFromUSD(totalDebitUSD)}`,
    `• إجمالي الدفعات/الدائن: ${formatFromUSD(totalCreditUSD)}`,
    `• عدد الحركات المسجلة: ${formatNumber(totalTransactions)}`,
  ];

  if (!transactions.length) {
    lines.push('', 'لا توجد حركات حساب لهذا العميل حتى الآن.');
    return {
      intent: 'customer_statement_lookup',
      mode: 'fallback',
      text: lines.join('\n'),
    };
  }

  lines.push('', `أحدث ${formatNumber(transactions.length)} حركة:`);

  transactions.forEach((row, index) => {
    lines.push(buildTransactionLine(row, index + 1, formatFromUSD));
  });

  if (totalTransactions > transactions.length) {
    lines.push('', `ملاحظة: يتم عرض أحدث ${formatNumber(transactions.length)} حركة فقط.`);
  }

  return {
    intent: 'customer_statement_lookup',
    mode: 'fallback',
    text: lines.join('\n'),
  };
}

export async function buildLastCustomerInvoiceReply(
  message: string,
  normalized: string
): Promise<AssistantReply> {
  const customerName = extractCustomerNameFromLastInvoiceRequest(message, normalized);

  if (!customerName) {
    return {
      intent: 'last_customer_invoice_lookup',
      mode: 'fallback',
      text: 'اذكر اسم العميل بوضوح، مثل: آخر فاتورة للعميل خالد.',
    };
  }

  const matches = await findCustomerMatches(customerName);
  const resolved = resolveBestCustomerMatch(customerName, matches);

  if (!resolved.customer) {
    if (resolved.ambiguous.length > 0) {
      return {
        intent: 'last_customer_invoice_lookup',
        mode: 'fallback',
        text: [
          `وجدت أكثر من عميل قريب من الاسم: ${customerName}`,
          'حدد الاسم بشكل أدق:',
          ...resolved.ambiguous.slice(0, 6).map((row) => `• ${row.name}${row.phone ? ` — ${row.phone}` : ''}`),
        ].join('\n'),
      };
    }

    return {
      intent: 'last_customer_invoice_lookup',
      mode: 'fallback',
      text: `لم أجد عميلًا باسم ${customerName}.`,
    };
  }

  const customer = resolved.customer;
  const invoiceNumber = await findLatestSaleInvoiceNumberByCustomerId(Number(customer.id));

  if (!invoiceNumber) {
    return {
      intent: 'last_customer_invoice_lookup',
      mode: 'fallback',
      text: `لا توجد فواتير بيع مسجلة لهذا العميل: ${customer.name}.`,
    };
  }

  const invoiceReply = await buildSaleInvoiceReplyByInvoiceNumber(invoiceNumber);

  if (!invoiceReply) {
    return {
      intent: 'last_customer_invoice_lookup',
      mode: 'fallback',
      text: `وجدت الفاتورة الأخيرة للعميل ${customer.name} لكن تعذر عرض تفاصيلها الآن.`,
    };
  }

  return {
    ...invoiceReply,
    intent: 'last_customer_invoice_lookup',
    text: [
      `آخر فاتورة للعميل: ${customer.name}`,
      '',
      invoiceReply.text,
    ].join('\n'),
  };
}

export async function buildTopCustomersMonthReply(): Promise<AssistantReply> {
  const { formatFromUSD } = await getCurrencyContext();
  const rows = await getTopCustomersMonthRows(10);

  if (!rows.length) {
    return {
      intent: 'top_customers_month',
      mode: 'fallback',
      text: 'لا توجد مبيعات عملاء كافية هذا الشهر لعرض الترتيب.',
    };
  }

  const lines: string[] = ['أكثر العملاء شراء هذا الشهر:'];

  rows.forEach((row, index) => {
    lines.push(
      `${index + 1}. ${row.name} — ${formatFromUSD(Number(row.net_total || 0))} عبر ${formatNumber(Number(row.invoices_count || 0))} فاتورة`
    );
  });

  return {
    intent: 'top_customers_month',
    mode: 'fallback',
    text: lines.join('\n'),
  };
}

export async function buildTopCustomersDebtReply(): Promise<AssistantReply> {
  const { formatFromUSD } = await getCurrencyContext();
  const rows = await getTopCustomersDebtRows(10);

  if (!rows.length) {
    return {
      intent: 'top_customers_debt',
      mode: 'fallback',
      text: 'لا يوجد عملاء عليهم ديون حاليًا.',
    };
  }

  const lines: string[] = ['أكثر العملاء مديونية حاليًا:'];

  rows.forEach((row, index) => {
    const balanceUSD = Number(row.balance || 0);
    const creditLimitUSD = Number(row.credit_limit || 0);

    lines.push(
      `${index + 1}. ${row.name} — عليه ${formatFromUSD(balanceUSD)}${creditLimitUSD > 0 ? ` — حد الائتمان ${formatFromUSD(creditLimitUSD)}` : ''}`
    );
  });

  return {
    intent: 'top_customers_debt',
    mode: 'fallback',
    text: lines.join('\n'),
  };
}