import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { auditLog } from '../../shared/utils/auditLog.js';

const loginSchema = z.object({
  username: z.string().min(1, 'اسم المستخدم مطلوب'),
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

export async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify);

  fastify.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await authService.login(body.username, body.password, request);
    auditLog({
      userId:     result.user?.id ?? null,
      action:     'login',
      entityType: 'auth',
      entityId:   result.user?.id ?? null,
      newData:    { username: body.username, role: result.user?.role },
      ipAddress:  request.ip,
      userAgent:  request.headers['user-agent'] as string,
    }).catch(() => {});
    return reply.send(result);
  });

  fastify.post('/api/auth/refresh', async (request, reply) => {
    const body = z.object({ refresh_token: z.string() }).parse(request.body);
    const result = await authService.refreshToken(body.refresh_token);
    return reply.send(result);
  });

  fastify.post(
    '/api/auth/logout',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const body = z.object({ refresh_token: z.string() }).parse(request.body);
      await authService.logout(body.refresh_token);
      auditLog({
        userId:     request.user.id,
        action:     'logout',
        entityType: 'auth',
        entityId:   request.user.id,
        ipAddress:  request.ip,
        userAgent:  request.headers['user-agent'] as string,
      }).catch(() => {});
      return reply.send({ success: true, message: 'تم تسجيل الخروج بنجاح' });
    }
  );

  fastify.get(
    '/api/auth/me',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      return reply.send({ success: true, user: request.user });
    }
  );
}
