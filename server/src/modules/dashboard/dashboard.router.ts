import type { FastifyInstance } from 'fastify';
import { dbGet, dbAll } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import { getMorningDecisionsPayload } from './morningDecisions.service.js';
export async function dashboardRoutes(fastify: FastifyInstance) {

  fastify.get(
    '/api/dashboard/today-summary',
    { onRequest: [fastify.authenticate] },
    async () => {
      const today = await dbGet<{
        sales_count: string;
        sales_total: string;
        returns_count: string;
        returns_total: string;
        collected_total: string;
        cash_refunds_total: string;
      }>(`
        SELECT
          COALESCE((SELECT COUNT(*) FROM sales WHERE created_at >= CURRENT_DATE), 0) AS sales_count,
          COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at >= CURRENT_DATE), 0) AS sales_total,
          COALESCE((SELECT COUNT(*) FROM sales_returns WHERE created_at >= CURRENT_DATE), 0) AS returns_count,
          COALESCE((SELECT SUM(total_amount) FROM sales_returns WHERE created_at >= CURRENT_DATE), 0) AS returns_total,
          COALESCE((SELECT SUM(paid_amount) FROM sales WHERE created_at >= CURRENT_DATE), 0) AS collected_total,
          COALESCE((
            SELECT SUM(total_amount)
            FROM sales_returns
            WHERE created_at >= CURRENT_DATE
              AND return_method = 'cash_refund'
          ), 0) AS cash_refunds_total
      `);

      const salesTotal = parseFloat(today?.sales_total ?? '0');
      const returnsTotal = parseFloat(today?.returns_total ?? '0');
      const collectedTotal = parseFloat(today?.collected_total ?? '0');
      const cashRefundsTotal = parseFloat(today?.cash_refunds_total ?? '0');

      return {
        success: true,
        summary: {
          salesCount: parseInt(today?.sales_count ?? '0', 10),
          returnsCount: parseInt(today?.returns_count ?? '0', 10),
          salesTotal,
          returnsTotal,
          netSales: salesTotal - returnsTotal,
          collectedTotal,
          cashRefundsTotal,
          netCash: collectedTotal - cashRefundsTotal,
        },
      };
    }
  );

    fastify.get(
    '/api/dashboard/morning-decisions',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async () => {
      const payload = await getMorningDecisionsPayload();

      return {
        success: true,
        ...payload,
      };
    }
  );

  fastify.get(
    '/api/dashboard/smart-suggestions',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const q = request.query as Record<string, string | undefined>;
      const parsedWarehouseId = q.warehouse_id ? parseInt(q.warehouse_id, 10) : NaN;
      const warehouseId =
        Number.isFinite(parsedWarehouseId) && parsedWarehouseId > 0
          ? parsedWarehouseId
          : null;

      const salesAliasFilter = warehouseId ? ` AND s.warehouse_id = ${warehouseId}` : '';
      const stockJoin = warehouseId
        ? `LEFT JOIN product_warehouse_stock pws ON pws.product_id = p.id AND pws.warehouse_id = ${warehouseId}`
        : '';
      const stockExpr = warehouseId ? `COALESCE(pws.quantity, 0)` : `p.stock_quantity`;

      const [reorderNowRows, stockRiskRows, slowMovingRows] = await Promise.all([
        dbAll<{
          id: number;
          name: string;
          stock_quantity: string;
          min_stock_level: string;
          net_sold_30: string;
          days_left: string | null;
        }>(`
          WITH sold AS (
            SELECT
              si.product_id,
              COALESCE(SUM(si.quantity), 0) AS sold_qty
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.created_at >= NOW() - INTERVAL '30 days'${salesAliasFilter}
            GROUP BY si.product_id
          ),
          returned AS (
            SELECT
              sri.product_id,
              COALESCE(SUM(sri.quantity), 0) AS returned_qty
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.id = sri.return_id
            JOIN sales s ON s.id = sr.sale_id
            WHERE sr.created_at >= NOW() - INTERVAL '30 days'${salesAliasFilter}
            GROUP BY sri.product_id
          ),
          metrics AS (
            SELECT
              p.id,
              p.name,
              ${stockExpr} AS stock_quantity,
              p.min_stock_level,
              GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) AS net_sold_30,
              CASE
                WHEN GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) > 0
                THEN ROUND((
                  ${stockExpr} /
                  NULLIF(
                    GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) / 30.0,
                    0
                  )
                )::numeric, 1)
                ELSE NULL
              END AS days_left
            FROM products p
            ${stockJoin}
            LEFT JOIN sold     ON sold.product_id = p.id
            LEFT JOIN returned ON returned.product_id = p.id
            WHERE p.is_active = true
          )
          SELECT
            id,
            name,
            stock_quantity::text,
            min_stock_level::text,
            net_sold_30::text,
            CASE WHEN days_left IS NULL THEN NULL ELSE days_left::text END AS days_left
          FROM metrics
          WHERE stock_quantity <= min_stock_level
            AND net_sold_30 > 0
          ORDER BY COALESCE(days_left, 999999) ASC, net_sold_30 DESC, stock_quantity ASC
          LIMIT 100
        `),

        dbAll<{
          id: number;
          name: string;
          stock_quantity: string;
          min_stock_level: string;
          net_sold_14: string;
          days_left: string;
        }>(`
          WITH sold AS (
            SELECT
              si.product_id,
              COALESCE(SUM(si.quantity), 0) AS sold_qty
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE s.created_at >= NOW() - INTERVAL '14 days'${salesAliasFilter}
            GROUP BY si.product_id
          ),
          returned AS (
            SELECT
              sri.product_id,
              COALESCE(SUM(sri.quantity), 0) AS returned_qty
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.id = sri.return_id
            JOIN sales s ON s.id = sr.sale_id
            WHERE sr.created_at >= NOW() - INTERVAL '14 days'${salesAliasFilter}
            GROUP BY sri.product_id
          ),
          metrics AS (
            SELECT
              p.id,
              p.name,
              ${stockExpr} AS stock_quantity,
              p.min_stock_level,
              GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) AS net_sold_14,
              ROUND((
                ${stockExpr} /
                NULLIF(
                  GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) / 14.0,
                  0
                )
              )::numeric, 1) AS days_left
            FROM products p
            ${stockJoin}
            LEFT JOIN sold     ON sold.product_id = p.id
            LEFT JOIN returned ON returned.product_id = p.id
            WHERE p.is_active = true
          )
          SELECT
            id,
            name,
            stock_quantity::text,
            min_stock_level::text,
            net_sold_14::text,
            days_left::text
          FROM metrics
          WHERE stock_quantity > min_stock_level
            AND stock_quantity > 0
            AND net_sold_14 > 0
            AND days_left <= 3
          ORDER BY days_left ASC, net_sold_14 DESC, stock_quantity ASC
          LIMIT 100
        `),

        dbAll<{
          id: number;
          name: string;
          stock_quantity: string;
          min_stock_level: string;
          last_sale_at: string | null;
          days_since_last_sale: string | null;
        }>(`
          WITH last_sales AS (
            SELECT
              si.product_id,
              MAX(s.created_at) AS last_sale_at
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE 1 = 1${salesAliasFilter}
            GROUP BY si.product_id
          )
          SELECT
            p.id,
            p.name,
            ${stockExpr}::text AS stock_quantity,
            p.min_stock_level::text,
            last_sales.last_sale_at::text,
            CASE
              WHEN last_sales.last_sale_at IS NULL THEN NULL
              ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - last_sales.last_sale_at)) / 86400)::int::text
            END AS days_since_last_sale
          FROM products p
          ${stockJoin}
          LEFT JOIN last_sales ON last_sales.product_id = p.id
          WHERE p.is_active = true
            AND ${stockExpr} > 0
            AND (
              last_sales.last_sale_at IS NULL
              OR last_sales.last_sale_at < NOW() - INTERVAL '30 days'
            )
          ORDER BY last_sales.last_sale_at ASC NULLS FIRST, ${stockExpr} DESC
          LIMIT 100
        `),
      ]);

      const reorderNow = reorderNowRows.map((row) => ({
        id: row.id,
        name: row.name,
        stock_quantity: parseFloat(row.stock_quantity || '0'),
        min_stock_level: parseFloat(row.min_stock_level || '0'),
        net_sold_30: parseFloat(row.net_sold_30 || '0'),
        days_left: row.days_left == null ? null : parseFloat(row.days_left),
      }));

      const stockRisk = stockRiskRows.map((row) => ({
        id: row.id,
        name: row.name,
        stock_quantity: parseFloat(row.stock_quantity || '0'),
        min_stock_level: parseFloat(row.min_stock_level || '0'),
        net_sold_14: parseFloat(row.net_sold_14 || '0'),
        days_left: parseFloat(row.days_left || '0'),
      }));

      const slowMoving = slowMovingRows.map((row) => ({
        id: row.id,
        name: row.name,
        stock_quantity: parseFloat(row.stock_quantity || '0'),
        min_stock_level: parseFloat(row.min_stock_level || '0'),
        last_sale_at: row.last_sale_at,
        days_since_last_sale: row.days_since_last_sale == null ? null : parseInt(row.days_since_last_sale, 10),
      }));

      return {
        success: true,
        suggestions: {
          reorderNow,
          stockRisk,
          slowMoving,
          total: reorderNow.length + stockRisk.length + slowMoving.length,
        },
      };
    }
  );

  fastify.get(
    '/api/dashboard/stats',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request) => {
      const q = request.query as Record<string, string | undefined>;
      const parsedWarehouseId = q.warehouse_id ? parseInt(q.warehouse_id, 10) : NaN;
      const warehouseId =
        Number.isFinite(parsedWarehouseId) && parsedWarehouseId > 0
          ? parsedWarehouseId
          : null;

      const salesRootFilter = warehouseId ? ` AND warehouse_id = ${warehouseId}` : '';
      const purchasesRootFilter = warehouseId ? ` AND warehouse_id = ${warehouseId}` : '';
      const salesAliasFilter = warehouseId ? ` AND s.warehouse_id = ${warehouseId}` : '';

      const lowStockPromise = warehouseId
        ? dbAll<{ id: number; name: string; stock_quantity: string; min_stock_level: string }>(`
            SELECT
              p.id,
              p.name,
              COALESCE(pws.quantity, 0)::text AS stock_quantity,
              p.min_stock_level
            FROM products p
            LEFT JOIN product_warehouse_stock pws
              ON pws.product_id = p.id
             AND pws.warehouse_id = ${warehouseId}
            WHERE p.is_active = true
              AND COALESCE(pws.quantity, 0) <= p.min_stock_level
            ORDER BY COALESCE(pws.quantity, 0) ASC
            LIMIT 100
          `)
        : dbAll<{ id: number; name: string; stock_quantity: string; min_stock_level: string }>(`
            SELECT id, name, stock_quantity, min_stock_level
            FROM products
            WHERE is_active = true AND stock_quantity <= min_stock_level
            ORDER BY stock_quantity ASC
            LIMIT 100
          `);

      const [
        salesToday,
        salesWeek,
        salesMonth,
        purchasesMonth,
        customerDebt,
        supplierBalance,
        topProducts,
        lowStock,
        recentSales,
        cashFlowMonth,
        expensesMonth,
        grossProfitMonth,
      ] = await Promise.all([
        dbGet<{ count: string; sales_total: string; returns_total: string }>(`
          SELECT
            COALESCE((SELECT COUNT(*) FROM sales WHERE created_at >= CURRENT_DATE${salesRootFilter}), 0) AS count,
            COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at >= CURRENT_DATE${salesRootFilter}), 0) AS sales_total,
            COALESCE((
              SELECT SUM(sr.total_amount)
              FROM sales_returns sr
              JOIN sales s ON s.id = sr.sale_id
              WHERE sr.created_at >= CURRENT_DATE${salesAliasFilter}
            ), 0) AS returns_total
        `),

        dbGet<{ count: string; sales_total: string; returns_total: string }>(`
          SELECT
            COALESCE((SELECT COUNT(*) FROM sales WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'${salesRootFilter}), 0) AS count,
            COALESCE((SELECT SUM(total_amount) FROM sales WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'${salesRootFilter}), 0) AS sales_total,
            COALESCE((
              SELECT SUM(sr.total_amount)
              FROM sales_returns sr
              JOIN sales s ON s.id = sr.sale_id
              WHERE sr.created_at >= CURRENT_DATE - INTERVAL '7 days'${salesAliasFilter}
            ), 0) AS returns_total
        `),

        dbGet<{ count: string; sales_total: string; returns_total: string }>(`
          SELECT
            COALESCE((
              SELECT COUNT(*)
              FROM sales
              WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())${salesRootFilter}
            ), 0) AS count,
            COALESCE((
              SELECT SUM(total_amount)
              FROM sales
              WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())${salesRootFilter}
            ), 0) AS sales_total,
            COALESCE((
              SELECT SUM(sr.total_amount)
              FROM sales_returns sr
              JOIN sales s ON s.id = sr.sale_id
              WHERE DATE_TRUNC('month', sr.created_at) = DATE_TRUNC('month', NOW())${salesAliasFilter}
            ), 0) AS returns_total
        `),

        dbGet<{ count: string; total: string }>(`
          SELECT COUNT(*) AS count, COALESCE(SUM(total_amount),0) AS total
          FROM purchases
          WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())${purchasesRootFilter}
        `),

        dbGet<{ total: string }>(`SELECT COALESCE(SUM(balance),0) AS total FROM customers`),

        dbGet<{ total: string }>(`SELECT COALESCE(SUM(balance),0) AS total FROM suppliers`),

        dbAll<{ product_name: string; product_unit: string | null; total_qty: string; total_revenue: string }>(`
          WITH sold AS (
            SELECT
              si.product_id,
              p.name AS product_name,
              p.unit AS product_unit,
              COALESCE(SUM(si.quantity), 0) AS total_sold_qty,
              COALESCE(SUM(si.total_price), 0) AS total_sold_revenue
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            JOIN products p ON p.id = si.product_id
            WHERE DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())${salesAliasFilter}
            GROUP BY si.product_id, p.name, p.unit
          ),
          returned AS (
            SELECT
              sri.product_id,
              p.name AS product_name,
              p.unit AS product_unit,
              COALESCE(SUM(sri.quantity), 0) AS total_return_qty,
              COALESCE(SUM(sri.total_price), 0) AS total_return_revenue
            FROM sales_return_items sri
            JOIN sales_returns sr ON sr.id = sri.return_id
            JOIN sales s ON s.id = sr.sale_id
            JOIN products p ON p.id = sri.product_id
            WHERE DATE_TRUNC('month', sr.created_at) = DATE_TRUNC('month', NOW())${salesAliasFilter}
            GROUP BY sri.product_id, p.name, p.unit
          )
          SELECT
            COALESCE(sold.product_name, returned.product_name) AS product_name,
            COALESCE(sold.product_unit, returned.product_unit) AS product_unit,
            (
              COALESCE(sold.total_sold_qty, 0) - COALESCE(returned.total_return_qty, 0)
            )::text AS total_qty,
            (
              COALESCE(sold.total_sold_revenue, 0) - COALESCE(returned.total_return_revenue, 0)
            )::text AS total_revenue
          FROM sold
          FULL OUTER JOIN returned ON returned.product_id = sold.product_id
          WHERE (
            COALESCE(sold.total_sold_qty, 0) - COALESCE(returned.total_return_qty, 0)
          ) > 0
          ORDER BY
            (COALESCE(sold.total_sold_qty, 0) - COALESCE(returned.total_return_qty, 0)) DESC,
            (COALESCE(sold.total_sold_revenue, 0) - COALESCE(returned.total_return_revenue, 0)) DESC
          LIMIT 100
        `),

        lowStockPromise,

        dbAll<{ id: number; invoice_number: string; total_amount: string; created_at: string; customer_name: string | null }>(`
          SELECT
            s.id,
            s.invoice_number,
            GREATEST(s.total_amount - COALESCE(sr.returned_total, 0), 0)::text AS total_amount,
            s.created_at,
            c.name AS customer_name
          FROM sales s
          LEFT JOIN customers c ON c.id = s.customer_id
          LEFT JOIN (
            SELECT sale_id, COALESCE(SUM(total_amount), 0) AS returned_total
            FROM sales_returns
            GROUP BY sale_id
          ) sr ON sr.sale_id = s.id
          WHERE 1 = 1${salesAliasFilter}
          ORDER BY s.created_at DESC
          LIMIT 100
        `),

        dbGet<{ sales_total: string; purchases_total: string; cash_refunds_total: string }>(`
          SELECT
            COALESCE((
              SELECT SUM(paid_amount)
              FROM sales
              WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())${salesRootFilter}
            ), 0) AS sales_total,
            COALESCE((
              SELECT SUM(paid_amount)
              FROM purchases
              WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())${purchasesRootFilter}
            ), 0) AS purchases_total,
            COALESCE((
              SELECT SUM(sr.total_amount)
              FROM sales_returns sr
              JOIN sales s ON s.id = sr.sale_id
              WHERE DATE_TRUNC('month', sr.created_at) = DATE_TRUNC('month', NOW())
                AND sr.return_method = 'cash_refund'${salesAliasFilter}
            ), 0) AS cash_refunds_total
        `),

        dbGet<{ total: string }>(`
          SELECT COALESCE(SUM(amount_usd), 0) AS total
          FROM expenses
          WHERE DATE_TRUNC('month', expense_date::date) = DATE_TRUNC('month', NOW())
        `),

        dbGet<{
          sold_revenue: string;
          returned_revenue: string;
          sold_cost: string;
          returned_cost: string;
        }>(`
          SELECT
            COALESCE((
              SELECT SUM(si.total_price)
              FROM sale_items si
              JOIN sales s ON s.id = si.sale_id
              WHERE DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())${salesAliasFilter}
            ), 0) AS sold_revenue,

            COALESCE((
              SELECT SUM(sri.total_price)
              FROM sales_return_items sri
              JOIN sales_returns sr ON sr.id = sri.return_id
              JOIN sales s ON s.id = sr.sale_id
              WHERE DATE_TRUNC('month', sr.created_at) = DATE_TRUNC('month', NOW())${salesAliasFilter}
            ), 0) AS returned_revenue,

            COALESCE((
              SELECT SUM(si.quantity * p.purchase_price)
              FROM sale_items si
              JOIN sales s ON s.id = si.sale_id
              JOIN products p ON p.id = si.product_id
              WHERE DATE_TRUNC('month', s.created_at) = DATE_TRUNC('month', NOW())${salesAliasFilter}
            ), 0) AS sold_cost,

            COALESCE((
              SELECT SUM(sri.quantity * p.purchase_price)
              FROM sales_return_items sri
              JOIN sales_returns sr ON sr.id = sri.return_id
              JOIN sales s ON s.id = sr.sale_id
              JOIN products p ON p.id = sri.product_id
              WHERE DATE_TRUNC('month', sr.created_at) = DATE_TRUNC('month', NOW())${salesAliasFilter}
            ), 0) AS returned_cost
        `),
      ]);

      const todaySalesTotal = parseFloat(salesToday?.sales_total ?? '0');
      const todayReturnsTotal = parseFloat(salesToday?.returns_total ?? '0');

      const weekSalesTotal = parseFloat(salesWeek?.sales_total ?? '0');
      const weekReturnsTotal = parseFloat(salesWeek?.returns_total ?? '0');

      const monthSalesTotal = parseFloat(salesMonth?.sales_total ?? '0');
      const monthReturnsTotal = parseFloat(salesMonth?.returns_total ?? '0');

      const soldRevenue = parseFloat(grossProfitMonth?.sold_revenue ?? '0');
      const returnedRevenue = parseFloat(grossProfitMonth?.returned_revenue ?? '0');
      const soldCost = parseFloat(grossProfitMonth?.sold_cost ?? '0');
      const returnedCost = parseFloat(grossProfitMonth?.returned_cost ?? '0');

      const netRevenue = soldRevenue - returnedRevenue;
      const netCost = soldCost - returnedCost;

      const totalExpenses = parseFloat(expensesMonth?.total ?? '0');
      const grossProfit = netRevenue - netCost;
      const netProfit = grossProfit - totalExpenses;

      const salesCash = parseFloat(cashFlowMonth?.sales_total ?? '0');
      const purchasesCash = parseFloat(cashFlowMonth?.purchases_total ?? '0');
      const cashRefunds = parseFloat(cashFlowMonth?.cash_refunds_total ?? '0');

      return {
        success: true,
        stats: {
          sales: {
            today: {
              count: parseInt(salesToday?.count ?? '0', 10),
              total: todaySalesTotal - todayReturnsTotal,
              salesTotal: todaySalesTotal,
              returnsTotal: todayReturnsTotal,
            },
            week: {
              count: parseInt(salesWeek?.count ?? '0', 10),
              total: weekSalesTotal - weekReturnsTotal,
              salesTotal: weekSalesTotal,
              returnsTotal: weekReturnsTotal,
            },
            month: {
              count: parseInt(salesMonth?.count ?? '0', 10),
              total: monthSalesTotal - monthReturnsTotal,
              salesTotal: monthSalesTotal,
              returnsTotal: monthReturnsTotal,
            },
          },

          purchases: {
            month: {
              count: parseInt(purchasesMonth?.count ?? '0', 10),
              total: parseFloat(purchasesMonth?.total ?? '0'),
            },
          },

          receivables: {
            customerDebt: parseFloat(customerDebt?.total ?? '0'),
            supplierBalance: parseFloat(supplierBalance?.total ?? '0'),
          },

          cashFlow: {
            salesCash,
            purchasesCash,
            cashRefunds,
            net: salesCash - cashRefunds - purchasesCash,
          },

          profit: {
            soldRevenue,
            returnedRevenue,
            netRevenue,
            soldCost,
            returnedCost,
            totalCost: netCost,
            grossProfit,
            totalExpenses,
            netProfit,
          },

          topProducts: topProducts ?? [],
          lowStock: lowStock ?? [],
          recentSales: recentSales ?? [],
        },
      };
    }
  );
}