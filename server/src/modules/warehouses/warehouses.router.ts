import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createWarehouse,
  getWarehouseById,
  listWarehouseProducts,
  listWarehouses,
  updateWarehouse,
} from './warehouses.service.js';
import { auditLog } from '../../shared/utils/auditLog.js';

const createWarehouseSchema = z.object({
  name: z.string().min(1, 'اسم المستودع مطلوب'),
  code: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

const updateWarehouseSchema = z.object({
  name: z.string().min(1, 'اسم المستودع مطلوب').optional(),
  code: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

function ensureWarehouseManagePermission(role?: string) {
  if (!role || !['admin', 'manager'].includes(role)) {
    throw Object.assign(new Error('غير مصرح لك بإدارة المستودعات'), { statusCode: 403 });
  }
}

export async function warehousesRoutes(fastify: FastifyInstance) {
  // GET /api/warehouses?active=true
  fastify.get(
    '/api/warehouses',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const query = request.query as { active?: string };
      const activeOnly = String(query.active ?? 'false') === 'true';

      const warehouses = await listWarehouses(activeOnly);

      return {
        success: true,
        warehouses,
      };
    }
  );

  // GET /api/warehouses/:id
  fastify.get(
    '/api/warehouses/:id',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { id } = request.params as { id: string };
      const warehouseId = Number(id);

      if (!warehouseId || Number.isNaN(warehouseId)) {
        throw Object.assign(new Error('معرف المستودع غير صالح'), { statusCode: 400 });
      }

      const warehouse = await getWarehouseById(warehouseId);

      return {
        success: true,
        warehouse,
      };
    }
  );

  // GET /api/warehouses/:id/products
  fastify.get(
    '/api/warehouses/:id/products',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { id } = request.params as { id: string };
      const warehouseId = Number(id);

      if (!warehouseId || Number.isNaN(warehouseId)) {
        throw Object.assign(new Error('معرف المستودع غير صالح'), { statusCode: 400 });
      }

      const warehouse = await getWarehouseById(warehouseId);
      const products = await listWarehouseProducts(warehouseId);

      return {
        success: true,
        warehouse,
        products,
      };
    }
  );

  // POST /api/warehouses
  fastify.post(
    '/api/warehouses',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      ensureWarehouseManagePermission(request.user?.role);

      const body = createWarehouseSchema.parse(request.body);
      const warehouse = await createWarehouse(body);

      auditLog({
        userId: request.user.id,
        action: 'create',
        entityType: 'warehouse',
        entityId: warehouse.id,
        newData: warehouse,
        ipAddress: request.ip,
      }).catch(() => {});

      return {
        success: true,
        warehouse,
      };
    }
  );

  // PUT /api/warehouses/:id
  fastify.put(
    '/api/warehouses/:id',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      ensureWarehouseManagePermission(request.user?.role);

      const { id } = request.params as { id: string };
      const warehouseId = Number(id);

      if (!warehouseId || Number.isNaN(warehouseId)) {
        throw Object.assign(new Error('معرف المستودع غير صالح'), { statusCode: 400 });
      }

      const body = updateWarehouseSchema.parse(request.body);
      const before = await getWarehouseById(warehouseId);
      const warehouse = await updateWarehouse(warehouseId, body);

      auditLog({
        userId: request.user.id,
        action: 'update',
        entityType: 'warehouse',
        entityId: warehouse.id,
        oldData: before,
        newData: warehouse,
        ipAddress: request.ip,
      }).catch(() => {});

      return {
        success: true,
        warehouse,
      };
    }
  );
}