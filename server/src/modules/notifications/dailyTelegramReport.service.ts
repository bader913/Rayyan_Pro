import { dbAll, dbGet } from '../../shared/db/pool.js';
import { sendTelegramMessage } from './telegram.service.js';

type SettingsMap = Record<string, string>;

async function getSettingsMap(keys: readonly string[]): Promise<SettingsMap> {
  if (!keys.length) return {};

  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await dbAll<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
    [...keys]
  );

  return rows.reduce<SettingsMap>((acc, row) => {
    acc[row.key] = row.value ?? '';
    return acc;
  }, {});
}

type ReportCurrencyCode = 'USD' | 'SYP' | 'TRY' | 'SAR' | 'AED';

function normalizeCurrencyCode(value: string | null | undefined): ReportCurrencyCode {
  const code = String(value || 'USD').trim().toUpperCase();

  if (code === 'SYP' || code === 'TRY' || code === 'SAR' || code === 'AED') {
    return code;
  }

  return 'USD';
}

function getUsdRates(settings: SettingsMap) {
  return {
    USD: 1,
    SYP: parseFloat(settings.usd_to_syp || '0') || 1,
    TRY: parseFloat(settings.usd_to_try || '0') || 1,
    SAR: parseFloat(settings.usd_to_sar || '0') || 1,
    AED: parseFloat(settings.usd_to_aed || '0') || 1,
  };
}

function convertFromUsd(value: number, currencyCode: ReportCurrencyCode, rates: ReturnType<typeof getUsdRates>) {
  if (currencyCode === 'USD') return value;
  return value * (rates[currencyCode] || 1);
}

function formatAmount(value: number, currencyCode: ReportCurrencyCode) {
  const fractionDigits = currencyCode === 'SYP' ? 0 : 2;

  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)} ${currencyCode}`;
}

function formatQty(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 3,
    maximumFractionDigits: Number.isInteger(value) ? 0 : 3,
  }).format(value);
}

function todayLabel() {
  return new Intl.DateTimeFormat('en-CA').format(new Date());
}

export async function buildTodayTelegramReport() {
    const settings = await getSettingsMap([
    'shop_name',
    'currency',
    'usd_to_syp',
    'usd_to_try',
    'usd_to_sar',
    'usd_to_aed',
    'telegram_enabled',
    'telegram_bot_token',
    'telegram_chat_id',
  ]);

  const shopName = String(settings.shop_name || 'Rayyan Pro').trim();
  const currencyCode = normalizeCurrencyCode(settings.currency);
  const usdRates = getUsdRates(settings);
  const money = (value: number) => formatAmount(convertFromUsd(value, currencyCode, usdRates), currencyCode);

  const [summary, expensesRow, stockRow, topProducts] = await Promise.all([
    dbGet<{
      invoice_count: string;
      returns_count: string;
      gross_sales: string;
      returned_sales: string;
      sold_items_qty: string;
      returned_items_qty: string;
      sold_cost: string;
      returned_cost: string;
      collected_total: string;
      cash_sales_total: string;
      card_sales_total: string;
      credit_sales_total: string;
      mixed_sales_total: string;
    }>(`
      SELECT
        COALESCE((SELECT COUNT(*) FROM sales WHERE created_at::date = CURRENT_DATE), 0) AS invoice_count,
        COALESCE((SELECT COUNT(*) FROM sales_returns WHERE created_at::date = CURRENT_DATE), 0) AS returns_count,

        COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at::date = CURRENT_DATE), 0) AS gross_sales,
        COALESCE((SELECT SUM(total_amount) FROM sales_returns WHERE created_at::date = CURRENT_DATE), 0) AS returned_sales,

        COALESCE((
          SELECT SUM(si.quantity)
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE s.created_at::date = CURRENT_DATE
        ), 0) AS sold_items_qty,

        COALESCE((
          SELECT SUM(sri.quantity)
          FROM sales_return_items sri
          JOIN sales_returns sr ON sr.id = sri.return_id
          WHERE sr.created_at::date = CURRENT_DATE
        ), 0) AS returned_items_qty,

        COALESCE((
          SELECT SUM(si.quantity * p.purchase_price)
          FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          JOIN products p ON p.id = si.product_id
          WHERE s.created_at::date = CURRENT_DATE
        ), 0) AS sold_cost,

        COALESCE((
          SELECT SUM(sri.quantity * p.purchase_price)
          FROM sales_return_items sri
          JOIN sales_returns sr ON sr.id = sri.return_id
          JOIN products p ON p.id = sri.product_id
          WHERE sr.created_at::date = CURRENT_DATE
        ), 0) AS returned_cost,

        COALESCE((SELECT SUM(paid_amount) FROM sales WHERE created_at::date = CURRENT_DATE), 0) AS collected_total,

        COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at::date = CURRENT_DATE AND payment_method = 'cash'), 0) AS cash_sales_total,
        COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at::date = CURRENT_DATE AND payment_method = 'card'), 0) AS card_sales_total,
        COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at::date = CURRENT_DATE AND payment_method = 'credit'), 0) AS credit_sales_total,
        COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at::date = CURRENT_DATE AND payment_method = 'mixed'), 0) AS mixed_sales_total
    `),

    dbGet<{ total: string }>(`
      SELECT COALESCE(SUM(amount_usd), 0) AS total
      FROM expenses
      WHERE expense_date = CURRENT_DATE
    `),

    dbGet<{ low_stock_count: string; out_of_stock_count: string }>(`
      SELECT
        COALESCE(SUM(CASE WHEN is_active = true AND stock_quantity <= min_stock_level THEN 1 ELSE 0 END), 0) AS low_stock_count,
        COALESCE(SUM(CASE WHEN is_active = true AND stock_quantity <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count
      FROM products
    `),

    dbAll<{ product_name: string; net_qty: string }>(`
      WITH sold AS (
        SELECT
          si.product_id,
          p.name AS product_name,
          COALESCE(SUM(si.quantity), 0) AS sold_qty
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        WHERE s.created_at::date = CURRENT_DATE
        GROUP BY si.product_id, p.name
      ),
      returned AS (
        SELECT
          sri.product_id,
          p.name AS product_name,
          COALESCE(SUM(sri.quantity), 0) AS returned_qty
        FROM sales_return_items sri
        JOIN sales_returns sr ON sr.id = sri.return_id
        JOIN products p ON p.id = sri.product_id
        WHERE sr.created_at::date = CURRENT_DATE
        GROUP BY sri.product_id, p.name
      )
      SELECT
        COALESCE(sold.product_name, returned.product_name) AS product_name,
        (
          COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0)
        )::text AS net_qty
      FROM sold
      FULL OUTER JOIN returned ON returned.product_id = sold.product_id
      WHERE (
        COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0)
      ) > 0
      ORDER BY
        (COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0)) DESC,
        COALESCE(sold.product_name, returned.product_name) ASC
      LIMIT 5
    `),
  ]);

  const invoiceCount = parseInt(summary?.invoice_count ?? '0', 10);
  const returnsCount = parseInt(summary?.returns_count ?? '0', 10);

  const grossSales = parseFloat(summary?.gross_sales ?? '0');
  const returnedSales = parseFloat(summary?.returned_sales ?? '0');
  const netSales = grossSales - returnedSales;

  const soldItemsQty = parseFloat(summary?.sold_items_qty ?? '0');
  const returnedItemsQty = parseFloat(summary?.returned_items_qty ?? '0');
  const netItemsQty = soldItemsQty - returnedItemsQty;

  const soldCost = parseFloat(summary?.sold_cost ?? '0');
  const returnedCost = parseFloat(summary?.returned_cost ?? '0');
  const netCost = soldCost - returnedCost;

  const grossProfit = netSales - netCost;
  const expensesTotal = parseFloat(expensesRow?.total ?? '0');
  const netProfit = grossProfit - expensesTotal;

  const collectedTotal = parseFloat(summary?.collected_total ?? '0');

  const cashSalesTotal = parseFloat(summary?.cash_sales_total ?? '0');
  const cardSalesTotal = parseFloat(summary?.card_sales_total ?? '0');
  const creditSalesTotal = parseFloat(summary?.credit_sales_total ?? '0');
  const mixedSalesTotal = parseFloat(summary?.mixed_sales_total ?? '0');

  const lowStockCount = parseInt(stockRow?.low_stock_count ?? '0', 10);
  const outOfStockCount = parseInt(stockRow?.out_of_stock_count ?? '0', 10);

  const topProductsText =
    topProducts.length > 0
      ? topProducts
          .map((item, index) => `${index + 1}) ${item.product_name} — ${formatQty(parseFloat(item.net_qty || '0'))}`)
          .join('\n')
      : 'لا يوجد مبيعات أصناف اليوم';

    const text =
    `📊 تقرير اليوم — ${todayLabel()}\n` +
    `🏪 المتجر: ${shopName}\n\n` +

    `🧾 عدد الفواتير: ${invoiceCount}\n` +
    `↩️ عدد المرتجعات: ${returnsCount}\n` +
    `📦 صافي القطع المباعة: ${formatQty(netItemsQty)}\n` +
    `💰 صافي المبيعات: ${money(netSales)}\n` +
    `🛒 تكلفة البضاعة: ${money(netCost)}\n` +
    `✅ مجمل الربح: ${money(grossProfit)}\n` +
    `💸 مصاريف اليوم: ${money(expensesTotal)}\n` +
    `🏁 صافي الربح بعد المصاريف: ${money(netProfit)}\n` +
    `💵 المقبوض اليوم: ${money(collectedTotal)}\n\n` +

    `🧾 حسب طريقة البيع:\n` +
    `• نقدي: ${money(cashSalesTotal)}\n` +
    `• شام كاش: ${money(cardSalesTotal)}\n` +
    `• آجل: ${money(creditSalesTotal)}\n` +
    `• مختلط: ${money(mixedSalesTotal)}\n\n` +

    `🔥 الأعلى مبيعًا:\n${topProductsText}\n\n` +
    `⚠️ أصناف منخفضة المخزون: ${lowStockCount}\n` +
    `⛔ أصناف نفدت بالكامل: ${outOfStockCount}`;

  return {
    text,
    summary: {
      invoiceCount,
      returnsCount,
      netItemsQty,
      netSales,
      netCost,
      grossProfit,
      expensesTotal,
      netProfit,
      collectedTotal,
      lowStockCount,
      outOfStockCount,
    },
  };
}

export async function sendTodayTelegramReport() {
  const settings = await getSettingsMap([
    'telegram_enabled',
    'telegram_bot_token',
    'telegram_chat_id',
  ]);

  const enabled = settings.telegram_enabled === 'true';
  const botToken = String(settings.telegram_bot_token || '').trim();
  const chatId = String(settings.telegram_chat_id || '').trim();

  if (!enabled) {
    throw new Error('تنبيهات تلغرام غير مفعلة');
  }

  if (!botToken) {
    throw new Error('رمز بوت تلغرام غير محفوظ');
  }

  if (!chatId) {
    throw new Error('لم يتم ربط حساب تلغرام بعد');
  }

  const report = await buildTodayTelegramReport();
  await sendTelegramMessage(botToken, chatId, report.text);

  return report;
}

function getTodayLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDailyReportTime(value: string | null | undefined) {
  const raw = String(value || '').trim();

  if (!/^\d{2}:\d{2}$/.test(raw)) {
    return { hour: 21, minute: 0 }; // الافتراضي 21:00
  }

  const [hourText, minuteText] = raw.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 21, minute: 0 };
  }

  return { hour, minute };
}

async function setSettingValue(key: string, value: string) {
  await dbGet(
    `INSERT INTO settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_at = NOW()
     RETURNING key`,
    [key, value]
  );
}

let dailyReportCheckRunning = false;

export async function checkAndSendDailyTelegramReportIfDue() {
  if (dailyReportCheckRunning) return { skipped: true, reason: 'running' };

  dailyReportCheckRunning = true;

  try {
    const settings = await getSettingsMap([
      'telegram_enabled',
      'telegram_bot_token',
      'telegram_chat_id',
      'telegram_daily_report_enabled',
      'telegram_daily_report_time',
      'telegram_daily_report_last_sent_date',
    ]);

    const telegramEnabled = settings.telegram_enabled === 'true';
    const dailyEnabled = settings.telegram_daily_report_enabled === 'true';
    const botToken = String(settings.telegram_bot_token || '').trim();
    const chatId = String(settings.telegram_chat_id || '').trim();

    if (!telegramEnabled) return { skipped: true, reason: 'telegram_disabled' };
    if (!dailyEnabled) return { skipped: true, reason: 'daily_disabled' };
    if (!botToken) return { skipped: true, reason: 'missing_bot_token' };
    if (!chatId) return { skipped: true, reason: 'missing_chat_id' };

    const now = new Date();
    const today = getTodayLocalDateKey(now);
    const lastSentDate = String(settings.telegram_daily_report_last_sent_date || '').trim();

    if (lastSentDate === today) {
      return { skipped: true, reason: 'already_sent_today' };
    }

    const { hour, minute } = parseDailyReportTime(settings.telegram_daily_report_time);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = hour * 60 + minute;

    if (nowMinutes < targetMinutes) {
      return { skipped: true, reason: 'not_due_yet' };
    }

    const report = await sendTodayTelegramReport();
    await setSettingValue('telegram_daily_report_last_sent_date', today);

    return {
      skipped: false,
      sent: true,
      date: today,
      summary: report.summary,
    };
  } finally {
    dailyReportCheckRunning = false;
  }
}