import type { FastifyInstance } from 'fastify';
import { dbAll, dbGet } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';

export async function auditLogsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/audit-logs',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const limit  = Math.min(parseInt(q.limit  || '50'), 200);
      const page   = Math.max(1, parseInt(q.page || '1'));
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const params: unknown[]    = [];
      let idx = 1;

      if (q.user_id)     { conditions.push(`al.user_id = $${idx++}`);        params.push(q.user_id); }
      if (q.action)      { conditions.push(`al.action = $${idx++}`);         params.push(q.action); }
      if (q.entity_type) { conditions.push(`al.entity_type = $${idx++}`);    params.push(q.entity_type); }
      if (q.from)        { conditions.push(`al.created_at::date >= $${idx++}`); params.push(q.from); }
      if (q.to)          { conditions.push(`al.created_at::date <= $${idx++}`); params.push(q.to); }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [countRow, rows] = await Promise.all([
        dbGet<{ total: string }>(
          `SELECT COUNT(*) AS total FROM audit_logs al ${where}`, params
        ),
        dbAll(
          `SELECT al.id, al.action, al.entity_type, al.entity_id,
                  al.old_data, al.new_data, al.ip_address, al.created_at,
                  u.full_name AS user_name, u.username, u.role AS user_role
           FROM audit_logs al
           LEFT JOIN users u ON u.id = al.user_id
           ${where}
           ORDER BY al.created_at DESC
           LIMIT ${limit} OFFSET ${offset}`,
          params
        ),
      ]);

      return {
        success: true,
        data: rows,
        total: parseInt(countRow?.total ?? '0'),
        page, limit,
      };
    }
  );

  // قائمة الـ actions المميزة للـ filter dropdown
  fastify.get(
    '/api/audit-logs/meta',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async () => {
      const [actions, entityTypes] = await Promise.all([
        dbAll<{ action: string }>(`SELECT DISTINCT action FROM audit_logs ORDER BY action`),
        dbAll<{ entity_type: string }>(`SELECT DISTINCT entity_type FROM audit_logs ORDER BY entity_type`),
      ]);
      return {
        success: true,
        actions:     actions.map((r) => r.action),
        entityTypes: entityTypes.map((r) => r.entity_type),
      };
    }
  );
}
