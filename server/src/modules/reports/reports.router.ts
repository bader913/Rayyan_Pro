import type { FastifyInstance } from 'fastify';
import { dbAll, dbGet } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';

// حالة الدفع المستنتجة من paid_amount vs total_amount
const PAYMENT_STATUS_EXPR = `
  CASE
    WHEN paid_amount >= total_amount THEN 'paid'
    WHEN paid_amount > 0             THEN 'partial'
    ELSE 'unpaid'
  END`;

export async function reportsRoutes(fastify: FastifyInstance) {

  // ──────────────────────────────────────────────────────
  // تقرير المبيعات
  // ──────────────────────────────────────────────────────
  fastify.get(
    '/api/reports/sales',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const from  = q.from  || new Date(new Date().setDate(1)).toISOString().split('T')[0];
      const to    = q.to    || new Date().toISOString().split('T')[0];
      const limit = Math.min(parseInt(q.limit || '200'), 500);
      const page  = Math.max(1, parseInt(q.page  || '1'));
      const offset = (page - 1) * limit;

      const conditions = [`s.created_at::date BETWEEN $1 AND $2`];
      const params: unknown[] = [from, to];
      let idx = 3;

      if (q.customer_id) {
        conditions.push(`s.customer_id = $${idx++}`);
        params.push(q.customer_id);
      }

      const where = conditions.join(' AND ');

      const [countRow, rows, summary] = await Promise.all([
        dbGet<{ total: string }>(`
          SELECT COUNT(*) AS total
          FROM sales s
          WHERE ${where}
        `, params),

        dbAll(`
          SELECT
            s.id,
            s.invoice_number,
            GREATEST(s.total_amount - COALESCE(sr.returned_total, 0), 0)::text AS total_amount,
            COALESCE(sr.returned_total, 0)::text AS returned_amount,
            s.discount AS discount_amount,
            s.paid_amount,
            s.payment_method,
            s.created_at,
            s.customer_id,
            ${PAYMENT_STATUS_EXPR} AS payment_status,
            c.name AS customer_name,
            u.full_name AS cashier_name
          FROM sales s
          LEFT JOIN customers c ON c.id = s.customer_id
          LEFT JOIN users u ON u.id = s.user_id
          LEFT JOIN (
            SELECT sale_id, COALESCE(SUM(total_amount), 0) AS returned_total
            FROM sales_returns
            GROUP BY sale_id
          ) sr ON sr.sale_id = s.id
          WHERE ${where}
          ORDER BY s.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `, params),

        dbGet<{
          total_revenue: string;
          total_paid: string;
          total_discount: string;
          invoice_count: string;
          total_returns: string;
        }>(`
          SELECT
            COALESCE(SUM(GREATEST(s.total_amount - COALESCE(sr.returned_total, 0), 0)), 0) AS total_revenue,
            COALESCE(SUM(s.paid_amount), 0) AS total_paid,
            COALESCE(SUM(s.discount), 0) AS total_discount,
            COUNT(*) AS invoice_count,
            COALESCE(SUM(COALESCE(sr.returned_total, 0)), 0) AS total_returns
          FROM sales s
          LEFT JOIN (
            SELECT sale_id, COALESCE(SUM(total_amount), 0) AS returned_total
            FROM sales_returns
            GROUP BY sale_id
          ) sr ON sr.sale_id = s.id
          WHERE ${where}
        `, params),
      ]);

      return {
        success: true,
        data: rows,
        summary: {
          totalRevenue:  parseFloat(summary?.total_revenue ?? '0'),
          totalPaid:     parseFloat(summary?.total_paid ?? '0'),
          totalDiscount: parseFloat(summary?.total_discount ?? '0'),
          totalReturns:  parseFloat(summary?.total_returns ?? '0'),
          invoiceCount:  parseInt(summary?.invoice_count ?? '0', 10),
        },
        total: parseInt(countRow?.total ?? '0', 10),
        page,
        limit,
      };
    }
  );

  // ──────────────────────────────────────────────────────
  // تقرير المشتريات
  // ──────────────────────────────────────────────────────
  fastify.get(
    '/api/reports/purchases',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const from  = q.from  || new Date(new Date().setDate(1)).toISOString().split('T')[0];
      const to    = q.to    || new Date().toISOString().split('T')[0];
      const limit = Math.min(parseInt(q.limit || '200'), 500);
      const page  = Math.max(1, parseInt(q.page || '1'));
      const offset = (page - 1) * limit;

      const conditions = [`p.created_at::date BETWEEN $1 AND $2`];
      const params: unknown[] = [from, to];
      let idx = 3;

      if (q.supplier_id) {
        conditions.push(`p.supplier_id = $${idx++}`);
        params.push(q.supplier_id);
      }

      const where = conditions.join(' AND ');

      const [countRow, rows, summary] = await Promise.all([
        dbGet<{ total: string }>(`
          SELECT COUNT(*) AS total
          FROM purchases p
          WHERE ${where}
        `, params),

        dbAll(`
          SELECT
            p.id,
            p.invoice_number,
            p.total_amount,
            p.paid_amount,
            p.created_at,
            p.supplier_id,
            ${PAYMENT_STATUS_EXPR.replace(/paid_amount/g, 'p.paid_amount').replace(/total_amount/g, 'p.total_amount')} AS payment_status,
            s.name AS supplier_name,
            u.full_name AS created_by_name
          FROM purchases p
          LEFT JOIN suppliers s ON s.id = p.supplier_id
          LEFT JOIN users u ON u.id = p.user_id
          WHERE ${where}
          ORDER BY p.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `, params),

        dbGet<{ total_amount: string; total_paid: string; count: string }>(`
          SELECT
            COALESCE(SUM(total_amount),0) AS total_amount,
            COALESCE(SUM(paid_amount),0) AS total_paid,
            COUNT(*) AS count
          FROM purchases p
          WHERE ${where}
        `, params),
      ]);

      return {
        success: true,
        data: rows,
        summary: {
          totalAmount: parseFloat(summary?.total_amount ?? '0'),
          totalPaid: parseFloat(summary?.total_paid ?? '0'),
          totalDebt: parseFloat(summary?.total_amount ?? '0') - parseFloat(summary?.total_paid ?? '0'),
          count: parseInt(summary?.count ?? '0', 10),
        },
        total: parseInt(countRow?.total ?? '0', 10),
        page,
        limit,
      };
    }
  );

  // ──────────────────────────────────────────────────────
    // ──────────────────────────────────────────────────────
  // تقرير المخزون الحالي
  // ──────────────────────────────────────────────────────
  fastify.get(
    '/api/reports/stock',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const { q, category_id, low_stock, warehouse_id } = request.query as Record<string, string>;

      const conditions: string[] = ['p.is_active = true'];
      const params: unknown[] = [];
      let idx = 1;

      let warehouseJoin = '';
      let stockExpr = 'p.stock_quantity';

      if (warehouse_id) {
        warehouseJoin = `
          LEFT JOIN product_warehouse_stock pws
            ON pws.product_id = p.id
           AND pws.warehouse_id = $${idx}
        `;
        params.push(warehouse_id);
        idx++;
        stockExpr = 'COALESCE(pws.quantity, 0)';
      }

      if (q) {
        conditions.push(`(p.name ILIKE $${idx} OR p.barcode ILIKE $${idx})`);
        params.push(`%${q}%`);
        idx++;
      }

      if (category_id) {
        conditions.push(`p.category_id = $${idx++}`);
        params.push(category_id);
      }

      if (low_stock === 'true') {
        conditions.push(`${stockExpr} <= p.min_stock_level`);
      }

      const where = conditions.join(' AND ');

      const [rows, summary] = await Promise.all([
        dbAll(
          `
          SELECT
            p.id,
            p.barcode AS sku,
            p.name,
            ${stockExpr}::text AS stock_quantity,
            p.min_stock_level,
            p.wholesale_price,
            p.retail_price,
            p.purchase_price AS cost_price,
            c.name AS category_name
          FROM products p
          LEFT JOIN categories c ON c.id = p.category_id
          ${warehouseJoin}
          WHERE ${where}
          ORDER BY p.name ASC
          `,
          params
        ),

        dbGet<{ total_products: string; total_stock_value: string; low_stock_count: string }>(
          `
          SELECT
            COUNT(*) AS total_products,
            COALESCE(SUM(${stockExpr} * p.purchase_price), 0) AS total_stock_value,
            SUM(CASE WHEN ${stockExpr} <= p.min_stock_level THEN 1 ELSE 0 END) AS low_stock_count
          FROM products p
          ${warehouseJoin}
          WHERE ${where}
          `,
          params
        ),
      ]);

      return {
        success: true,
        data: rows,
        summary: {
          totalProducts: parseInt(summary?.total_products ?? '0', 10),
          totalStockValue: parseFloat(summary?.total_stock_value ?? '0'),
          lowStockCount: parseInt(summary?.low_stock_count ?? '0', 10),
        },
      };
    }
  );

  // ──────────────────────────────────────────────────────
  // تقرير الربح/الخسارة — صافي بعد المرتجعات
  // ──────────────────────────────────────────────────────
  fastify.get(
    '/api/reports/profit',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const from = q.from || new Date(new Date().setDate(1)).toISOString().split('T')[0];
      const to   = q.to   || new Date().toISOString().split('T')[0];

      const reportParams: unknown[] = [from, to];
      const warehouseFilter =
        q.warehouse_id && q.warehouse_id.trim()
          ? ` AND s.warehouse_id = $3`
          : '';

      if (q.warehouse_id && q.warehouse_id.trim()) {
        reportParams.push(q.warehouse_id.trim());
      }

      const [rows, expensesRow] = await Promise.all([
        dbAll(`
          WITH sold AS (
            SELECT
              p.id AS product_id,
              p.name AS product_name,
              p.barcode AS sku,
              COALESCE(SUM(si.quantity), 0) AS total_sold,
              COALESCE(SUM(si.total_price), 0) AS sold_revenue,
              COALESCE(SUM(si.quantity * p.purchase_price), 0) AS sold_cost
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            JOIN products p ON p.id = si.product_id
            WHERE s.created_at::date BETWEEN $1 AND $2
              ${warehouseFilter}
            GROUP BY p.id, p.name, p.barcode
          ),
          returned AS (
            SELECT
              p.id AS product_id,
              p.name AS product_name,
              p.barcode AS sku,
              COALESCE(SUM(sri.quantity), 0) AS total_returned,
              COALESCE(SUM(sri.total_price), 0) AS returned_revenue,
              COALESCE(SUM(sri.quantity * p.purchase_price), 0) AS returned_cost
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.id = sri.return_id
            JOIN sales s ON s.id = sr.sale_id
            JOIN products p ON p.id = sri.product_id
            WHERE sr.created_at::date BETWEEN $1 AND $2
              ${warehouseFilter}
            GROUP BY p.id, p.name, p.barcode
          )
          SELECT
            COALESCE(sold.product_id, returned.product_id) AS id,
            COALESCE(sold.product_name, returned.product_name) AS product_name,
            COALESCE(sold.sku, returned.sku) AS sku,

            (
              COALESCE(sold.total_sold, 0) - COALESCE(returned.total_returned, 0)
            )::text AS total_sold,

            COALESCE(returned.total_returned, 0)::text AS total_returned,

            COALESCE(sold.sold_revenue, 0)::text AS sold_revenue,
            COALESCE(returned.returned_revenue, 0)::text AS returned_revenue,
            (
              COALESCE(sold.sold_revenue, 0) - COALESCE(returned.returned_revenue, 0)
            )::text AS total_revenue,

            COALESCE(sold.sold_cost, 0)::text AS sold_cost,
            COALESCE(returned.returned_cost, 0)::text AS returned_cost,
            (
              COALESCE(sold.sold_cost, 0) - COALESCE(returned.returned_cost, 0)
            )::text AS total_cost,

            (
              (COALESCE(sold.sold_revenue, 0) - COALESCE(returned.returned_revenue, 0))
              -
              (COALESCE(sold.sold_cost, 0) - COALESCE(returned.returned_cost, 0))
            )::text AS gross_profit
          FROM sold
          FULL OUTER JOIN returned ON returned.product_id = sold.product_id
          WHERE
            COALESCE(sold.sold_revenue, 0) <> 0
            OR COALESCE(returned.returned_revenue, 0) <> 0
          ORDER BY
            ((COALESCE(sold.sold_revenue, 0) - COALESCE(returned.returned_revenue, 0))
             -
             (COALESCE(sold.sold_cost, 0) - COALESCE(returned.returned_cost, 0))) DESC,
            (COALESCE(sold.sold_revenue, 0) - COALESCE(returned.returned_revenue, 0)) DESC
        `, reportParams),

        q.warehouse_id && q.warehouse_id.trim()
          ? Promise.resolve({ total: '0' } as { total: string })
          : dbGet<{ total: string }>(`
              SELECT COALESCE(SUM(amount_usd), 0) AS total
              FROM expenses
              WHERE expense_date BETWEEN $1 AND $2
            `, [from, to]),
      ]);

      const totalRevenue = rows.reduce(
        (s, r) => s + parseFloat(String((r as { total_revenue: string }).total_revenue ?? '0')),
        0
      );

      const totalCost = rows.reduce(
        (s, r) => s + parseFloat(String((r as { total_cost: string }).total_cost ?? '0')),
        0
      );

      const grossProfit = totalRevenue - totalCost;
      const totalExpenses = parseFloat(expensesRow?.total ?? '0');
      const netProfit = grossProfit - totalExpenses;
      const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

      return {
        success: true,
        data: rows,
        summary: {
          totalRevenue,
          totalCost,
          grossProfit,
          totalExpenses,
          netProfit,
          margin: parseFloat(margin.toFixed(2)),
        },
        from,
        to,
      };
    }
  );
}