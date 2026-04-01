import type { FastifyInstance } from 'fastify';
import { getLicenseStatus } from './license.service.js';

export async function licenseRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/license/status',
    {
      onRequest: [fastify.authenticate],
    },
    async () => {
      const license = await getLicenseStatus();

      return {
        success: true,
        license,
      };
    }
  );
}