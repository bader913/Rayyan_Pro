import type { FastifyInstance } from 'fastify';
import { dbAll, dbRun } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import { auditLog } from '../../shared/utils/auditLog.js';
const HIDDEN_SETTINGS_IN_ALL = new Set(['gemini_api_key']);
export async function settingsRoutes(fastify: FastifyInstance) {
  // GET all settings — any authenticated user
  fastify.get(
    '/api/settings/all',
    { onRequest: [fastify.authenticate] },
    async () => {
      const rows = await dbAll<{ key: string; value: string; updated_at: string }>(`
        SELECT key, value, updated_at FROM settings ORDER BY key
      `);
      const obj = rows.reduce<Record<string, string>>((acc, r) => {
        if (HIDDEN_SETTINGS_IN_ALL.has(r.key)) {
          if (r.key === 'gemini_api_key') {
            acc.gemini_api_key_configured = String(r.value ?? '').trim() ? 'true' : 'false';
          }
          return acc;
        }

        acc[r.key] = r.value ?? '';
        return acc;
      }, {});

      if (!('gemini_api_key_configured' in obj)) {
        obj.gemini_api_key_configured = 'false';
      }
      return { success: true, settings: obj };
    }
  );

  // PUT /api/settings/:key — admin only
  fastify.put(
    '/api/settings/:key',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const { key }   = request.params as { key: string };
      const { value } = request.body   as { value: string };

      if (value === undefined || value === null) {
        return reply.status(400).send({ success: false, message: 'القيمة مطلوبة' });
      }

      // جلب القيمة القديمة
      const rows = await dbAll<{ value: string }>(`SELECT value FROM settings WHERE key = $1`, [key]);
      const oldValue = rows[0]?.value ?? null;

      await dbRun(
        `INSERT INTO settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE
           SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, String(value), request.user.id]
      );

      auditLog({
        userId:     request.user.id,
        action:     'update',
        entityType: 'setting',
        oldData:    { key, value: oldValue },
        newData:    { key, value: String(value) },
        ipAddress:  request.ip,
      }).catch(() => {});

      return { success: true, key, value: String(value) };
    }
  );

  // PUT /api/settings (bulk) — admin only
  fastify.put(
    '/api/settings',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request) => {
      const updates = request.body as Record<string, string>;
      const userId  = request.user.id;

      for (const [key, value] of Object.entries(updates)) {
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') continue;
        await dbRun(
          `INSERT INTO settings (key, value, updated_by, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (key) DO UPDATE
             SET value = $2, updated_by = $3, updated_at = NOW()`,
          [key, String(value), userId]
        );
      }

      auditLog({
        userId,
        action:     'bulk_update',
        entityType: 'setting',
        newData:    updates,
        ipAddress:  request.ip,
      }).catch(() => {});

      return { success: true };
    }
  );
}
