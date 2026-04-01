import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SalesReturnsService } from './salesReturns.service.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';

const returnItemSchema = z.object({
  sale_item_id: z.number().int().positive().nullable().optional(),
  product_id:   z.number().int().positive(),
  quantity:     z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unit_price:   z.number().min(0),
});

const createReturnSchema = z.object({
  sale_id:       z.number().int().positive('يجب تحديد فاتورة البيع'),
  items:         z.array(returnItemSchema).min(1, 'لا توجد بنود للإرجاع'),
  return_method: z.enum(['cash_refund', 'debt_discount', 'stock_only']),
  reason:        z.string().max(500).optional(),
  notes:         z.string().max(500).optional(),
  shift_id:      z.number().int().positive().nullable().optional(),
});

export async function salesReturnsRoutes(fastify: FastifyInstance) {
  const svc = new SalesReturnsService();

  // POST /api/returns — إنشاء مرتجع
  fastify.post(
    '/api/returns',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const input = createReturnSchema.parse(request.body);
      const result = await svc.createReturn(
        {
          sale_id:       input.sale_id,
          items:         input.items.map((i) => ({
            sale_item_id: i.sale_item_id ?? null,
            product_id:   i.product_id,
            quantity:     i.quantity,
            unit_price:   i.unit_price,
          })),
          return_method: input.return_method,
          reason:        input.reason,
          notes:         input.notes,
          shift_id:      input.shift_id ?? null,
        },
        request.user.id
      );
      return reply.status(201).send({ success: true, ...result });
    }
  );

  // GET /api/returns — قائمة المرتجعات
    fastify.get(
    '/api/returns',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const result = await svc.listReturns({
        sale_id:   q.sale_id   ? parseInt(q.sale_id, 10) : undefined,
        warehouse_id: q.warehouse_id ? parseInt(q.warehouse_id, 10) : undefined,
        date_from: q.date_from,
        date_to:   q.date_to,
        page:      q.page  ? parseInt(q.page,  10) : 1,
        limit:     q.limit ? parseInt(q.limit, 10) : 20,
      });
      return { success: true, ...result };
    }
  );

  // GET /api/returns/:id — تفاصيل مرتجع
  fastify.get(
    '/api/returns/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ret = await svc.getReturnById(parseInt(id, 10));
      if (!ret) return reply.status(404).send({ success: false, message: 'المرتجع غير موجود' });
      return { success: true, return: ret };
    }
  );

    // GET /api/sales/:id/returns — مرتجعات فاتورة محددة مع البنود
  fastify.get(
    '/api/sales/:id/returns',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const saleId = parseInt(id, 10);

      const result = await svc.listReturns({
        sale_id: saleId,
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

  // GET /api/sales/:id/for-return — جلب فاتورة للإرجاع
  fastify.get(
    '/api/sales/:id/for-return',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const sale = await svc.getSaleForReturn(parseInt(id, 10));
      if (!sale) return reply.status(404).send({ success: false, message: 'الفاتورة غير موجودة' });
      return { success: true, sale };
    }
  );
}
