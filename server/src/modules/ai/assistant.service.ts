import { dbAll, dbGet } from '../../shared/db/pool.js';
import { getMorningDecisionsPayload } from '../dashboard/morningDecisions.service.js';
import { detectIntentLocally } from './assistant.intent.js';
import { buildGeneralAIText, detectIntentWithGemini } from './assistant.gemini.js';
import {
    buildLastFiveSalesReply,
    buildSaleInvoiceReply,
} from './assistant.sales.js';
import {
    buildCustomerStatementReply,
    buildLastCustomerInvoiceReply,
    buildTopCustomersDebtReply,
    buildTopCustomersMonthReply,
} from './assistant.customers.js';
import { buildSupplierStatementReply } from './assistant.suppliers.js';



import {
    buildAllProductsReply,
    buildLowStockReply,
    buildOutOfStockReply,
    buildProductPriceReply,
    buildProductStockReply,
    buildReorderSuggestionsReply,
    buildSlowMovingReply,
    countLowStockProducts,
    countOutOfStockProducts,
    getLowStockExampleRows,
    getOutOfStockExampleRows,
} from './assistant.inventory.js';
import type {
    AssistantIntent,
    AssistantReply,
    NamedBalanceRow,
    NumericRow,
    ShiftRow,
} from './assistant.types.js';
import {
    formatDateTime,
    formatMoney,
    formatNumber,
    normalizeArabicText,
} from './assistant.utils.js';

async function tryDbGet<T>(queries: string[]): Promise<T | null> {
    for (const sql of queries) {
        try {
            const row = await dbGet<T>(sql);
            if (row) return row;
        } catch {
            // try next query
        }
    }
    return null;
}

async function tryDbAll<T>(queries: string[]): Promise<T[]> {
    for (const sql of queries) {
        try {
            const rows = await dbAll<T>(sql);
            if (rows) return rows;
        } catch {
            // try next query
        }
    }
    return [];
}

async function getCurrencyCode() {
    const row = await tryDbGet<{ value: string }>([
        `SELECT value FROM settings WHERE key = 'currency' LIMIT 1`,
    ]);

    return String(row?.value || 'USD').trim().toUpperCase();
}

async function getSalesTodayMetrics() {
    const row = await tryDbGet<{
        sales_count: string | number;
        sales_total: string | number;
        returns_count: string | number;
        returns_total: string | number;
    }>([
        `
      SELECT
        COALESCE((SELECT COUNT(*) FROM sales WHERE created_at >= CURRENT_DATE), 0) AS sales_count,
        COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at >= CURRENT_DATE), 0) AS sales_total,
        COALESCE((SELECT COUNT(*) FROM sales_returns WHERE created_at >= CURRENT_DATE), 0) AS returns_count,
        COALESCE((SELECT SUM(total_amount) FROM sales_returns WHERE created_at >= CURRENT_DATE), 0) AS returns_total
    `,
    ]);

    return {
        salesCount: Number(row?.sales_count || 0),
        salesTotal: Number(row?.sales_total || 0),
        returnsCount: Number(row?.returns_count || 0),
        returnsTotal: Number(row?.returns_total || 0),
    };
}

async function getSalesWeekMetrics() {
    const row = await tryDbGet<{
        sales_count: string | number;
        sales_total: string | number;
        returns_count: string | number;
        returns_total: string | number;
    }>([
        `
      SELECT
        COALESCE((SELECT COUNT(*) FROM sales WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) AS sales_count,
        COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) AS sales_total,
        COALESCE((SELECT COUNT(*) FROM sales_returns WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) AS returns_count,
        COALESCE((SELECT SUM(total_amount) FROM sales_returns WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'), 0) AS returns_total
    `,
    ]);

    return {
        salesCount: Number(row?.sales_count || 0),
        salesTotal: Number(row?.sales_total || 0),
        returnsCount: Number(row?.returns_count || 0),
        returnsTotal: Number(row?.returns_total || 0),
    };
}

async function getSalesMonthMetrics() {
    const row = await tryDbGet<{
        sales_count: string | number;
        sales_total: string | number;
        returns_count: string | number;
        returns_total: string | number;
    }>([
        `
      SELECT
        COALESCE((
          SELECT COUNT(*)
          FROM sales
          WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        ), 0) AS sales_count,
        COALESCE((
          SELECT SUM(total_amount)
          FROM sales
          WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        ), 0) AS sales_total,
        COALESCE((
          SELECT COUNT(*)
          FROM sales_returns
          WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        ), 0) AS returns_count,
        COALESCE((
          SELECT SUM(total_amount)
          FROM sales_returns
          WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
        ), 0) AS returns_total
    `,
    ]);

    return {
        salesCount: Number(row?.sales_count || 0),
        salesTotal: Number(row?.sales_total || 0),
        returnsCount: Number(row?.returns_count || 0),
        returnsTotal: Number(row?.returns_total || 0),
    };
}

async function getReturnedCostToday(): Promise<number> {
    const row = await tryDbGet<NumericRow>([
        `
      SELECT COALESCE(SUM(sri.quantity * COALESCE(p.purchase_price, 0)), 0) AS value
      FROM sales_returns sr
      JOIN sales_return_items sri ON sri.sales_return_id = sr.id
      LEFT JOIN products p ON p.id = sri.product_id
      WHERE sr.created_at >= CURRENT_DATE
    `,
        `
      SELECT COALESCE(SUM(sri.quantity * COALESCE(p.purchase_price, 0)), 0) AS value
      FROM sales_returns sr
      JOIN sales_return_items sri ON sri.return_id = sr.id
      LEFT JOIN products p ON p.id = sri.product_id
      WHERE sr.created_at >= CURRENT_DATE
    `,
    ]);

    return Number(row?.value || 0);
}

async function getSalesCostToday(): Promise<number> {
    const row = await tryDbGet<NumericRow>([
        `
      SELECT COALESCE(SUM(si.quantity * COALESCE(p.purchase_price, 0)), 0) AS value
      FROM sales s
      JOIN sale_items si ON si.sale_id = s.id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= CURRENT_DATE
    `,
    ]);

    return Number(row?.value || 0);
}

async function getExpensesTodayMetrics() {
    const row = await tryDbGet<{ count: string | number; total: string | number }>([
        `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE created_at >= CURRENT_DATE
    `,
        `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE expense_date >= CURRENT_DATE
    `,
        `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(amount_usd), 0) AS total
      FROM expenses
      WHERE created_at >= CURRENT_DATE
    `,
    ]);

    return {
        count: Number(row?.count || 0),
        total: Number(row?.total || 0),
    };
}

async function getPurchasesTodayMetrics() {
    const row = await tryDbGet<{
        count: string | number;
        total: string | number;
        paid: string | number;
        due: string | number;
    }>([
        `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(total_amount), 0) AS total,
        COALESCE(SUM(paid_amount), 0) AS paid,
        COALESCE(SUM(due_amount), 0) AS due
      FROM purchases
      WHERE created_at >= CURRENT_DATE
    `,
        `
      SELECT
        COUNT(*) AS count,
        COALESCE(SUM(total_amount), 0) AS total,
        COALESCE(SUM(paid_amount), 0) AS paid,
        COALESCE(SUM(total_amount - paid_amount), 0) AS due
      FROM purchases
      WHERE created_at >= CURRENT_DATE
    `,
    ]);

    return {
        count: Number(row?.count || 0),
        total: Number(row?.total || 0),
        paid: Number(row?.paid || 0),
        due: Number(row?.due || 0),
    };
}

async function getOpenShiftData(): Promise<ShiftRow | null> {
    return tryDbGet<ShiftRow>([
        `
      SELECT
        s.id,
        s.status,
        s.opened_at,
        s.opening_balance,
        u.full_name AS user_name,
        t.name AS terminal_name
      FROM shifts s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN pos_terminals t ON t.id = s.terminal_id
      WHERE s.status = 'open'
      ORDER BY s.id DESC
      LIMIT 1
    `,
        `
      SELECT
        s.id,
        s.status,
        s.opened_at,
        s.opening_balance,
        NULL::text AS user_name,
        NULL::text AS terminal_name
      FROM shifts s
      WHERE s.status = 'open'
      ORDER BY s.id DESC
      LIMIT 1
    `,
    ]);
}

async function buildSalesTodayReply(): Promise<AssistantReply> {
    const currency = await getCurrencyCode();
    const { salesCount, salesTotal, returnsCount, returnsTotal } = await getSalesTodayMetrics();
    const netSales = salesTotal - returnsTotal;

    return {
        intent: 'sales_today',
        mode: 'fallback',
        text: [
            'مبيعات اليوم حتى الآن:',
            `• عدد فواتير البيع: ${formatNumber(salesCount)}`,
            `• إجمالي المبيعات: ${formatMoney(salesTotal, currency)}`,
            `• عدد المرتجعات: ${formatNumber(returnsCount)}`,
            `• إجمالي المرتجعات: ${formatMoney(returnsTotal, currency)}`,
            `• صافي المبيعات: ${formatMoney(netSales, currency)}`,
        ].join('\n'),
    };
}

async function buildSalesWeekReply(): Promise<AssistantReply> {
    const currency = await getCurrencyCode();
    const { salesCount, salesTotal, returnsCount, returnsTotal } = await getSalesWeekMetrics();
    const netSales = salesTotal - returnsTotal;

    return {
        intent: 'sales_week',
        mode: 'fallback',
        text: [
            'مبيعات آخر 7 أيام:',
            `• عدد فواتير البيع: ${formatNumber(salesCount)}`,
            `• إجمالي المبيعات: ${formatMoney(salesTotal, currency)}`,
            `• عدد المرتجعات: ${formatNumber(returnsCount)}`,
            `• إجمالي المرتجعات: ${formatMoney(returnsTotal, currency)}`,
            `• صافي المبيعات: ${formatMoney(netSales, currency)}`,
        ].join('\n'),
    };
}

async function buildSalesMonthReply(): Promise<AssistantReply> {
    const currency = await getCurrencyCode();
    const { salesCount, salesTotal, returnsCount, returnsTotal } = await getSalesMonthMetrics();
    const netSales = salesTotal - returnsTotal;

    return {
        intent: 'sales_month',
        mode: 'fallback',
        text: [
            'مبيعات الشهر الحالي:',
            `• عدد فواتير البيع: ${formatNumber(salesCount)}`,
            `• إجمالي المبيعات: ${formatMoney(salesTotal, currency)}`,
            `• عدد المرتجعات: ${formatNumber(returnsCount)}`,
            `• إجمالي المرتجعات: ${formatMoney(returnsTotal, currency)}`,
            `• صافي المبيعات: ${formatMoney(netSales, currency)}`,
        ].join('\n'),
    };
}

async function buildRecentSalesReply(): Promise<AssistantReply> {
    const currency = await getCurrencyCode();

    const rows = await tryDbAll<{
        invoice_number: string;
        total_amount: string | number;
        created_at: string;
        customer_name: string | null;
    }>([
        `
      SELECT
        s.invoice_number,
        GREATEST(COALESCE(s.total_amount, 0) - COALESCE(sr.returned_total, 0), 0) AS total_amount,
        s.created_at,
        c.name AS customer_name
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id
      LEFT JOIN (
        SELECT sale_id, COALESCE(SUM(total_amount), 0) AS returned_total
        FROM sales_returns
        GROUP BY sale_id
      ) sr ON sr.sale_id = s.id
      ORDER BY s.created_at DESC
      LIMIT 8
    `,
    ]);

    if (!rows.length) {
        return {
            intent: 'recent_sales',
            mode: 'fallback',
            text: 'لا توجد مبيعات حديثة حاليًا.',
        };
    }

    const lines = rows.map((row, index) => {
        return `${index + 1}. ${row.invoice_number} — ${row.customer_name || 'زبون نقدي'} — ${formatMoney(Number(row.total_amount || 0), currency)} — ${formatDateTime(row.created_at)}`;
    });

    return {
        intent: 'recent_sales',
        mode: 'fallback',
        text: ['آخر المبيعات:', ...lines].join('\n'),
    };
}

async function buildMorningDecisionsReply(): Promise<AssistantReply> {
    const payload = await getMorningDecisionsPayload();
    const { summary, decisions } = payload;
    const currency = await getCurrencyCode();

    if (summary.badge_count === 0) {
        return {
            intent: 'morning_decisions',
            mode: 'fallback',
            text: [
                'قرارات اليوم:',
                '• لا توجد مشكلات أو أولويات حرجة الآن.',
                '• الوضع الحالي هادئ نسبيًا.',
                '• يمكنك متابعة المبيعات والطلبات بشكل طبيعي.',
            ].join('\n'),
        };
    }

    const lines: string[] = ['قرارات اليوم المقترحة:'];

    if (decisions.attention.length > 0) {
        const first = decisions.attention[0];
        const metricText =
            first.metric_kind === 'money'
                ? `${first.metric_prefix ?? ''}${formatMoney(first.metric_value, currency)}`
                : first.metric_kind === 'hours'
                    ? `${formatNumber(first.metric_value)} ساعة`
                    : `${formatNumber(first.metric_value)} وحدة`;

        lines.push(
            `• ابدأ أولًا بمراجعة الأمور الحرجة (${formatNumber(summary.attention_count)}): ${first.title} — ${metricText}`
        );
    }

    if (decisions.pendingOrders.length > 0) {
        const first = decisions.pendingOrders[0];
        lines.push(
            `• عندك ${formatNumber(summary.pending_orders_count)} طلب يحتاج تصرفًا. أقدم طلب الآن هو ${first.order_number} باسم ${first.customer_name}.`
        );
    }

    if (decisions.urgentRestock.length > 0) {
        const names = decisions.urgentRestock
            .slice(0, 3)
            .map((item) => item.name)
            .join('، ');

        lines.push(
            `• حضّر شراء أو تزويد للأصناف القريبة من النفاد (${formatNumber(summary.urgent_restock_count)}): ${names}.`
        );
    }

    if (decisions.slowMoving.length > 0) {
        const names = decisions.slowMoving
            .slice(0, 2)
            .map((item) =>
                item.days_since_last_sale == null
                    ? `${item.name} (لم يُبع سابقًا)`
                    : `${item.name} (منذ ${formatNumber(item.days_since_last_sale)} يوم)`
            )
            .join('، ');

        lines.push(
            `• راجع الأصناف الراكدة (${formatNumber(summary.slow_moving_count)}): ${names}.`
        );
    }

    if (decisions.topSelling.length > 0) {
        const names = decisions.topSelling
            .slice(0, 3)
            .map((item) => `${item.product_name} (${formatNumber(item.net_qty)})`)
            .join('، ');

        lines.push(`• ركّز على الأصناف الأقوى بيعًا آخر 7 أيام: ${names}.`);
    }

    lines.push('• إذا أردت التفاصيل الكاملة افتح صفحة: قرارات اليوم.');

    return {
        intent: 'morning_decisions',
        mode: 'fallback',
        text: lines.join('\n'),
    };
}

async function buildProfitTodayReply(): Promise<AssistantReply> {
    const currency = await getCurrencyCode();
    const { salesTotal, returnsTotal } = await getSalesTodayMetrics();
    const salesCost = await getSalesCostToday();
    const returnedCost = await getReturnedCostToday();

    const netSales = salesTotal - returnsTotal;
    const netCost = salesCost - returnedCost;
    const grossProfit = netSales - netCost;

    return {
        intent: 'profit_today',
        mode: 'fallback',
        text: [
            'ربح اليوم التشغيلي حتى الآن:',
            `• صافي المبيعات: ${formatMoney(netSales, currency)}`,
            `• تكلفة البضاعة الصافية: ${formatMoney(netCost, currency)}`,
            `• الربح الإجمالي: ${formatMoney(grossProfit, currency)}`,
            '• ملاحظة: هذا الرقم قبل المصاريف العامة.',
        ].join('\n'),
    };
}

async function buildReturnsTodayReply(): Promise<AssistantReply> {
    const currency = await getCurrencyCode();
    const { returnsCount, returnsTotal } = await getSalesTodayMetrics();

    return {
        intent: 'returns_today',
        mode: 'fallback',
        text: [
            'مرتجعات اليوم حتى الآن:',
            `• عدد المرتجعات: ${formatNumber(returnsCount)}`,
            `• إجمالي قيمة المرتجعات: ${formatMoney(returnsTotal, currency)}`,
        ].join('\n'),
    };
}

async function buildExpensesTodayReply(): Promise<AssistantReply> {
    const currency = await getCurrencyCode();
    const { count, total } = await getExpensesTodayMetrics();

    return {
        intent: 'expenses_today',
        mode: 'fallback',
        text: [
            'مصاريف اليوم حتى الآن:',
            `• عدد حركات المصروف: ${formatNumber(count)}`,
            `• إجمالي المصاريف: ${formatMoney(total, currency)}`,
        ].join('\n'),
    };
}

async function buildPurchasesTodayReply(): Promise<AssistantReply> {
    const currency = await getCurrencyCode();
    const { count, total, paid, due } = await getPurchasesTodayMetrics();

    return {
        intent: 'purchases_today',
        mode: 'fallback',
        text: [
            'مشتريات اليوم حتى الآن:',
            `• عدد فواتير الشراء: ${formatNumber(count)}`,
            `• إجمالي المشتريات: ${formatMoney(total, currency)}`,
            `• المدفوع: ${formatMoney(paid, currency)}`,
            `• المتبقي: ${formatMoney(due, currency)}`,
        ].join('\n'),
    };
}

async function buildTopProductsTodayReply(): Promise<AssistantReply> {
    const rows = await tryDbAll<{ name: string; qty: string | number; unit: string | null }>([
        `
      SELECT
        COALESCE(p.name, 'منتج') AS name,
        SUM(si.quantity) AS qty,
        MAX(p.unit) AS unit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= CURRENT_DATE
      GROUP BY COALESCE(p.name, 'منتج')
      ORDER BY SUM(si.quantity) DESC, COALESCE(p.name, 'منتج') ASC
      LIMIT 10
    `,
    ]);

    if (!rows.length) {
        return {
            intent: 'top_products_today',
            mode: 'fallback',
            text: 'لا توجد مبيعات كافية اليوم لعرض الأصناف الأكثر مبيعًا.',
        };
    }

    const lines = rows.map((item, index) => {
        const unit = item.unit ? ` ${item.unit}` : '';
        return `${index + 1}. ${item.name} — ${formatNumber(Number(item.qty || 0))}${unit}`;
    });

    return {
        intent: 'top_products_today',
        mode: 'fallback',
        text: ['الأصناف الأكثر مبيعًا اليوم:', ...lines].join('\n'),
    };
}
async function buildDashboardSummaryReply(): Promise<AssistantReply> {
    const currency = await getCurrencyCode();
    const { salesCount, salesTotal, returnsCount, returnsTotal } = await getSalesTodayMetrics();
    const salesCost = await getSalesCostToday();
    const returnedCost = await getReturnedCostToday();
    const { count: expensesCount, total: expensesTotal } = await getExpensesTodayMetrics();
    const { count: purchasesCount, total: purchasesTotal } = await getPurchasesTodayMetrics();
    const lowCount = await countLowStockProducts();
    const outCount = await countOutOfStockProducts();
    const shift = await getOpenShiftData();

    const netSales = salesTotal - returnsTotal;
    const grossProfit = netSales - (salesCost - returnedCost);
    const netAfterExpenses = grossProfit - expensesTotal;

    return {
        intent: 'dashboard_summary',
        mode: 'fallback',
        text: [
            'ملخص سريع لليوم:',
            `• عدد فواتير البيع: ${formatNumber(salesCount)}`,
            `• صافي المبيعات: ${formatMoney(netSales, currency)}`,
            `• عدد المرتجعات: ${formatNumber(returnsCount)} بقيمة ${formatMoney(returnsTotal, currency)}`,
            `• الربح الإجمالي التقديري: ${formatMoney(grossProfit, currency)}`,
            `• مصاريف اليوم: ${formatMoney(expensesTotal, currency)} عبر ${formatNumber(expensesCount)} حركة`,
            `• صافي تقريبي بعد المصاريف: ${formatMoney(netAfterExpenses, currency)}`,
            `• مشتريات اليوم: ${formatMoney(purchasesTotal, currency)} عبر ${formatNumber(purchasesCount)} فاتورة`,
            `• منخفض المخزون: ${formatNumber(lowCount)} منتج`,
            `• نافد المخزون: ${formatNumber(outCount)} منتج`,
            `• الوردية الحالية: ${shift ? `مفتوحة (#${shift.id})` : 'لا توجد وردية مفتوحة'}`,
        ].join('\n'),
    };
}

function buildUnsupportedReply(mode: 'local' | 'gemini' | 'fallback'): AssistantReply {
    return {
        intent: 'unsupported',
        mode,
        text: [
            'أستطيع الآن مساعدتك في أسئلة كثيرة داخل Rayyan Pro، مثل:',
            '• كم بعنا اليوم',
            '• كم بعنا هذا الأسبوع',
            '• كم بعنا هذا الشهر',
            '• كم ربحنا اليوم',
            '• ملخص اليوم',
            '• اعرض المرتجعات اليوم',
            '• اعرض المصاريف اليوم',
            '• اعرض المشتريات اليوم',
            '• ما الأصناف الأكثر مبيعًا اليوم',
            '• اعرض آخر المبيعات',
            '• اعرض المنتجات منخفضة المخزون',
            '• اعرض المنتجات النافدة',
            '• اعرض الأصناف الراكدة',
            '• اقترح شراء',
            '• ما ذمم العملاء',
            '• ما ذمم الموردين',
            '• هل توجد وردية مفتوحة',
            '• كم سعر السكر',
            '• ما مخزون المتة',
            '• اعرض كل المنتجات',
            '• جبلي الفاتورة رقم INV-2026-000123',
            '• آخر فاتورة للعميل خالد',
            '• آخر 5 فواتير',
            '• أكثر العملاء شراء هذا الشهر',
            '• أكثر العملاء عليهم دين',
            '• ماذا أفعل اليوم',
            '• اعرض قرارات اليوم',
            '• كشف حساب خالد',
            '• كشف حساب المورد أبو محمد',
            '',
            'وإذا كان لديك GEMINI_API_KEY فالمساعد سيحاول أيضًا الرد على الأسئلة العامة والتحليلية بشكل أذكى.',
        ].join('\n'),
    };
}

async function buildContextSnapshot(): Promise<string> {
    const currency = await getCurrencyCode();
    const { salesCount, salesTotal, returnsCount, returnsTotal } = await getSalesTodayMetrics();
    const salesCost = await getSalesCostToday();
    const returnedCost = await getReturnedCostToday();
    const { count: expensesCount, total: expensesTotal } = await getExpensesTodayMetrics();
    const { count: purchasesCount, total: purchasesTotal, due: purchasesDue } = await getPurchasesTodayMetrics();
    const lowCount = await countLowStockProducts();
    const outCount = await countOutOfStockProducts();
    const shift = await getOpenShiftData();

    const topProducts = await tryDbAll<{ name: string; qty: string | number }>([
        `
      SELECT
        COALESCE(p.name, 'منتج') AS name,
        SUM(si.quantity) AS qty
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= CURRENT_DATE
      GROUP BY COALESCE(p.name, 'منتج')
      ORDER BY SUM(si.quantity) DESC, COALESCE(p.name, 'منتج') ASC
      LIMIT 5
    `,
    ]);

    const lowRows = await getLowStockExampleRows(5);
    const outRows = await getOutOfStockExampleRows(5);

    const customerPositive = await tryDbAll<NamedBalanceRow>([
        `
      SELECT name, balance
      FROM customers
      WHERE COALESCE(balance, 0) > 0
      ORDER BY COALESCE(balance, 0) DESC, name ASC
      LIMIT 5
    `,
    ]);

    const supplierPositive = await tryDbAll<NamedBalanceRow>([
        `
      SELECT name, balance
      FROM suppliers
      WHERE COALESCE(balance, 0) > 0
      ORDER BY COALESCE(balance, 0) DESC, name ASC
      LIMIT 5
    `,
    ]);

    const netSales = salesTotal - returnsTotal;
    const grossProfit = netSales - (salesCost - returnedCost);
    const netAfterExpenses = grossProfit - expensesTotal;

    const sections = [
        `العملة الأساسية: ${currency}`,
        `مبيعات اليوم: ${formatMoney(salesTotal, currency)} عبر ${formatNumber(salesCount)} فاتورة`,
        `مرتجعات اليوم: ${formatMoney(returnsTotal, currency)} عبر ${formatNumber(returnsCount)} مرتجع`,
        `صافي المبيعات اليوم: ${formatMoney(netSales, currency)}`,
        `الربح الإجمالي التقديري اليوم: ${formatMoney(grossProfit, currency)}`,
        `صافي تقريبي بعد المصاريف: ${formatMoney(netAfterExpenses, currency)}`,
        `مصاريف اليوم: ${formatMoney(expensesTotal, currency)} عبر ${formatNumber(expensesCount)} حركة`,
        `مشتريات اليوم: ${formatMoney(purchasesTotal, currency)} عبر ${formatNumber(purchasesCount)} فاتورة، المتبقي ${formatMoney(purchasesDue, currency)}`,
        `منخفض المخزون: ${formatNumber(lowCount)} منتج`,
        `نافد المخزون: ${formatNumber(outCount)} منتج`,
        `الوردية الحالية: ${shift ? `مفتوحة رقم ${shift.id} منذ ${formatDateTime(shift.opened_at)}` : 'لا توجد وردية مفتوحة'}`,
    ];

    if (topProducts.length) {
        sections.push(
            `الأصناف الأعلى مبيعًا اليوم: ${topProducts
                .map((row) => `${row.name} (${formatNumber(Number(row.qty || 0))})`)
                .join('، ')}`
        );
    }

    if (lowRows.length) {
        sections.push(
            `أمثلة من منخفض المخزون: ${lowRows
                .map((row) => `${row.name} (${formatNumber(Number(row.stock_quantity || 0))}${row.unit ? ` ${row.unit}` : ''})`)
                .join('، ')}`
        );
    }

    if (outRows.length) {
        sections.push(`أمثلة من النافد: ${outRows.map((row) => row.name).join('، ')}`);
    }

    if (customerPositive.length) {
        sections.push(
            `أعلى العملاء الذين عليهم: ${customerPositive
                .map((row) => `${row.name} (${formatMoney(Number(row.balance || 0), currency)})`)
                .join('، ')}`
        );
    }

    if (supplierPositive.length) {
        sections.push(
            `أعلى الموردين المستحقين: ${supplierPositive
                .map((row) => `${row.name} (${formatMoney(Number(row.balance || 0), currency)})`)
                .join('، ')}`
        );
    }

    return sections.join('\n');
}

async function buildGeneralAIReply(message: string): Promise<AssistantReply | null> {
    const context = await buildContextSnapshot();
    const text = await buildGeneralAIText({ message, context });

    if (!text) return null;

    return {
        intent: 'general_ai',
        mode: 'gemini',
        text,
    };
}

async function buildReplyByIntent(intent: AssistantIntent, message: string, normalized: string): Promise<AssistantReply> {
    switch (intent) {
        case 'sales_today':
            return buildSalesTodayReply();
        case 'sales_week':
            return buildSalesWeekReply();
        case 'sales_month':
            return buildSalesMonthReply();
        case 'profit_today':
            return buildProfitTodayReply();
        case 'low_stock':
            return buildLowStockReply();
        case 'all_products':
            return buildAllProductsReply();
        case 'recent_sales':
            return buildRecentSalesReply();
                case 'last_five_sales_lookup':
            return buildLastFiveSalesReply(message, normalized);
        case 'last_customer_invoice_lookup':
            return buildLastCustomerInvoiceReply(message, normalized);
        case 'slow_moving':
            return buildSlowMovingReply();
        case 'reorder_suggestions':
            return buildReorderSuggestionsReply();
        case 'morning_decisions':
            return buildMorningDecisionsReply();
        case 'out_of_stock':
            return buildOutOfStockReply();
        case 'dashboard_summary':
            return buildDashboardSummaryReply();
        case 'top_products_today':
            return buildTopProductsTodayReply();
        case 'returns_today':
            return buildReturnsTodayReply();
        case 'expenses_today':
            return buildExpensesTodayReply();
        case 'purchases_today':
            return buildPurchasesTodayReply();
        case 'top_customers_month':
            return buildTopCustomersMonthReply();
        case 'top_customers_debt':
            return buildTopCustomersDebtReply();
        case 'customer_balances':
            return buildCustomerBalancesReply();
        case 'supplier_balances':
            return buildSupplierBalancesReply();
        case 'open_shift':
            return buildOpenShiftReply();
        case 'product_price':
            return buildProductPriceReply(message, normalized);
        case 'product_stock':
            return buildProductStockReply(message, normalized);
        case 'sale_invoice_lookup':
            return buildSaleInvoiceReply(message, normalized);
        case 'customer_statement_lookup':
            return buildCustomerStatementReply(message, normalized);
        case 'supplier_statement_lookup':
            return buildSupplierStatementReply(message, normalized);
        case 'general_ai': {
            const general = await buildGeneralAIReply(message);
            return general || buildUnsupportedReply('fallback');
        }
        default:
            return buildUnsupportedReply('fallback');
    }
}

async function buildCustomerBalancesReply(): Promise<AssistantReply> {
    const positiveRows = await tryDbAll<NamedBalanceRow>([
        `
      SELECT name, balance
      FROM customers
      WHERE COALESCE(balance, 0) > 0
      ORDER BY COALESCE(balance, 0) DESC, name ASC
      LIMIT 10
    `,
    ]);

    const negativeRows = await tryDbAll<NamedBalanceRow>([
        `
      SELECT name, balance
      FROM customers
      WHERE COALESCE(balance, 0) < 0
      ORDER BY COALESCE(balance, 0) ASC, name ASC
      LIMIT 10
    `,
    ]);

    const positiveTotalRow = await tryDbGet<NumericRow>([
        `SELECT COALESCE(SUM(balance), 0) AS value FROM customers WHERE COALESCE(balance, 0) > 0`,
    ]);

    const negativeTotalRow = await tryDbGet<NumericRow>([
        `SELECT COALESCE(ABS(SUM(balance)), 0) AS value FROM customers WHERE COALESCE(balance, 0) < 0`,
    ]);

    const currency = await getCurrencyCode();
    const lines: string[] = [
        'ذمم العملاء الحالية:',
        `• العملاء الذين عليهم: ${formatMoney(Number(positiveTotalRow?.value || 0), currency)}`,
        `• العملاء الذين لهم رصيد دائن: ${formatMoney(Number(negativeTotalRow?.value || 0), currency)}`,
    ];

    if (positiveRows.length) {
        lines.push('', 'أعلى العملاء الذين عليهم:');
        positiveRows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.name} — ${formatMoney(Number(row.balance || 0), currency)}`);
        });
    }

    if (negativeRows.length) {
        lines.push('', 'أعلى العملاء ذوي الرصيد الدائن:');
        negativeRows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.name} — ${formatMoney(Math.abs(Number(row.balance || 0)), currency)}`);
        });
    }

    if (!positiveRows.length && !negativeRows.length) {
        lines.push('', 'لا توجد أرصدة عملاء تستحق الذكر حاليًا.');
    }

    return {
        intent: 'customer_balances',
        mode: 'fallback',
        text: lines.join('\n'),
    };
}

async function buildSupplierBalancesReply(): Promise<AssistantReply> {
    const positiveRows = await tryDbAll<NamedBalanceRow>([
        `
      SELECT name, balance
      FROM suppliers
      WHERE COALESCE(balance, 0) > 0
      ORDER BY COALESCE(balance, 0) DESC, name ASC
      LIMIT 10
    `,
    ]);

    const negativeRows = await tryDbAll<NamedBalanceRow>([
        `
      SELECT name, balance
      FROM suppliers
      WHERE COALESCE(balance, 0) < 0
      ORDER BY COALESCE(balance, 0) ASC, name ASC
      LIMIT 10
    `,
    ]);

    const positiveTotalRow = await tryDbGet<NumericRow>([
        `SELECT COALESCE(SUM(balance), 0) AS value FROM suppliers WHERE COALESCE(balance, 0) > 0`,
    ]);

    const negativeTotalRow = await tryDbGet<NumericRow>([
        `SELECT COALESCE(ABS(SUM(balance)), 0) AS value FROM suppliers WHERE COALESCE(balance, 0) < 0`,
    ]);

    const currency = await getCurrencyCode();
    const lines: string[] = [
        'ذمم الموردين الحالية:',
        `• المستحقات للموردين: ${formatMoney(Number(positiveTotalRow?.value || 0), currency)}`,
        `• الرصيد لصالحك عند الموردين: ${formatMoney(Number(negativeTotalRow?.value || 0), currency)}`,
    ];

    if (positiveRows.length) {
        lines.push('', 'أعلى الموردين المستحقين:');
        positiveRows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.name} — ${formatMoney(Number(row.balance || 0), currency)}`);
        });
    }

    if (negativeRows.length) {
        lines.push('', 'أعلى الموردين الذين لديك رصيد عندهم:');
        negativeRows.forEach((row, index) => {
            lines.push(`${index + 1}. ${row.name} — ${formatMoney(Math.abs(Number(row.balance || 0)), currency)}`);
        });
    }

    if (!positiveRows.length && !negativeRows.length) {
        lines.push('', 'لا توجد أرصدة موردين تستحق الذكر حاليًا.');
    }

    return {
        intent: 'supplier_balances',
        mode: 'fallback',
        text: lines.join('\n'),
    };
}

async function buildOpenShiftReply(): Promise<AssistantReply> {
    const shift = await getOpenShiftData();
    const currency = await getCurrencyCode();

    if (!shift) {
        return {
            intent: 'open_shift',
            mode: 'fallback',
            text: 'لا توجد وردية مفتوحة حاليًا.',
        };
    }

    const lines = [
        'الوردية المفتوحة الحالية:',
        `• رقم الوردية: ${shift.id}`,
        `• وقت الفتح: ${formatDateTime(shift.opened_at)}`,
        `• الرصيد الافتتاحي: ${formatMoney(Number(shift.opening_balance || 0), currency)}`,
    ];

    if (shift.user_name) {
        lines.push(`• المستخدم: ${shift.user_name}`);
    }

    if (shift.terminal_name) {
        lines.push(`• نقطة البيع: ${shift.terminal_name}`);
    }

    return {
        intent: 'open_shift',
        mode: 'fallback',
        text: lines.join('\n'),
    };
}

export async function buildAssistantReply(message: string): Promise<AssistantReply> {
    const normalized = normalizeArabicText(message);

    const localIntent = detectIntentLocally(normalized);
    if (localIntent && localIntent !== 'general_ai' && localIntent !== 'unsupported') {
        const reply = await buildReplyByIntent(localIntent, message, normalized);
        return { ...reply, mode: 'local' };
    }

    const geminiIntent = await detectIntentWithGemini(message);
    if (geminiIntent && geminiIntent !== 'unsupported') {
        const reply = await buildReplyByIntent(geminiIntent, message, normalized);
        return { ...reply, mode: 'gemini' };
    }

    const general = await buildGeneralAIReply(message);
    if (general) {
        return general;
    }

    return buildUnsupportedReply(localIntent ? 'local' : geminiIntent ? 'gemini' : 'fallback');
}