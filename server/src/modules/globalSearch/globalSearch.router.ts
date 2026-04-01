import type { FastifyInstance } from 'fastify';
import { pool } from '../../shared/db/pool.js';

type SearchRow = {
  id: number;
  title: string;
  subtitle: string | null;
  route: string;
  kind: 'product' | 'customer' | 'supplier' | 'sale' | 'return' | 'warehouse';
  score: number;
};

export async function globalSearchRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/global-search',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const q = String((request.query as Record<string, unknown>)?.q ?? '').trim();
      const limitRaw = Number((request.query as Record<string, unknown>)?.limit ?? 5);

      const limit = Number.isFinite(limitRaw)
        ? Math.min(Math.max(limitRaw, 1), 20)
        : 5;

      if (!q || q.length < 2) {
        return {
          success: true,
          query: q,
          results: [],
        };
      }

      const like = `%${q}%`;

      const settingsRes = await pool.query<{ value: string }>(
        `SELECT value FROM settings WHERE key = 'enable_multi_warehouse' LIMIT 1`
      );
      const isMultiWarehouseEnabled = settingsRes.rows[0]?.value === 'true';

      const warehouseUnion = isMultiWarehouseEnabled
        ? `
          UNION ALL

          -- Warehouses
          SELECT
            w.id,
            w.name::text AS title,
            TRIM(BOTH ' ' FROM CONCAT(
              COALESCE(w.code, ''),
              CASE WHEN w.is_active THEN ' • نشط' ELSE ' • معطّل' END
            ))::text AS subtitle,
            '/warehouses'::text AS route,
            'warehouse'::text AS kind,
            CASE
              WHEN LOWER(w.name) = LOWER($1) THEN 100
              WHEN COALESCE(w.code, '') = $1 THEN 95
              WHEN LOWER(w.name) LIKE LOWER($2) THEN 80
              WHEN COALESCE(w.code, '') LIKE $2 THEN 75
              ELSE 60
            END AS score
          FROM warehouses w
          WHERE
            LOWER(w.name) LIKE LOWER($2)
            OR COALESCE(w.code, '') LIKE $2
        `
        : '';

      const sql = `
        WITH results AS (
          -- Products
          SELECT
            p.id,
            p.name::text AS title,
            COALESCE(p.barcode, p.unit, '')::text AS subtitle,
            '/products'::text AS route,
            'product'::text AS kind,
            CASE
              WHEN LOWER(p.name) = LOWER($1) THEN 100
              WHEN COALESCE(p.barcode, '') = $1 THEN 95
              WHEN LOWER(p.name) LIKE LOWER($2) THEN 80
              WHEN COALESCE(p.barcode, '') LIKE $2 THEN 75
              ELSE 60
            END AS score
          FROM products p
          WHERE p.is_active = true
            AND (
              LOWER(p.name) LIKE LOWER($2)
              OR COALESCE(p.barcode, '') LIKE $2
              OR COALESCE(p.notes, '') LIKE $2
            )

          UNION ALL

          -- Customers
          SELECT
            c.id,
            c.name::text AS title,
            COALESCE(c.phone, c.address, '')::text AS subtitle,
            '/customers'::text AS route,
            'customer'::text AS kind,
            CASE
              WHEN LOWER(c.name) = LOWER($1) THEN 100
              WHEN LOWER(c.name) LIKE LOWER($2) THEN 80
              WHEN COALESCE(c.phone, '') LIKE $2 THEN 75
              ELSE 60
            END AS score
          FROM customers c
          WHERE
            LOWER(c.name) LIKE LOWER($2)
            OR COALESCE(c.phone, '') LIKE $2
            OR COALESCE(c.address, '') LIKE $2

          UNION ALL

          -- Suppliers
          SELECT
            s.id,
            s.name::text AS title,
            COALESCE(s.phone, s.address, '')::text AS subtitle,
            '/suppliers'::text AS route,
            'supplier'::text AS kind,
            CASE
              WHEN LOWER(s.name) = LOWER($1) THEN 100
              WHEN LOWER(s.name) LIKE LOWER($2) THEN 80
              WHEN COALESCE(s.phone, '') LIKE $2 THEN 75
              ELSE 60
            END AS score
          FROM suppliers s
          WHERE
            LOWER(s.name) LIKE LOWER($2)
            OR COALESCE(s.phone, '') LIKE $2
            OR COALESCE(s.address, '') LIKE $2

          ${warehouseUnion}

          UNION ALL

          -- Sales
          SELECT
            sa.id,
            COALESCE(sa.invoice_number, ('فاتورة #' || sa.id::text))::text AS title,
            COALESCE(c.name, sa.payment_method, '')::text AS subtitle,
            '/invoices'::text AS route,
            'sale'::text AS kind,
            CASE
              WHEN COALESCE(sa.invoice_number, '') = $1 THEN 100
              WHEN COALESCE(sa.invoice_number, '') LIKE $2 THEN 85
              WHEN COALESCE(c.name, '') LIKE $2 THEN 70
              ELSE 55
            END AS score
          FROM sales sa
          LEFT JOIN customers c ON c.id = sa.customer_id
          WHERE
            COALESCE(sa.invoice_number, '') LIKE $2
            OR COALESCE(c.name, '') LIKE $2

          UNION ALL

          -- Sales Returns
          SELECT
            sr.id,
            COALESCE(sr.return_number, ('مرتجع #' || sr.id::text))::text AS title,
            COALESCE(c.name, sr.return_method, '')::text AS subtitle,
            '/returns'::text AS route,
            'return'::text AS kind,
            CASE
              WHEN COALESCE(sr.return_number, '') = $1 THEN 100
              WHEN COALESCE(sr.return_number, '') LIKE $2 THEN 85
              WHEN COALESCE(c.name, '') LIKE $2 THEN 70
              ELSE 55
            END AS score
          FROM sales_returns sr
          LEFT JOIN sales sa ON sa.id = sr.sale_id
          LEFT JOIN customers c ON c.id = sa.customer_id
          WHERE
            COALESCE(sr.return_number, '') LIKE $2
            OR COALESCE(c.name, '') LIKE $2
        )
        SELECT *
        FROM results
        ORDER BY score DESC, id DESC
        LIMIT $3
      `;

      const result = await pool.query<SearchRow>(sql, [q, like, limit]);

      return {
        success: true,
        query: q,
        results: result.rows,
      };
    }
  );
}