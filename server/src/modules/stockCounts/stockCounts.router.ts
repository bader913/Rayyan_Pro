import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createStockCountSession,
  getStockCountSessionById,
  listStockCountSessions,
  postStockCountSession,
  removeStockCountSessionItem,
  upsertStockCountSessionItem,
} from './stockCounts.service.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import { auditLog } from '../../shared/utils/auditLog.js';

const listSchema = z.object({
  status: z.enum(['draft', 'posted']).optional(),
});

const createSessionSchema = z.object({
  warehouse_id: z.number().int().positive().nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

const upsertItemSchema = z.object({
  product_id: z.number().int().positive(),
  counted_quantity: z.number().min(0, 'الكمية المعدودة يجب أن تكون صفرًا أو أكبر'),
});

export async function stockCountsRoutes(fastify: FastifyInstance) {
  // GET /api/stock-count-sessions
  fastify.get(
    '/api/stock-count-sessions',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const query = listSchema.parse(request.query ?? {});
      const sessions = await listStockCountSessions(query.status);
      return { success: true, sessions };
    }
  );

  // GET /api/stock-count-sessions/:id
  fastify.get(
    '/api/stock-count-sessions/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const sessionId = Number(id);

      if (!sessionId || Number.isNaN(sessionId)) {
        throw Object.assign(new Error('معرف جلسة الجرد غير صالح'), { statusCode: 400 });
      }

      const session = await getStockCountSessionById(sessionId);
      return { success: true, session };
    }
  );

  // POST /api/stock-count-sessions
  fastify.post(
    '/api/stock-count-sessions',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const body = createSessionSchema.parse(request.body);
      const session = await createStockCountSession(body, request.user.id);

      auditLog({
        userId: request.user.id,
        action: 'create',
        entityType: 'stock_count_session',
        entityId: session.id,
        newData: {
          session_number: session.session_number,
          warehouse_id: session.warehouse_id,
          warehouse_name: session.warehouse_name,
        },
        ipAddress: request.ip,
      }).catch(() => {});

      return reply.status(201).send({ success: true, session });
    }
  );

  // POST /api/stock-count-sessions/:id/items
  // upsert by product_id
  fastify.post(
    '/api/stock-count-sessions/:id/items',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const sessionId = Number(id);

      if (!sessionId || Number.isNaN(sessionId)) {
        throw Object.assign(new Error('معرف جلسة الجرد غير صالح'), { statusCode: 400 });
      }

      const body = upsertItemSchema.parse(request.body);
      const session = await upsertStockCountSessionItem(sessionId, body);

      return { success: true, session };
    }
  );

  // DELETE /api/stock-count-sessions/:id/items/:productId
  fastify.delete(
    '/api/stock-count-sessions/:id/items/:productId',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const { id, productId } = request.params as { id: string; productId: string };
      const sessionId = Number(id);
      const parsedProductId = Number(productId);

      if (!sessionId || Number.isNaN(sessionId)) {
        throw Object.assign(new Error('معرف جلسة الجرد غير صالح'), { statusCode: 400 });
      }

      if (!parsedProductId || Number.isNaN(parsedProductId)) {
        throw Object.assign(new Error('معرف المنتج غير صالح'), { statusCode: 400 });
      }

      const session = await removeStockCountSessionItem(sessionId, parsedProductId);

      return { success: true, session };
    }
  );

  // POST /api/stock-count-sessions/:id/post
  fastify.post(
    '/api/stock-count-sessions/:id/post',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const sessionId = Number(id);

      if (!sessionId || Number.isNaN(sessionId)) {
        throw Object.assign(new Error('معرف جلسة الجرد غير صالح'), { statusCode: 400 });
      }

      const session = await postStockCountSession(sessionId, request.user.id);

      auditLog({
        userId: request.user.id,
        action: 'post',
        entityType: 'stock_count_session',
        entityId: session.id,
        newData: {
          session_number: session.session_number,
          warehouse_id: session.warehouse_id,
          warehouse_name: session.warehouse_name,
          status: session.status,
          items_count: session.items_count,
          total_difference_quantity: session.total_difference_quantity,
        },
        ipAddress: request.ip,
      }).catch(() => {});

      return { success: true, session };
    }
  );
}