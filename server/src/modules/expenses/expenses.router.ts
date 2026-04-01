import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import { auditLog } from '../../shared/utils/auditLog.js';

const createExpenseSchema = z.object({
  title:        z.string().min(1).max(200),
  category:     z.string().min(1).max(100).default('عام'),
  amount:       z.number().positive(),
  currency:     z.string().default('USD'),
  exchange_rate:z.number().positive().default(1),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:        z.string().max(500).optional(),
});

const updateExpenseSchema = createExpenseSchema.partial();

export async function expensesRoutes(fastify: FastifyInstance) {

  // GET /api/expenses
  fastify.get(
    '/api/expenses',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const from     = q.from     || new Date(new Date().setDate(1)).toISOString().split('T')[0];
      const to       = q.to       || new Date().toISOString().split('T')[0];
      const category = q.category || '';
      const limit    = Math.min(parseInt(q.limit || '200'), 500);
      const page     = Math.max(1, parseInt(q.page || '1'));
      const offset   = (page - 1) * limit;

      const conditions = [`e.expense_date BETWEEN $1 AND $2`];
      const params: unknown[] = [from, to];

      if (category) {
        params.push(category);
        conditions.push(`e.category = $${params.length}`);
      }

      const where = conditions.join(' AND ');

      const [rows, totalRow, summaryRows] = await Promise.all([
        dbAll(`
          SELECT e.*, u.full_name AS created_by_name
          FROM expenses e
          LEFT JOIN users u ON u.id = e.created_by
          WHERE ${where}
          ORDER BY e.expense_date DESC, e.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `, [...params, limit, offset]),
        dbGet<{ count: string; total_usd: string }>(`
          SELECT COUNT(*) AS count, COALESCE(SUM(amount_usd),0) AS total_usd
          FROM expenses e
          WHERE ${where}
        `, params),
        dbAll<{ category: string; total_usd: string; count: string }>(`
          SELECT category, COALESCE(SUM(amount_usd),0) AS total_usd, COUNT(*) AS count
          FROM expenses e
          WHERE ${where}
          GROUP BY category
          ORDER BY total_usd DESC
        `, params),
      ]);

      return {
        expenses:   rows,
        total:      parseInt(totalRow?.count ?? '0'),
        total_usd:  parseFloat(totalRow?.total_usd ?? '0'),
        by_category: summaryRows,
        page, limit,
      };
    },
  );

  // GET /api/expenses/categories
  fastify.get(
    '/api/expenses/categories',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async () => {
      const rows = await dbAll<{ category: string }>(
        `SELECT DISTINCT category FROM expenses ORDER BY category ASC`
      );
      return { categories: rows.map((r) => r.category) };
    },
  );

  // POST /api/expenses
  fastify.post(
    '/api/expenses',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const input  = createExpenseSchema.parse(request.body);
      const userId = (request.user as { id: number }).id;
      const amountUsd = input.amount / input.exchange_rate;

      const row = await dbGet(`
        INSERT INTO expenses (title, category, amount, currency, exchange_rate, amount_usd, expense_date, notes, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
      `, [input.title, input.category, input.amount, input.currency, input.exchange_rate,
          amountUsd, input.expense_date, input.notes ?? null, userId]);

      await auditLog({ action: 'CREATE', entityType: 'expense', entityId: (row as any).id, userId, newData: input });
      return reply.code(201).send({ expense: row });
    },
  );

  // PUT /api/expenses/:id
  fastify.put(
    '/api/expenses/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const { id }  = request.params as { id: string };
      const input   = updateExpenseSchema.parse(request.body);
      const userId  = (request.user as { id: number }).id;
      const existing = await dbGet(`SELECT * FROM expenses WHERE id=$1`, [id]);
      if (!existing) return reply.code(404).send({ error: 'المصروف غير موجود' });

      const merged = { ...(existing as any), ...input };
      const amountUsd = merged.amount / merged.exchange_rate;

      const row = await dbGet(`
        UPDATE expenses SET
          title=$1, category=$2, amount=$3, currency=$4, exchange_rate=$5,
          amount_usd=$6, expense_date=$7, notes=$8, updated_at=NOW()
        WHERE id=$9
        RETURNING *
      `, [merged.title, merged.category, merged.amount, merged.currency, merged.exchange_rate,
          amountUsd, merged.expense_date, merged.notes ?? null, id]);

      await auditLog({ action: 'UPDATE', entityType: 'expense', entityId: parseInt(id), userId, newData: input });
      return { expense: row };
    },
  );

  // DELETE /api/expenses/:id
  fastify.delete(
    '/api/expenses/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const { id }  = request.params as { id: string };
      const userId  = (request.user as { id: number }).id;
      const existing = await dbGet(`SELECT id FROM expenses WHERE id=$1`, [id]);
      if (!existing) return reply.code(404).send({ error: 'المصروف غير موجود' });

      await dbRun(`DELETE FROM expenses WHERE id=$1`, [id]);
      await auditLog({ action: 'DELETE', entityType: 'expense', entityId: parseInt(id), userId, newData: {} });
      return { success: true };
    },
  );
}
