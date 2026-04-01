import type { FastifyInstance } from 'fastify';
import { buildAssistantReply } from './assistant.service.js';

export async function assistantRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/ai-assistant/ping',
    { onRequest: [fastify.authenticate] },
    async () => {
      return {
        success: true,
        message: 'ai assistant router is alive',
      };
    }
  );

  fastify.post(
    '/api/ai-assistant/chat',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const body = request.body as { message?: string } | undefined;
        const message = String(body?.message || '').trim().slice(0, 1000);

        if (!message) {
          return reply.status(400).send({
            success: false,
            message: 'الرسالة مطلوبة',
          });
        }

        console.log('[AI Assistant] incoming message:', message);

        const result = await buildAssistantReply(message);

        console.log('[AI Assistant] reply mode:', result.mode, 'intent:', result.intent);

        return reply.send({
          success: true,
          reply: result,
        });
      } catch (error: any) {
        console.error('[AI Assistant] route error:', error);

        return reply.status(500).send({
          success: false,
          message: error?.message || 'حدث خطأ داخل مساعد الريان',
        });
      }
    }
  );
}