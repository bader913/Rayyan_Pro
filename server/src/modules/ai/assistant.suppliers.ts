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

type SupplierLookupRow = {
  id: string | number;
  name: string;
  phone: string | null;
  balance: string | number | null;
};

type SupplierStatementSummaryRow = {
  total_transactions: string | number | null;
  total_debit: string | number | null;
  total_credit: string | number | null;
};

type SupplierStatementTransactionRow = {
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

function stripKnownSupplierStatementPhrases(value: string): string {
  const phrases = [
    'كشف حساب المورد',
    'كشف المورد',
    'حساب المورد',
    'كشف حساب مورد',
    'كشف مورد',
    'حساب مورد',
    'المورد',
    'مورد',
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
    'للمورد',
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

function extractSupplierName(message: string, normalized: string): string | null {
  const candidates = [
    stripKnownSupplierStatementPhrases(message),
    stripKnownSupplierStatementPhrases(normalized),
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

async function findSupplierMatches(name: string): Promise<SupplierLookupRow[]> {
  const compact = name.replace(/\s+/g, '').trim();

  return tryDbAll<SupplierLookupRow>([
    {
      sql: `
        SELECT
          s.id,
          s.name,
          s.phone,
          s.balance
        FROM suppliers s
        WHERE
          s.name ILIKE $2
          OR REPLACE(s.name, ' ', '') ILIKE $3
        ORDER BY
          CASE
            WHEN LOWER(TRIM(s.name)) = LOWER(TRIM($1)) THEN 0
            WHEN LOWER(REPLACE(s.name, ' ', '')) = LOWER(REPLACE($1, ' ', '')) THEN 1
            ELSE 2
          END,
          s.created_at DESC,
          s.name ASC
        LIMIT 8
      `,
      params: [name, `%${name}%`, `%${compact}%`],
    },
  ]);
}

function resolveBestSupplierMatch(
  inputName: string,
  matches: SupplierLookupRow[]
): { supplier: SupplierLookupRow | null; ambiguous: SupplierLookupRow[] } {
  if (!matches.length) {
    return { supplier: null, ambiguous: [] };
  }

  const exactRows = matches.filter((row) => {
    return (
      normalizeNameForCompare(String(row.name || '')) === normalizeNameForCompare(inputName) ||
      compactName(String(row.name || '')) === compactName(inputName)
    );
  });

  if (exactRows.length === 1) {
    return { supplier: exactRows[0], ambiguous: [] };
  }

  if (matches.length === 1) {
    return { supplier: matches[0], ambiguous: [] };
  }

  return { supplier: null, ambiguous: exactRows.length > 1 ? exactRows : matches };
}

async function getSupplierStatementSummary(supplierId: number): Promise<SupplierStatementSummaryRow | null> {
  return tryDbGet<SupplierStatementSummaryRow>([
    {
      sql: `
        SELECT
          COUNT(*) AS total_transactions,
          COALESCE(SUM(debit_amount), 0) AS total_debit,
          COALESCE(SUM(credit_amount), 0) AS total_credit
        FROM supplier_account_transactions
        WHERE supplier_id = $1
      `,
      params: [supplierId],
    },
  ]);
}

async function getSupplierStatementTransactions(
  supplierId: number,
  limit = 25
): Promise<SupplierStatementTransactionRow[]> {
  return tryDbAll<SupplierStatementTransactionRow>([
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
          p.invoice_number
        FROM supplier_account_transactions t
        LEFT JOIN users u ON u.id = t.created_by
        LEFT JOIN purchases p
          ON t.reference_type = 'purchase'
         AND t.reference_id = p.id
        WHERE t.supplier_id = $1
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $2
      `,
      params: [supplierId, limit],
    },
    {
      sql: `
        SELECT
          t.id,
          NULL::text AS reference_id,
          NULL::text AS reference_type,
          t.transaction_type,
          t.debit_amount,
          t.credit_amount,
          t.balance_after,
          t.note,
          t.created_at,
          u.full_name AS created_by_name,
          NULL::text AS invoice_number
        FROM supplier_account_transactions t
        LEFT JOIN users u ON u.id = t.created_by
        WHERE t.supplier_id = $1
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $2
      `,
      params: [supplierId, limit],
    },
  ]);
}

function describeSupplierBalance(
  balanceUSD: number,
  formatFromUSD: (amountUSD: number) => string
): string {
  if (balanceUSD > 0.000001) {
    return `علينا ${formatFromUSD(balanceUSD)}`;
  }

  if (balanceUSD < -0.000001) {
    return `لنا رصيد ${formatFromUSD(Math.abs(balanceUSD))}`;
  }

  return 'مسدد بالكامل';
}

function buildBalanceAfterText(
  balanceAfterUSD: number,
  formatFromUSD: (amountUSD: number) => string
): string {
  if (balanceAfterUSD > 0.000001) {
    return `الرصيد بعد الحركة: علينا ${formatFromUSD(balanceAfterUSD)}`;
  }

  if (balanceAfterUSD < -0.000001) {
    return `الرصيد بعد الحركة: لنا ${formatFromUSD(Math.abs(balanceAfterUSD))}`;
  }

  return 'الرصيد بعد الحركة: 0';
}

function buildTransactionLine(
  row: SupplierStatementTransactionRow,
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

  if (txType === 'purchase') {
    const amountUSD = creditUSD > 0 ? creditUSD : debitUSD;
    return `${index}. بتاريخ ${dateText} اشترينا منه بمبلغ ${formatFromUSD(amountUSD)}${row.invoice_number ? ` برقم فاتورة ${row.invoice_number}` : ''}${note ? ` — ${note}` : ''} — ${balanceText}`;
  }

  if (txType === 'payment') {
    const amountUSD = debitUSD > 0 ? debitUSD : creditUSD;
    return `${index}. بتاريخ ${dateText} دفعنا له مبلغ ${formatFromUSD(amountUSD)}${note ? ` — ${note}` : ''} — ${balanceText}`;
  }

  if (txType === 'adjustment') {
    const amountText =
      creditUSD > 0
        ? `زيادة علينا ${formatFromUSD(creditUSD)}`
        : debitUSD > 0
          ? `تخفيض علينا ${formatFromUSD(debitUSD)}`
          : 'تعديل بدون مبلغ';

    return `${index}. بتاريخ ${dateText} تعديل على الحساب (${amountText})${note ? ` — ${note}` : ''} — ${balanceText}`;
  }

  const movementText =
    creditUSD > 0
      ? `زيادة علينا ${formatFromUSD(creditUSD)}`
      : debitUSD > 0
        ? `تخفيض/دفع ${formatFromUSD(debitUSD)}`
        : 'حركة بلا مبلغ';

  return `${index}. بتاريخ ${dateText} ${movementText}${row.invoice_number ? ` — الفاتورة ${row.invoice_number}` : ''}${note ? ` — ${note}` : ''} — ${balanceText}`;
}

export async function buildSupplierStatementReply(
  message: string,
  normalized: string
): Promise<AssistantReply> {
  const { formatFromUSD } = await getCurrencyContext();
  const supplierName = extractSupplierName(message, normalized);

  if (!supplierName) {
    return {
      intent: 'supplier_statement_lookup',
      mode: 'fallback',
      text: 'اذكر اسم المورد بوضوح، مثل: كشف حساب المورد أبو محمد.',
    };
  }

  const matches = await findSupplierMatches(supplierName);
  const resolved = resolveBestSupplierMatch(supplierName, matches);

  if (!resolved.supplier) {
    if (resolved.ambiguous.length > 0) {
      return {
        intent: 'supplier_statement_lookup',
        mode: 'fallback',
        text: [
          `وجدت أكثر من مورد قريب من الاسم: ${supplierName}`,
          'حدد الاسم بشكل أدق:',
          ...resolved.ambiguous.slice(0, 6).map((row) => `• ${row.name}${row.phone ? ` — ${row.phone}` : ''}`),
        ].join('\n'),
      };
    }

    return {
      intent: 'supplier_statement_lookup',
      mode: 'fallback',
      text: `لم أجد موردًا باسم ${supplierName}.`,
    };
  }

  const supplier = resolved.supplier;
  const supplierId = Number(supplier.id);
  const summary = await getSupplierStatementSummary(supplierId);
  const transactions = await getSupplierStatementTransactions(supplierId, 25);

  const balanceUSD = Number(supplier.balance || 0);
  const totalTransactions = Number(summary?.total_transactions || 0);
  const totalDebitUSD = Number(summary?.total_debit || 0);
  const totalCreditUSD = Number(summary?.total_credit || 0);

  const lines: string[] = [
    `كشف حساب المورد: ${supplier.name}`,
    `• الهاتف: ${supplier.phone || 'غير مسجل'}`,
    `• الرصيد الحالي: ${describeSupplierBalance(balanceUSD, formatFromUSD)}`,
    `• إجمالي المشتريات/الدائن: ${formatFromUSD(totalCreditUSD)}`,
    `• إجمالي الدفعات/المدين: ${formatFromUSD(totalDebitUSD)}`,
    `• عدد الحركات المسجلة: ${formatNumber(totalTransactions)}`,
  ];

  if (!transactions.length) {
    lines.push('', 'لا توجد حركات حساب لهذا المورد حتى الآن.');
    return {
      intent: 'supplier_statement_lookup',
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
    intent: 'supplier_statement_lookup',
    mode: 'fallback',
    text: lines.join('\n'),
  };
}