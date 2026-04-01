import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CustomerOrdersService } from './customerOrders.service.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';

const publicOrderItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
});

const publicCreateOrderSchema = z.object({
  customer_name: z.string().min(2, 'اسم صاحب الطلب مطلوب').max(200),
  recipient_name: z.string().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  payment_method: z.enum(['cash_on_delivery', 'sham_cash']),
  currency_code: z.enum(['USD', 'SYP', 'TRY', 'SAR', 'AED']),
  items: z.array(publicOrderItemSchema).min(1, 'السلة فارغة'),
});

const updateOrderStatusSchema = z.object({
  status: z.enum(['new', 'reviewed', 'cancelled']),
  cancel_reason: z.string().max(1000).nullable().optional(),
});
const sendTelegramNoteSchema = z.object({
  message: z.string().trim().min(1, 'نص الرسالة مطلوب').max(100, 'الرسالة يجب ألا تتجاوز 100 حرف'),
});

export async function customerOrdersRoutes(fastify: FastifyInstance) {
  const svc = new CustomerOrdersService();

  // ── Public catalog for order page ───────────────────────────────────────
  fastify.get('/api/public/customer-orders/catalog', async () => {
    const result = await svc.getPublicCatalog();
    return { success: true, ...result };
  });

  // ── Public create order ─────────────────────────────────────────────────
  fastify.post('/api/public/customer-orders', async (request, reply) => {
    const input = publicCreateOrderSchema.parse(request.body);
    const order = await svc.createPublicOrder({
      customer_name: input.customer_name,
      recipient_name: input.recipient_name ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      payment_method: input.payment_method,
      currency_code: input.currency_code,
      items: input.items,
    });

    return reply.status(201).send({ success: true, order });
  });

  // ── Internal list orders ────────────────────────────────────────────────
  fastify.get(
    '/api/customer-orders',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request) => {
      const q = request.query as Record<string, string>;

      const result = await svc.listOrders({
        q: q.q || undefined,
        status: (q.status as 'new' | 'reviewed' | 'converted' | 'cancelled' | 'all') || 'all',
        source: (q.source as 'all' | 'web' | 'telegram') || 'all',
        page: q.page ? parseInt(q.page, 10) : 1,
        limit: q.limit ? parseInt(q.limit, 10) : 20,
      });

      return { success: true, ...result };
    }
  );

  // ── Internal get order details ──────────────────────────────────────────
  fastify.get(
    '/api/customer-orders/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const order = await svc.getOrderById(parseInt(id, 10));

      if (!order) {
        return reply.status(404).send({ success: false, message: 'الطلب غير موجود' });
      }

      return { success: true, order };
    }
  );
    fastify.post(
    '/api/customer-orders/:id/notify-delivered',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const actorUserId = Number((request.user as any)?.id ?? 0) || null;

      const order = await svc.notifyTelegramOrderDelivered(parseInt(id, 10), actorUserId);

      return { success: true, order };
    }
  );
    fastify.post(
    '/api/customer-orders/:id/send-telegram-note',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = sendTelegramNoteSchema.parse(request.body);
      const actorUserId = Number((request.user as any)?.id ?? 0) || null;

      const order = await svc.sendTelegramOrderNote(
        parseInt(id, 10),
        input.message,
        actorUserId
      );

      return { success: true, order };
    }
  );

  // ── Internal update order status ────────────────────────────────────────
  fastify.patch(
    '/api/customer-orders/:id/status',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const input = updateOrderStatusSchema.parse(request.body);

      const order = await svc.updateOrderStatus(parseInt(id, 10), {
        status: input.status,
        cancel_reason: input.cancel_reason ?? null,
      });

      return { success: true, order };
    }
  );
}