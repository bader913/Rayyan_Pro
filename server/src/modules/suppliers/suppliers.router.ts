import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbAll, dbGet, dbRun, withTransaction } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';

const supplierSchema = z.object({
  name:    z.string().min(2, 'اسم المورد حرفان على الأقل').max(200),
  phone:   z.string().max(30).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes:   z.string().max(1000).nullable().optional(),
});

export async function suppliersRoutes(fastify: FastifyInstance) {
  
    // GET /api/suppliers — بحث + ترتيب + إحصائيات
  fastify.get(
    '/api/suppliers',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const {
        q,
        sort = 'name_asc',
        limit = '50',
      } = request.query as Record<string, string>;

      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (q?.trim()) {
        conditions.push(`(s.name ILIKE $${idx} OR s.phone ILIKE $${idx})`);
        values.push(`%${q.trim()}%`);
        idx++;
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const lim = Math.min(parseInt(limit, 10) || 50, 100);

      let orderBy = 's.name ASC';

      switch (sort) {
        case 'name_desc':
          orderBy = 's.name DESC';
          break;

        case 'highest_balance':
          orderBy = `
            CASE WHEN COALESCE(s.balance, 0) > 0 THEN 0 ELSE 1 END,
            COALESCE(s.balance, 0) DESC,
            s.name ASC
          `;
          break;

        case 'highest_purchases':
          orderBy = `
            COALESCE(stats.total_purchases_amount, 0) DESC,
            COALESCE(stats.purchases_count, 0) DESC,
            s.name ASC
          `;
          break;

        case 'most_invoices':
          orderBy = `
            COALESCE(stats.purchases_count, 0) DESC,
            COALESCE(stats.total_purchases_amount, 0) DESC,
            s.name ASC
          `;
          break;

        case 'newest':
          orderBy = 's.created_at DESC, s.name ASC';
          break;

        case 'name_asc':
        default:
          orderBy = 's.name ASC';
          break;
      }

      const suppliers = await dbAll(
        `
        SELECT
          s.id,
          s.name,
          s.phone,
          s.address,
          s.balance,
          s.notes,
          s.created_at,
          COALESCE(stats.purchases_count, 0) AS purchases_count,
          COALESCE(stats.total_purchases_amount, 0) AS total_purchases_amount,
          stats.last_purchase_at
        FROM suppliers s
        LEFT JOIN (
          SELECT
            p.supplier_id,
            COUNT(*) AS purchases_count,
            COALESCE(SUM(p.total_amount), 0) AS total_purchases_amount,
            MAX(p.created_at) AS last_purchase_at
          FROM purchases p
          WHERE p.supplier_id IS NOT NULL
          GROUP BY p.supplier_id
        ) stats ON stats.supplier_id = s.id
        ${where}
        ORDER BY ${orderBy}
        LIMIT ${lim}
        `,
        values
      );

      return { success: true, suppliers };
    }
  );

  // GET /api/suppliers/:id
  fastify.get(
    '/api/suppliers/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const supplier = await dbGet(
        'SELECT id, name, phone, address, balance, notes, created_at FROM suppliers WHERE id = $1',
        [id]
      );
      if (!supplier) return reply.status(404).send({ success: false, message: 'المورد غير موجود' });
      return { success: true, supplier };
    }
  );

  // POST /api/suppliers
  fastify.post(
    '/api/suppliers',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const data = supplierSchema.parse(request.body);
      const result = await dbRun(
        `INSERT INTO suppliers (name, phone, address, notes, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, name, phone, address, balance, notes`,
        [data.name, data.phone ?? null, data.address ?? null, data.notes ?? null, request.user.id]
      );
      return reply.status(201).send({ success: true, supplier: result.rows[0] });
    }
  );

  // PUT /api/suppliers/:id
  fastify.put(
    '/api/suppliers/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = supplierSchema.parse(request.body);

      const existing = await dbGet('SELECT id FROM suppliers WHERE id = $1', [id]);
      if (!existing) return reply.status(404).send({ success: false, message: 'المورد غير موجود' });

      await dbRun(
        `UPDATE suppliers SET name=$1, phone=$2, address=$3, notes=$4, updated_at=NOW() WHERE id=$5`,
        [data.name, data.phone ?? null, data.address ?? null, data.notes ?? null, id]
      );

      const updated = await dbGet(
        'SELECT id, name, phone, address, balance, notes FROM suppliers WHERE id = $1', [id]
      );
      return { success: true, supplier: updated };
    }
  );

  // GET /api/suppliers/:id/account — رصيد وحركات الحساب
  fastify.get(
    '/api/suppliers/:id/account',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { page = '1', limit = '30' } = request.query as Record<string, string>;
      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

      const supplier = await dbGet(
        'SELECT id, name, phone, address, balance, notes FROM suppliers WHERE id = $1', [id]
      );
      if (!supplier) return reply.status(404).send({ success: false, message: 'المورد غير موجود' });

      const countRow = await dbGet<{ total: string }>(
        'SELECT COUNT(*) AS total FROM supplier_account_transactions WHERE supplier_id = $1', [id]
      );
      const total = parseInt(countRow?.total ?? '0');

      const transactions = await dbAll(
        `SELECT t.*, u.full_name AS created_by_name
         FROM supplier_account_transactions t
         LEFT JOIN users u ON u.id = t.created_by
         WHERE t.supplier_id = $1
         ORDER BY t.created_at DESC
         LIMIT $2 OFFSET $3`,
        [id, parseInt(limit), offset]
      );

      return { success: true, supplier, transactions, total, page: parseInt(page), limit: parseInt(limit) };
    }
  );

  // POST /api/suppliers/:id/payments — تسجيل دفعة للمورد
  const paymentSchema = z.object({
    amount:        z.number().positive('المبلغ يجب أن يكون موجباً'),
    currency_code: z.string().length(3).default('USD'),
    exchange_rate: z.number().positive().default(1),
    note:          z.string().max(500).optional(),
  });

  fastify.post(
    '/api/suppliers/:id/payments',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = paymentSchema.parse(request.body);
      const userId = request.user.id;

      const result = await withTransaction(async (client) => {
        const sup = await client.query(
          'SELECT id, balance FROM suppliers WHERE id = $1 FOR UPDATE', [id]
        );
        if (!sup.rows[0]) throw Object.assign(new Error('المورد غير موجود'), { statusCode: 404 });

        const currentBalance = parseFloat(sup.rows[0].balance);
        // exchange_rate = وحدات العملة مقابل 1 دولار (مثل: 1 USD = 100 SYP → rate=100)
        const amountUSD  = data.currency_code === 'USD'
          ? data.amount
          : data.amount / data.exchange_rate;
        // السماح بالدفع الزائد: رصيد سالب = بذمتنا للمورد
        const newBalance = currentBalance - amountUSD;

        await client.query(
          'UPDATE suppliers SET balance = $1, updated_at = NOW() WHERE id = $2',
          [newBalance, id]
        );

        await client.query(
          `INSERT INTO supplier_account_transactions
           (supplier_id, transaction_type, debit_amount, credit_amount, balance_after,
            currency_code, exchange_rate, amount_original, note, created_by)
           VALUES ($1,'payment',$2,0,$3,$4,$5,$6,$7,$8)`,
          [id, amountUSD, newBalance, data.currency_code, data.exchange_rate, data.amount,
           data.note ?? null, userId]
        );

        return { newBalance };
      });

      return reply.status(201).send({ success: true, message: 'تم تسجيل الدفعة', ...result });
    }
  );
}
