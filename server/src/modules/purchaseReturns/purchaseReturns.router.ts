import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PurchaseReturnsService } from './purchaseReturns.service.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';

const returnItemSchema = z.object({
  purchase_item_id: z.number().int().positive().nullable().optional(),
  product_id: z.number().int().positive(),
  quantity: z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unit_price: z.number().min(0),
});

const createReturnSchema = z.object({
  purchase_id: z.number().int().positive('يجب تحديد فاتورة الشراء'),
  items: z.array(returnItemSchema).min(1, 'لا توجد بنود للإرجاع'),
  return_method: z.enum(['cash_refund', 'debt_discount', 'stock_only']),
  reason: z.string().max(500).optional(),
  notes: z.string().max(500).optional(),
});

export async function purchaseReturnsRoutes(fastify: FastifyInstance) {
  const svc = new PurchaseReturnsService();

  fastify.post(
    '/api/purchase-returns',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const input = createReturnSchema.parse(request.body);

      const result = await svc.createReturn(
        {
          purchase_id: input.purchase_id,
          items: input.items.map((i) => ({
            purchase_item_id: i.purchase_item_id ?? null,
            product_id: i.product_id,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })),
          return_method: input.return_method,
          reason: input.reason,
          notes: input.notes,
        },
        request.user.id
      );

      return reply.status(201).send({ success: true, ...result });
    }
  );

    fastify.get(
    '/api/purchase-returns',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const q = request.query as Record<string, string>;

      const result = await svc.listReturns({
        purchase_id: q.purchase_id ? parseInt(q.purchase_id, 10) : undefined,
        warehouse_id: q.warehouse_id ? parseInt(q.warehouse_id, 10) : undefined,
        date_from: q.date_from,
        date_to: q.date_to,
        page: q.page ? parseInt(q.page, 10) : 1,
        limit: q.limit ? parseInt(q.limit, 10) : 20,
      });

      return { success: true, ...result };
    }
  );

  fastify.get(
    '/api/purchase-returns/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ret = await svc.getReturnById(parseInt(id, 10));

      if (!ret) {
        return reply.status(404).send({
          success: false,
          message: 'مرتجع الشراء غير موجود',
        });
      }

      return { success: true, return: ret };
    }
  );

  fastify.get(
    '/api/purchases/:id/returns',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const purchaseId = parseInt(id, 10);

      const result = await svc.listReturns({
        purchase_id: purchaseId,
        page: 1,
        limit: 100,
      });

      const baseReturns = ((result as any).returns ?? []) as Array<{ id: number }>;

      const detailedReturns = await Promise.all(
        baseReturns.map(async (ret) => {
          try {
            return await svc.getReturnById(ret.id);
          } catch {
            return null;
          }
        })
      );

      return {
        success: true,
        returns: detailedReturns.filter(Boolean),
      };
    }
  );

  fastify.get(
    '/api/purchases/:id/for-return',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const purchase = await svc.getPurchaseForReturn(parseInt(id, 10));

      if (!purchase) {
        return reply.status(404).send({
          success: false,
          message: 'فاتورة الشراء غير موجودة',
        });
      }

      return { success: true, purchase };
    }
  );
}