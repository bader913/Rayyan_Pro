import type { FastifyInstance } from 'fastify';
import { dbAll, dbGet } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';

export async function terminalsRoutes(fastify: FastifyInstance) {
  // GET /api/terminals — قائمة نقاط البيع النشطة
  fastify.get(
    '/api/terminals',
    { onRequest: [fastify.authenticate] },
    async () => {
      const terminals = await dbAll(
        `SELECT t.id, t.code, t.name, t.location, t.is_active,
                s.id AS active_shift_id, s.status AS shift_status,
                u.full_name AS shift_cashier
         FROM pos_terminals t
         LEFT JOIN shifts s ON s.pos_terminal_id = t.id AND s.status = 'open'
         LEFT JOIN users u ON u.id = s.user_id
         WHERE t.is_active = TRUE
         ORDER BY t.code ASC`
      );
      return { success: true, terminals };
    }
  );

  // GET /api/terminals/:id
  fastify.get(
    '/api/terminals/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const terminal = await dbGet(
        `SELECT t.*, s.id AS active_shift_id, s.status AS shift_status
         FROM pos_terminals t
         LEFT JOIN shifts s ON s.pos_terminal_id = t.id AND s.status = 'open'
         WHERE t.id = $1`,
        [id]
      );
      if (!terminal) return reply.status(404).send({ success: false, message: 'الجهاز غير موجود' });
      return { success: true, terminal };
    }
  );

  // POST /api/terminals — admin only
  fastify.post(
    '/api/terminals',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const { code, name, location } = request.body as Record<string, string>;
      if (!code || !name) {
        return reply.status(400).send({ success: false, message: 'code وname مطلوبان' });
      }
      const { pool } = await import('../../shared/db/pool.js');
      const result = await pool.query(
        'INSERT INTO pos_terminals (code, name, location) VALUES ($1,$2,$3) RETURNING *',
        [code, name, location ?? null]
      );
      return reply.status(201).send({ success: true, terminal: result.rows[0] });
    }
  );
}
