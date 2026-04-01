import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  approveStockTransfer,
  createStockTransfer,
  getStockTransferById,
  listStockTransfers,
} from './stockTransfers.service.js';
import { auditLog } from '../../shared/utils/auditLog.js';

const createStockTransferSchema = z.object({
  from_warehouse_id: z.number().int().positive(),
  to_warehouse_id: z.number().int().positive(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        product_id: z.number().int().positive(),
        quantity: z.number().positive(),
      })
    )
    .min(1, 'أضف منتجًا واحدًا على الأقل'),
});

function ensureStockTransferPermission(role?: string) {
  if (!role || !['admin', 'manager', 'warehouse'].includes(role)) {
    throw Object.assign(new Error('غير مصرح لك بإدارة تحويلات المخزون'), {
      statusCode: 403,
    });
  }
}

export async function stockTransfersRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/stock-transfers',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      ensureStockTransferPermission(request.user?.role);

      const query = request.query as { status?: string };
      const status = String(query.status ?? '').trim() || undefined;

      const transfers = await listStockTransfers(status);

      return {
        success: true,
        transfers,
      };
    }
  );

    fastify.patch(
    '/api/stock-transfers/:id/approve',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      ensureStockTransferPermission(request.user?.role);

      const { id } = request.params as { id: string };
      const transferId = Number(id);

      if (!transferId || Number.isNaN(transferId)) {
        throw Object.assign(new Error('معرف التحويل غير صالح'), { statusCode: 400 });
      }

      const transfer = await approveStockTransfer(transferId, request.user.id);

      auditLog({
        userId: request.user.id,
        action: 'approve',
        entityType: 'stock_transfer',
        entityId: transfer.id,
        newData: { status: transfer.status, approved_at: transfer.approved_at },
        ipAddress: request.ip,
      }).catch(() => {});

      return {
        success: true,
        transfer,
      };
    }
  );

  fastify.get(
    '/api/stock-transfers/:id',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      ensureStockTransferPermission(request.user?.role);

      const { id } = request.params as { id: string };
      const transferId = Number(id);

      if (!transferId || Number.isNaN(transferId)) {
        throw Object.assign(new Error('معرف التحويل غير صالح'), { statusCode: 400 });
      }

      const transfer = await getStockTransferById(transferId);

      return {
        success: true,
        transfer,
      };
    }
  );

  fastify.post(
    '/api/stock-transfers',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      ensureStockTransferPermission(request.user?.role);

      const body = createStockTransferSchema.parse(request.body);
      const transfer = await createStockTransfer(body, request.user.id);

      auditLog({
        userId: request.user.id,
        action: 'create',
        entityType: 'stock_transfer',
        entityId: transfer.id,
        newData: transfer,
        ipAddress: request.ip,
      }).catch(() => {});

      return reply.status(201).send({
        success: true,
        transfer,
      });
    }
  );
}