import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SalesService } from './sales.service.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import { auditLog } from '../../shared/utils/auditLog.js';

const saleItemSchema = z.object({
  product_id:    z.number().int().positive(),
  quantity:      z.number().positive('الكمية يجب أن تكون أكبر من صفر'),
  unit_price:    z.number().min(0),
  price_type:    z.enum(['retail', 'wholesale', 'custom']).default('retail'),
  item_discount: z.number().min(0).default(0),
});

const createSaleSchema = z.object({
  shift_id:        z.number().int().positive().nullable().optional(),
  pos_terminal_id: z.number().int().positive().nullable().optional(),
  customer_id:     z.number().int().positive().nullable().optional(),
  warehouse_id:    z.number().int().positive().nullable().optional(),
  source_order_id: z.number().int().positive().nullable().optional(),
  sale_type:       z.enum(['retail', 'wholesale']).default('retail'),
  items:           z.array(saleItemSchema).min(1, 'السلة فارغة'),
  sale_discount:   z.number().min(0).default(0),
  payment_method:  z.enum(['cash', 'card', 'credit', 'mixed']),
   paid_amount:       z.number().min(0).default(0),
  use_customer_bonus: z.boolean().optional().default(false),
  notes:             z.string().max(500).optional(),
});

export async function salesRoutes(fastify: FastifyInstance) {
  const svc = new SalesService();

  // POST /api/sales — الإجراء الرئيسي لـ POS
  fastify.post(
    '/api/sales',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const input = createSaleSchema.parse(request.body);
      const sale = await svc.createSale(
        {
          shift_id:        input.shift_id ?? null,
          pos_terminal_id: input.pos_terminal_id ?? null,
          customer_id:     input.customer_id ?? null,
          warehouse_id:    input.warehouse_id ?? null,
          source_order_id: input.source_order_id ?? null,
          sale_type:       input.sale_type,
          items:           input.items,
          sale_discount:   input.sale_discount,
          payment_method:   input.payment_method,
          paid_amount:      input.paid_amount,
          use_customer_bonus: input.use_customer_bonus,
          notes:            input.notes,
        },
        request.user.id
      );
      auditLog({
        userId:     request.user.id,
        action:     'create',
        entityType: 'sale',
        entityId:   sale.id,
        newData:    { invoice_number: sale.invoice_number, total_amount: sale.total_amount, payment_method: sale.payment_method },
        ipAddress:  request.ip,
      }).catch(() => {});
      return reply.status(201).send({ success: true, sale });
    }
  );

  // GET /api/sales/search — بحث سريع بالفواتير (للكاشير+)
  fastify.get(
    '/api/sales/search',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const result = await svc.listSales({
        q:     q.q || undefined,
        limit: q.limit ? Math.min(parseInt(q.limit, 10), 20) : 10,
        page:  1,
      });
      return { success: true, sales: result.sales };
    }
  );

  // GET /api/sales — قائمة المبيعات
   fastify.get(
    '/api/sales',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const result = await svc.listSales({
        shift_id:    q.shift_id    ? parseInt(q.shift_id, 10)    : undefined,
        customer_id: q.customer_id ? parseInt(q.customer_id, 10) : undefined,
        warehouse_id: q.warehouse_id ? parseInt(q.warehouse_id, 10) : undefined,
        date_from:   q.date_from,
        date_to:     q.date_to,
        q:           q.q || undefined,
        page:        q.page  ? parseInt(q.page, 10)  : 1,
        limit:       q.limit ? parseInt(q.limit, 10) : 20,
      });
      return { success: true, ...result };
    }
  );

  // GET /api/sales/:id — فاتورة واحدة مع بنودها
  fastify.get(
    '/api/sales/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.CASHIER_UP)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const sale = await svc.getSaleById(parseInt(id, 10));
      if (!sale) return reply.status(404).send({ success: false, message: 'الفاتورة غير موجودة' });
      return { success: true, sale };
    }
  );
}
