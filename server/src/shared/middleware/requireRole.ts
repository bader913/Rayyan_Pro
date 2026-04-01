import type { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Middleware للتحقق من صلاحية الدور.
 * يُستخدم بعد fastify.authenticate في onRequest.
 *
 * مثال:
 *   onRequest: [fastify.authenticate, requireRole(['admin', 'manager'])]
 */
export const requireRole = (allowedRoles: readonly string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    if (!user || !allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        success: false,
        message: 'غير مصرح لك بتنفيذ هذا الإجراء',
        required_roles: allowedRoles,
        your_role: user?.role ?? null,
      });
    }
  };
};

// اختصارات الأدوار الشائعة
export const ROLES = {
  ALL_AUTH:       ['admin', 'manager', 'cashier', 'warehouse'] as const,
  ADMIN_ONLY:     ['admin'] as const,
  ADMIN_MANAGER:  ['admin', 'manager'] as const,
  STOCK_TEAM:     ['admin', 'manager', 'warehouse'] as const,
  CASHIER_UP:     ['admin', 'manager', 'cashier'] as const,
} as const;
