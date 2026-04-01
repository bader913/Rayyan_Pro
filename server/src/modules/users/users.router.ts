import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { UsersService } from './users.service.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import { auditLog } from '../../shared/utils/auditLog.js';

const createUserSchema = z.object({
  username: z
    .string()
    .min(3, 'اسم المستخدم 3 أحرف على الأقل')
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, 'يُسمح بالحروف الإنجليزية والأرقام والشرطة السفلية فقط'),
  password: z.string().min(6, 'كلمة المرور 6 أحرف على الأقل'),
  full_name: z.string().min(2, 'الاسم الكامل مطلوب').max(100),
  role: z.enum(['admin', 'manager', 'cashier', 'warehouse']),
});

const updateUserSchema = z.object({
  full_name: z.string().min(2).max(100).optional(),
  role: z.enum(['admin', 'manager', 'cashier', 'warehouse']).optional(),
  avatar_url: z.string().url().nullable().optional(),
});

const changePasswordSchema = z.object({
  new_password: z.string().min(6, 'كلمة المرور 6 أحرف على الأقل'),
});

export async function usersRoutes(fastify: FastifyInstance) {
  const svc = new UsersService();

  // قائمة جميع المستخدمين
  fastify.get(
    '/api/users',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async () => {
      const users = await svc.listUsers();
      return { success: true, users };
    }
  );

  // مستخدم واحد بالـ ID
  fastify.get(
    '/api/users/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = await svc.getUserById(Number(id));
      if (!user) return reply.status(404).send({ success: false, message: 'المستخدم غير موجود' });
      return { success: true, user };
    }
  );

  // إنشاء مستخدم جديد
  fastify.post(
    '/api/users',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const data = createUserSchema.parse(request.body);
      const user = await svc.createUser(data);
      auditLog({
        userId:     request.user.id,
        action:     'create',
        entityType: 'user',
        entityId:   Number(user.id),
        newData:    { username: user.username, role: user.role, full_name: user.full_name },
        ipAddress:  request.ip,
      }).catch(() => {});
      return reply.status(201).send({ success: true, user });
    }
  );

  // تعديل بيانات مستخدم
  fastify.put(
    '/api/users/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const data = updateUserSchema.parse(request.body);
      const user = await svc.updateUser(Number(id), data);
      auditLog({
        userId:     request.user.id,
        action:     'update',
        entityType: 'user',
        entityId:   Number(id),
        newData:    data,
        ipAddress:  request.ip,
      }).catch(() => {});
      return { success: true, user };
    }
  );

  // تغيير كلمة المرور (يلغي جميع الجلسات)
  fastify.patch(
    '/api/users/:id/password',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const { new_password } = changePasswordSchema.parse(request.body);
      await svc.changePassword(Number(id), new_password);
      auditLog({
        userId:     request.user.id,
        action:     'change_password',
        entityType: 'user',
        entityId:   Number(id),
        ipAddress:  request.ip,
      }).catch(() => {});
      return { success: true, message: 'تم تغيير كلمة المرور وإلغاء جميع الجلسات' };
    }
  );

  // تفعيل/تعطيل مستخدم
  fastify.patch(
    '/api/users/:id/active',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const user = await svc.toggleActive(Number(id), request.user.id.toString());
      auditLog({
        userId:     request.user.id,
        action:     user.is_active ? 'activate' : 'deactivate',
        entityType: 'user',
        entityId:   Number(id),
        newData:    { is_active: user.is_active },
        ipAddress:  request.ip,
      }).catch(() => {});
      return { success: true, user };
    }
  );
}
