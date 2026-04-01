import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbAll, dbGet, dbRun } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';

const categorySchema = z.object({
  name: z.string().min(2, 'اسم الفئة حرفان على الأقل').max(100),
  parent_id: z.number().int().positive().nullable().optional(),
});

export async function categoriesRoutes(fastify: FastifyInstance) {
  // GET /api/categories — متاح لجميع الأدوار
  fastify.get(
    '/api/categories',
    { onRequest: [fastify.authenticate] },
    async () => {
      const categories = await dbAll(
        `SELECT c.id, c.name, c.parent_id, p.name AS parent_name,
                COUNT(pr.id)::int AS products_count
         FROM categories c
         LEFT JOIN categories p ON p.id = c.parent_id
         LEFT JOIN products pr ON pr.category_id = c.id
         GROUP BY c.id, c.name, c.parent_id, p.name
         ORDER BY c.name ASC`
      );
      return { success: true, categories };
    }
  );

  // POST /api/categories
  fastify.post(
    '/api/categories',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const { name, parent_id } = categorySchema.parse(request.body);

      const existing = await dbGet('SELECT id FROM categories WHERE name = $1', [name]);
      if (existing) {
        return reply.status(409).send({ success: false, message: 'اسم الفئة موجود بالفعل' });
      }

      const result = await dbRun(
        'INSERT INTO categories (name, parent_id) VALUES ($1, $2) RETURNING id, name, parent_id',
        [name, parent_id ?? null]
      );

      return reply.status(201).send({ success: true, category: result.rows[0] });
    }
  );

  // PUT /api/categories/:id
  fastify.put(
    '/api/categories/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { name, parent_id } = categorySchema.parse(request.body);

      const existing = await dbGet('SELECT id FROM categories WHERE id = $1', [id]);
      if (!existing) {
        return reply.status(404).send({ success: false, message: 'الفئة غير موجودة' });
      }

      const dup = await dbGet(
        'SELECT id FROM categories WHERE name = $1 AND id != $2',
        [name, id]
      );
      if (dup) {
        return reply.status(409).send({ success: false, message: 'اسم الفئة مستخدم بالفعل' });
      }

      await dbRun(
        'UPDATE categories SET name = $1, parent_id = $2 WHERE id = $3',
        [name, parent_id ?? null, id]
      );

      const updated = await dbGet('SELECT id, name, parent_id FROM categories WHERE id = $1', [id]);
      return { success: true, category: updated };
    }
  );

  // DELETE /api/categories/:id — فقط إذا لا توجد منتجات مرتبطة
  fastify.delete(
    '/api/categories/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const count = await dbGet<{ cnt: string }>(
        'SELECT COUNT(*)::int AS cnt FROM products WHERE category_id = $1',
        [id]
      );

      if (count && parseInt(count.cnt) > 0) {
        return reply.status(409).send({
          success: false,
          message: `لا يمكن حذف الفئة — يوجد ${count.cnt} منتج مرتبط بها`,
        });
      }

      await dbRun('DELETE FROM categories WHERE id = $1', [id]);
      return { success: true, message: 'تم حذف الفئة' };
    }
  );
}
