import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ShiftsService } from './shifts.service.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';

const openShiftSchema = z.object({
  terminal_id:      z.number().int().positive().nullable().optional(),
  opening_balance:  z.number().min(0).default(0),
  opening_note:     z.string().max(500).optional(),
});

const closeShiftSchema = z.object({
  closing_cash_counted: z.number().min(0),
  closing_note:         z.string().max(500).optional(),
});

export async function shiftsRoutes(fastify: FastifyInstance) {
  const svc = new ShiftsService();

  // GET /api/shifts/current — الوردية المفتوحة للمستخدم الحالي
  fastify.get(
    '/api/shifts/current',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { terminal_id } = request.query as { terminal_id?: string };
      const shift = await svc.getCurrentShift(
        request.user.id,
        terminal_id ? parseInt(terminal_id, 10) : undefined
      );
      return { success: true, shift };
    }
  );

  // GET /api/shifts/:id/summary
  fastify.get(
    '/api/shifts/:id/summary',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        const summary = await svc.getShiftSummary(parseInt(id, 10));
        return { success: true, summary };
      } catch (e: unknown) {
        const err = e as { statusCode?: number; message?: string };
        return reply.status(err.statusCode ?? 500).send({ success: false, message: err.message });
      }
    }
  );

  // GET /api/shifts — list recent shifts (admin/manager)
  fastify.get(
    '/api/shifts',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request) => {
      const { pool } = await import('../../shared/db/pool.js');
      const { status, limit = '20' } = request.query as Record<string, string>;

      const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));

      const where = status ? `WHERE s.status = $1` : '';
      const values = status ? [status] : [];

      const shifts = await pool.query(
        `SELECT
           s.*,
           u.full_name AS cashier_name,
           t.name AS terminal_name,
           t.code AS terminal_code,
           COALESCE(ss.sales_count, 0)::bigint AS sales_count,
           COALESCE(ss.sales_total, 0)         AS sales_total,
           COALESCE(ss.cash_total, 0)          AS cash_total,
           COALESCE(ss.card_total, 0)          AS card_total,
           COALESCE(ss.credit_total, 0)        AS credit_total
         FROM shifts s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN pos_terminals t ON t.id = s.pos_terminal_id
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::bigint AS sales_count,
             COALESCE(SUM(sa.total_amount), 0) AS sales_total,
             COALESCE(SUM(CASE WHEN sa.payment_method = 'cash'   THEN sa.total_amount ELSE 0 END), 0) AS cash_total,
             COALESCE(SUM(CASE WHEN sa.payment_method = 'card'   THEN sa.total_amount ELSE 0 END), 0) AS card_total,
             COALESCE(SUM(CASE WHEN sa.payment_method = 'credit' THEN sa.total_amount ELSE 0 END), 0) AS credit_total
           FROM sales sa
           WHERE sa.shift_id = s.id
         ) ss ON TRUE
         ${where}
         ORDER BY s.opened_at DESC
         LIMIT ${safeLimit}`,
        values
      );

      return { success: true, shifts: shifts.rows };
    }
  );

  // POST /api/shifts/open
  fastify.post(
    '/api/shifts/open',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const data = openShiftSchema.parse(request.body);
      const shift = await svc.openShift({
        userId:         request.user.id,
        terminalId:     data.terminal_id ?? null,
        openingBalance: data.opening_balance,
        openingNote:    data.opening_note,
      });
      return reply.status(201).send({ success: true, shift });
    }
  );

  // POST /api/shifts/:id/close
  fastify.post(
    '/api/shifts/:id/close',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = closeShiftSchema.parse(request.body);
      const summary = await svc.closeShift(parseInt(id, 10), {
        closingCashCounted: data.closing_cash_counted,
        closingNote:        data.closing_note,
        userId:             request.user.id,
      });
      return { success: true, summary };
    }
  );
}
