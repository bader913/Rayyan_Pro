import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PurchasesService } from './purchases.service.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import { auditLog } from '../../shared/utils/auditLog.js';

const purchaseItemSchema = z.object({
  product_id: z.number().int().positive(),
  quantity: z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unit_price: z.number().min(0),
});

const createPurchaseSchema = z.object({
  supplier_id: z.number().int().positive().nullable().optional(),
  warehouse_id: z.number().int().positive().nullable().optional(),
  items: z.array(purchaseItemSchema).min(1, 'لا توجد بنود'),
  paid_amount: z.number().min(0).default(0),
  purchase_currency: z.string().default('USD'),
  exchange_rate: z.number().positive().default(1),
  notes: z.string().max(500).optional(),
});

const addPaymentSchema = z.object({
  amount: z.number().positive('المبلغ يجب أن يكون أكبر من صفر'),
});

export async function purchasesRoutes(fastify: FastifyInstance) {
  const svc = new PurchasesService();

  // POST /api/purchases — إنشاء فاتورة شراء
  fastify.post(
    '/api/purchases',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const input = createPurchaseSchema.parse(request.body);
      const result = await svc.createPurchase(
        {
          supplier_id: input.supplier_id ?? null,
          warehouse_id: input.warehouse_id ?? null,
          items: input.items,
          paid_amount: input.paid_amount,
          purchase_currency: input.purchase_currency,
          exchange_rate: input.exchange_rate,
          notes: input.notes,
        },
        request.user.id
      );
      auditLog({
        userId: request.user.id,
        action: 'create',
        entityType: 'purchase',
        entityId: result.purchaseId ?? null,
        newData: { invoice_number: result.invoiceNumber, total_amount: result.totalAmount },
        ipAddress: request.ip,
      }).catch(() => { });
      return reply.status(201).send({ success: true, ...result });
    }
  );
  // GET /api/purchases — قائمة المشتريات
  fastify.get(
    '/api/purchases',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const result = await svc.listPurchases({
        supplier_id: q.supplier_id ? parseInt(q.supplier_id, 10) : undefined,
        warehouse_id: q.warehouse_id ? parseInt(q.warehouse_id, 10) : undefined,
        date_from: q.date_from,
        date_to: q.date_to,
        search: q.search,
        page: q.page ? parseInt(q.page, 10) : 1,
        limit: q.limit ? parseInt(q.limit, 10) : 20,
      });
      return { success: true, ...result };
    }
  );

  // GET /api/purchases/:id — تفاصيل فاتورة
  fastify.get(
    '/api/purchases/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const purchase = await svc.getPurchaseById(parseInt(id, 10));
      if (!purchase) return reply.status(404).send({ success: false, message: 'الفاتورة غير موجودة' });
      return { success: true, purchase };
    }
  );

  // POST /api/purchases/:id/payment — تسجيل دفعة
  fastify.post(
    '/api/purchases/:id/payment',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { amount } = addPaymentSchema.parse(request.body);
      await svc.addPayment(parseInt(id, 10), amount, request.user.id);
      return reply.status(200).send({ success: true, message: 'تم تسجيل الدفعة بنجاح' });
    }
  );
}
