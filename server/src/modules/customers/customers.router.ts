import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbAll, dbGet, dbRun, withTransaction } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import {
  detectCustomerCreditLimitTransition,
  sendCustomerCreditLimitTelegramAlert,
} from '../notifications/customerCreditLimitAlerts.service.js';

const customerSchema = z.object({
  name:          z.string().min(2, 'اسم العميل حرفان على الأقل').max(200),
  phone:         z.string().max(30).nullable().optional(),
  address:       z.string().max(500).nullable().optional(),
  customer_type: z.enum(['retail', 'wholesale']).default('retail'),
  credit_limit:  z.number().min(0).default(0),
  notes:         z.string().max(1000).nullable().optional(),
});

export async function customersRoutes(fastify: FastifyInstance) {
  // GET /api/customers — بحث بالاسم أو الهاتف
    // GET /api/customers — بحث + فلترة + ترتيب
  fastify.get(
    '/api/customers',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const {
        q,
        type,
        sort = 'name_asc',
        limit = '30',
      } = request.query as Record<string, string>;

      const conditions: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (q?.trim()) {
        conditions.push(`(c.name ILIKE $${idx} OR c.phone ILIKE $${idx})`);
        values.push(`%${q.trim()}%`);
        idx++;
      }

      if (type) {
        conditions.push(`c.customer_type = $${idx++}`);
        values.push(type);
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const lim = Math.min(parseInt(limit, 10) || 30, 100);

      let orderBy = 'c.name ASC';

      switch (sort) {
        case 'name_desc':
          orderBy = 'c.name DESC';
          break;

        case 'highest_debt':
          orderBy = `
            CASE WHEN COALESCE(c.balance, 0) > 0 THEN 0 ELSE 1 END,
            COALESCE(c.balance, 0) DESC,
            c.name ASC
          `;
          break;

        case 'highest_purchases':
          orderBy = `
            COALESCE(stats.total_sales_amount, 0) DESC,
            COALESCE(stats.sales_count, 0) DESC,
            c.name ASC
          `;
          break;

        case 'most_invoices':
          orderBy = `
            COALESCE(stats.sales_count, 0) DESC,
            COALESCE(stats.total_sales_amount, 0) DESC,
            c.name ASC
          `;
          break;

        case 'newest':
          orderBy = 'c.created_at DESC, c.name ASC';
          break;

        case 'name_asc':
        default:
          orderBy = 'c.name ASC';
          break;
      }

      const customers = await dbAll(
        `
        SELECT
          c.id,
          c.name,
          c.phone,
          c.address,
          c.customer_type,
          c.credit_limit,
          c.balance,
          c.bonus_balance,
          c.total_bonus_earned,
          c.notes,
          c.created_at,
          COALESCE(stats.sales_count, 0) AS sales_count,
          COALESCE(stats.total_sales_amount, 0) AS total_sales_amount,
          stats.last_sale_at
        FROM customers c
        LEFT JOIN (
          SELECT
            s.customer_id,
            COUNT(*) AS sales_count,
            COALESCE(SUM(s.total_amount), 0) AS total_sales_amount,
            MAX(s.created_at) AS last_sale_at
          FROM sales s
          WHERE s.customer_id IS NOT NULL
          GROUP BY s.customer_id
        ) stats ON stats.customer_id = c.id
        ${where}
        ORDER BY ${orderBy}
        LIMIT ${lim}
        `,
        values
      );

      return { success: true, customers };
    }
  );

  // GET /api/customers/:id
  fastify.get(
    '/api/customers/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const customer = await dbGet(
        `SELECT id, name, phone, address, customer_type, credit_limit, balance,
                bonus_balance, total_bonus_earned, notes, created_at
         FROM customers WHERE id = $1`,
        [id]
      );
      if (!customer) return reply.status(404).send({ success: false, message: 'العميل غير موجود' });
      return { success: true, customer };
    }
  );

  // POST /api/customers — الكاشير يمكنه إنشاء عميل من POS
  fastify.post(
    '/api/customers',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const data = customerSchema.parse(request.body);
      const result = await dbRun(
        `INSERT INTO customers (name, phone, address, customer_type, credit_limit, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, name, phone, customer_type, credit_limit, balance, bonus_balance, total_bonus_earned`,
        [
          data.name, data.phone ?? null, data.address ?? null,
          data.customer_type, data.credit_limit, data.notes ?? null, request.user.id,
        ]
      );
      return reply.status(201).send({ success: true, customer: result.rows[0] });
    }
  );

  // PUT /api/customers/:id
  fastify.put(
    '/api/customers/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await dbGet('SELECT id FROM customers WHERE id = $1', [id]);
      if (!existing) return reply.status(404).send({ success: false, message: 'العميل غير موجود' });

      const data = customerSchema.parse(request.body);
      await dbRun(
        `UPDATE customers SET name=$1, phone=$2, address=$3, customer_type=$4,
         credit_limit=$5, notes=$6, updated_at=NOW() WHERE id=$7`,
        [data.name, data.phone ?? null, data.address ?? null, data.customer_type,
         data.credit_limit, data.notes ?? null, id]
      );

      const updated = await dbGet(
        'SELECT id, name, phone, customer_type, credit_limit, balance, bonus_balance, total_bonus_earned FROM customers WHERE id = $1', [id]
      );
      return { success: true, customer: updated };
    }
  );

  // GET /api/customers/:id/account — رصيد وحركات حساب العميل
  fastify.get(
    '/api/customers/:id/account',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { page = '1', limit = '30' } = request.query as Record<string, string>;
      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

      const customer = await dbGet(
        `SELECT id, name, phone, address, customer_type, credit_limit, balance,
                bonus_balance, total_bonus_earned, notes
         FROM customers WHERE id = $1`, [id]
      );
      if (!customer) return reply.status(404).send({ success: false, message: 'العميل غير موجود' });

      const countRow = await dbGet<{ total: string }>(
        'SELECT COUNT(*) AS total FROM customer_account_transactions WHERE customer_id = $1', [id]
      );
      const total = parseInt(countRow?.total ?? '0');

      const transactions = await dbAll(
  `SELECT
      t.*,
      u.full_name AS created_by_name,
      s.payment_method AS sale_payment_method
   FROM customer_account_transactions t
   LEFT JOIN users u ON u.id = t.created_by
   LEFT JOIN sales s
     ON t.reference_type = 'sale'
    AND t.reference_id = s.id
   WHERE t.customer_id = $1
   ORDER BY t.created_at DESC
   LIMIT $2 OFFSET $3`,
  [id, parseInt(limit), offset]
);

      return { success: true, customer, transactions, total, page: parseInt(page), limit: parseInt(limit) };
    }
  );

  // POST /api/customers/:id/payments — تسجيل دفعة من العميل
  const customerPaymentSchema = z.object({
    amount:        z.number().positive('المبلغ يجب أن يكون موجباً'),
    currency_code: z.string().length(3).default('USD'),
    exchange_rate: z.number().positive().default(1),
    note:          z.string().max(500).optional(),
  });

  fastify.post(
    '/api/customers/:id/payments',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = customerPaymentSchema.parse(request.body);
      const userId = request.user.id;

      const result = await withTransaction(async (client) => {
        const cust = await client.query<{
          id: string;
          name: string;
          balance: string;
          credit_limit: string;
        }>(
          'SELECT id, name, balance, credit_limit FROM customers WHERE id = $1 FOR UPDATE',
          [id]
        );
        if (!cust.rows[0]) throw Object.assign(new Error('العميل غير موجود'), { statusCode: 404 });

        const currentBalance = parseFloat(cust.rows[0].balance);
        // exchange_rate = وحدات العملة المختارة مقابل 1 دولار (مثل: 1 USD = 100 SYP → rate=100)
        const amountUSD  = data.currency_code === 'USD'
          ? data.amount
          : data.amount / data.exchange_rate;
        // السماح بالدفع الزائد: إذا دفع أكثر من الدين يُسجل رصيد دائن (سالب = بذمتنا)
        const newBalance = currentBalance - amountUSD;

        await client.query(
          'UPDATE customers SET balance = $1, updated_at = NOW() WHERE id = $2',
          [newBalance, id]
        );

        await client.query(
          `INSERT INTO customer_account_transactions
           (customer_id, transaction_type, debit_amount, credit_amount, balance_after,
            currency_code, exchange_rate, amount_original, note, created_by)
           VALUES ($1,'payment',0,$2,$3,$4,$5,$6,$7,$8)`,
          [id, amountUSD, newBalance, data.currency_code, data.exchange_rate, data.amount,
           data.note ?? null, userId]
        );

        const creditLimitEvent = await detectCustomerCreditLimitTransition(client, {
          customerId: Number(id),
          customerName: cust.rows[0].name || `العميل #${id}`,
          balanceBefore: currentBalance,
          balanceAfter: newBalance,
          creditLimit: parseFloat(cust.rows[0].credit_limit ?? '0'),
          userId,
        });

        return { newBalance, creditLimitEvent };
      });

      if (result.creditLimitEvent) {
        await sendCustomerCreditLimitTelegramAlert(result.creditLimitEvent);
      }

      return reply.status(201).send({ success: true, message: 'تم تسجيل الدفعة', ...result });
    }
  );
}
