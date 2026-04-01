import { dbAll } from '../../shared/db/pool.js';

export interface MorningDecisionSummary {
  badge_count: number;
  urgent_restock_count: number;
  slow_moving_count: number;
  top_selling_count: number;
  pending_orders_count: number;
  attention_count: number;
  generated_at: string;
}

export interface MorningDecisionData {
  urgentRestock: Array<{
    id: number;
    name: string;
    stock_quantity: number;
    min_stock_level: number;
    net_sold_30: number;
    days_left: number | null;
  }>;
  slowMoving: Array<{
    id: number;
    name: string;
    stock_quantity: number;
    min_stock_level: number;
    last_sale_at: string | null;
    days_since_last_sale: number | null;
  }>;
  topSelling: Array<{
    product_id: number;
    product_name: string;
    product_unit: string | null;
    net_qty: number;
    net_revenue: number;
  }>;
  pendingOrders: Array<{
    id: number;
    order_number: string;
    source: string;
    status: string;
    customer_name: string;
    recipient_name: string | null;
    payment_method: string;
    warehouse_name: string | null;
    created_at: string;
  }>;
  attention: Array<{
    key: string;
    type: 'shift_variance' | 'old_pending_order' | 'out_of_stock_top_seller';
    severity: 'high' | 'medium';
    title: string;
    subtitle: string;
    route: string;
    metric_kind: 'money' | 'hours' | 'quantity';
    metric_value: number;
    metric_prefix: string | null;
  }>;
}

export async function getMorningDecisionsPayload(): Promise<{
  summary: MorningDecisionSummary;
  decisions: MorningDecisionData;
}> {
  const [
    urgentRestockRows,
    slowMovingRows,
    topSellingRows,
    pendingOrdersRows,
    shiftVarianceRows,
    oldPendingOrdersRows,
    outOfStockTopSellerRows,
  ] = await Promise.all([
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
        WHERE s.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY si.product_id
      ),
      returned AS (
        SELECT
          sri.product_id,
          COALESCE(SUM(sri.quantity), 0) AS returned_qty
        FROM sales_return_items sri
        JOIN sales_returns sr ON sr.id = sri.return_id
        WHERE sr.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY sri.product_id
      ),
      metrics AS (
        SELECT
          p.id,
          p.name,
          p.stock_quantity,
          p.min_stock_level,
          GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) AS net_sold_30,
          CASE
            WHEN GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) > 0
            THEN ROUND((
              p.stock_quantity /
              NULLIF(
                GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) / 30.0,
                0
              )
            )::numeric, 1)
            ELSE NULL
          END AS days_left
        FROM products p
        LEFT JOIN sold ON sold.product_id = p.id
        LEFT JOIN returned ON returned.product_id = p.id
        WHERE p.is_active = TRUE
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
      LIMIT 8
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
        GROUP BY si.product_id
      )
      SELECT
        p.id,
        p.name,
        p.stock_quantity::text AS stock_quantity,
        p.min_stock_level::text,
        last_sales.last_sale_at::text,
        CASE
          WHEN last_sales.last_sale_at IS NULL THEN NULL
          ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - last_sales.last_sale_at)) / 86400)::int::text
        END AS days_since_last_sale
      FROM products p
      LEFT JOIN last_sales ON last_sales.product_id = p.id
      WHERE p.is_active = TRUE
        AND p.stock_quantity > 0
        AND (
          last_sales.last_sale_at IS NULL
          OR last_sales.last_sale_at < NOW() - INTERVAL '30 days'
        )
      ORDER BY last_sales.last_sale_at ASC NULLS FIRST, p.stock_quantity DESC
      LIMIT 8
    `),

    dbAll<{
      product_id: number;
      product_name: string;
      product_unit: string | null;
      net_qty: string;
      net_revenue: string;
    }>(`
      WITH sold AS (
        SELECT
          si.product_id,
          p.name AS product_name,
          p.unit AS product_unit,
          COALESCE(SUM(si.quantity), 0) AS sold_qty,
          COALESCE(SUM(si.total_price), 0) AS sold_revenue
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        JOIN products p ON p.id = si.product_id
        WHERE s.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY si.product_id, p.name, p.unit
      ),
      returned AS (
        SELECT
          sri.product_id,
          p.name AS product_name,
          p.unit AS product_unit,
          COALESCE(SUM(sri.quantity), 0) AS return_qty,
          COALESCE(SUM(sri.total_price), 0) AS return_revenue
        FROM sales_return_items sri
        JOIN sales_returns sr ON sr.id = sri.return_id
        JOIN products p ON p.id = sri.product_id
        WHERE sr.created_at >= NOW() - INTERVAL '7 days'
        GROUP BY sri.product_id, p.name, p.unit
      )
      SELECT
        COALESCE(sold.product_id, returned.product_id) AS product_id,
        COALESCE(sold.product_name, returned.product_name) AS product_name,
        COALESCE(sold.product_unit, returned.product_unit) AS product_unit,
        (
          COALESCE(sold.sold_qty, 0) - COALESCE(returned.return_qty, 0)
        )::text AS net_qty,
        (
          COALESCE(sold.sold_revenue, 0) - COALESCE(returned.return_revenue, 0)
        )::text AS net_revenue
      FROM sold
      FULL OUTER JOIN returned ON returned.product_id = sold.product_id
      WHERE (
        COALESCE(sold.sold_qty, 0) - COALESCE(returned.return_qty, 0)
      ) > 0
      ORDER BY
        (COALESCE(sold.sold_qty, 0) - COALESCE(returned.return_qty, 0)) DESC,
        (COALESCE(sold.sold_revenue, 0) - COALESCE(returned.return_revenue, 0)) DESC
      LIMIT 10
    `),

    dbAll<{
      id: number;
      order_number: string;
      source: string;
      status: string;
      customer_name: string;
      recipient_name: string | null;
      payment_method: string;
      warehouse_name: string | null;
      created_at: string;
    }>(`
      SELECT
        o.id,
        o.order_number,
        o.source,
        o.status,
        o.customer_name,
        o.recipient_name,
        o.payment_method,
        w.name AS warehouse_name,
        o.created_at::text
      FROM customer_orders o
      LEFT JOIN warehouses w ON w.id = o.warehouse_id
      WHERE o.status IN ('new', 'reviewed')
      ORDER BY
        CASE WHEN o.status = 'new' THEN 0 ELSE 1 END,
        o.created_at ASC
      LIMIT 10
    `),

    dbAll<{
      id: number;
      cashier_name: string;
      difference: string;
      closed_at: string;
    }>(`
      SELECT
        s.id,
        u.full_name AS cashier_name,
        s.difference::text,
        s.closed_at::text
      FROM shifts s
      JOIN users u ON u.id = s.user_id
      WHERE s.status = 'closed'
        AND s.closed_at >= CURRENT_DATE
        AND ABS(COALESCE(s.difference, 0)) > 0.009
      ORDER BY ABS(s.difference) DESC, s.closed_at DESC
      LIMIT 5
    `),

    dbAll<{
      id: number;
      order_number: string;
      customer_name: string;
      created_at: string;
      age_hours: string;
    }>(`
      SELECT
        id,
        order_number,
        customer_name,
        created_at::text,
        ROUND((EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0)::numeric, 1)::text AS age_hours
      FROM customer_orders
      WHERE status IN ('new', 'reviewed')
        AND created_at < NOW() - INTERVAL '4 hours'
      ORDER BY created_at ASC
      LIMIT 5
    `),

    dbAll<{
      id: number;
      name: string;
      net_sold_30: string;
    }>(`
      WITH sold AS (
        SELECT
          si.product_id,
          COALESCE(SUM(si.quantity), 0) AS sold_qty
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY si.product_id
      ),
      returned AS (
        SELECT
          sri.product_id,
          COALESCE(SUM(sri.quantity), 0) AS returned_qty
        FROM sales_return_items sri
        JOIN sales_returns sr ON sr.id = sri.return_id
        WHERE sr.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY sri.product_id
      )
      SELECT
        p.id,
        p.name,
        GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0)::text AS net_sold_30
      FROM products p
      LEFT JOIN sold ON sold.product_id = p.id
      LEFT JOIN returned ON returned.product_id = p.id
      WHERE p.is_active = TRUE
        AND p.stock_quantity <= 0
        AND GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) > 0
      ORDER BY GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) DESC
      LIMIT 5
    `),
  ]);

  const urgentRestock = urgentRestockRows.map((row) => ({
    id: row.id,
    name: row.name,
    stock_quantity: parseFloat(row.stock_quantity || '0'),
    min_stock_level: parseFloat(row.min_stock_level || '0'),
    net_sold_30: parseFloat(row.net_sold_30 || '0'),
    days_left: row.days_left == null ? null : parseFloat(row.days_left),
  }));

  const slowMoving = slowMovingRows.map((row) => ({
    id: row.id,
    name: row.name,
    stock_quantity: parseFloat(row.stock_quantity || '0'),
    min_stock_level: parseFloat(row.min_stock_level || '0'),
    last_sale_at: row.last_sale_at,
    days_since_last_sale:
      row.days_since_last_sale == null ? null : parseInt(row.days_since_last_sale, 10),
  }));

  const topSelling = topSellingRows.map((row) => ({
    product_id: row.product_id,
    product_name: row.product_name,
    product_unit: row.product_unit,
    net_qty: parseFloat(row.net_qty || '0'),
    net_revenue: parseFloat(row.net_revenue || '0'),
  }));

  const pendingOrders = pendingOrdersRows.map((row) => ({
    id: row.id,
    order_number: row.order_number,
    source: row.source,
    status: row.status,
    customer_name: row.customer_name,
    recipient_name: row.recipient_name,
    payment_method: row.payment_method,
    warehouse_name: row.warehouse_name,
    created_at: row.created_at,
  }));

  const attention = [
    ...shiftVarianceRows.map((row) => {
      const difference = parseFloat(row.difference || '0');
      return {
        key: `shift-${row.id}`,
        type: 'shift_variance' as const,
        severity: 'high' as const,
        title: `فرق نقدي في وردية ${row.cashier_name}`,
        subtitle: 'تم إغلاق وردية اليوم على فرق يحتاج مراجعة',
        route: '/shifts',
        metric_kind: 'money' as const,
        metric_value: Math.abs(difference),
        metric_prefix: difference >= 0 ? '+' : '-',
      };
    }),
    ...oldPendingOrdersRows.map((row) => ({
      key: `order-age-${row.id}`,
      type: 'old_pending_order' as const,
      severity: 'medium' as const,
      title: `طلب متأخر: ${row.order_number}`,
      subtitle: `باسم ${row.customer_name}`,
      route: '/incoming-orders',
      metric_kind: 'hours' as const,
      metric_value: parseFloat(row.age_hours || '0'),
      metric_prefix: null,
    })),
    ...outOfStockTopSellerRows.map((row) => ({
      key: `out-${row.id}`,
      type: 'out_of_stock_top_seller' as const,
      severity: 'high' as const,
      title: `نفد صنف نشط: ${row.name}`,
      subtitle: 'نفد مخزونه رغم نشاطه في آخر 30 يوم',
      route: '/products',
      metric_kind: 'quantity' as const,
      metric_value: parseFloat(row.net_sold_30 || '0'),
      metric_prefix: null,
    })),
  ];

  const badgeCount =
    urgentRestock.length +
    slowMoving.length +
    pendingOrders.length +
    attention.length;

  return {
    summary: {
      badge_count: badgeCount,
      urgent_restock_count: urgentRestock.length,
      slow_moving_count: slowMoving.length,
      top_selling_count: topSelling.length,
      pending_orders_count: pendingOrders.length,
      attention_count: attention.length,
      generated_at: new Date().toISOString(),
    },
    decisions: {
      urgentRestock,
      slowMoving,
      topSelling,
      pendingOrders,
      attention,
    },
  };
}