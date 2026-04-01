import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';

export function errorHandler(
  error: Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'بيانات الطلب غير صحيحة',
      errors: error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  const statusCode =
    'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  const message =
    statusCode < 500
      ? error.message
      : 'حدث خطأ داخلي في الخادم';

  if (statusCode >= 500) {
    request.log.error({ err: error }, 'Internal server error');
  }

  return reply.status(statusCode).send({
    success: false,
    message,
  });
}
