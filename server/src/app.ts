import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { authRoutes } from './modules/auth/auth.router.js';
import { usersRoutes } from './modules/users/users.router.js';
import { categoriesRoutes } from './modules/categories/categories.router.js';
import { suppliersRoutes } from './modules/suppliers/suppliers.router.js';
import { productsRoutes } from './modules/products/products.router.js';
import { customersRoutes } from './modules/customers/customers.router.js';
import { terminalsRoutes } from './modules/terminals/terminals.router.js';
import { shiftsRoutes } from './modules/shifts/shifts.router.js';
import { salesRoutes } from './modules/sales/sales.router.js';
import { purchasesRoutes } from './modules/purchases/purchases.router.js';
import { salesReturnsRoutes } from './modules/salesReturns/salesReturns.router.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.router.js';
import { reportsRoutes } from './modules/reports/reports.router.js';
import { auditLogsRoutes } from './modules/auditLogs/auditLogs.router.js';
import { settingsRoutes } from './modules/settings/settings.router.js';
import { adminRoutes } from './modules/admin/admin.router.js';
import { expensesRoutes } from './modules/expenses/expenses.router.js';
import { globalSearchRoutes } from './modules/globalSearch/globalSearch.router.js';
import { notificationsRoutes } from './modules/notifications/notifications.router.js';
import { checkAndSendDailyTelegramReportIfDue } from './modules/notifications/dailyTelegramReport.service.js';
import { purchaseReturnsRoutes } from './modules/purchaseReturns/purchaseReturns.router.js';
import { warehousesRoutes } from './modules/warehouses/warehouses.router.js';
import { stockTransfersRoutes } from './modules/stockTransfers/stockTransfers.router.js';
import { pollTelegramStockTransferApprovals } from './modules/stockTransfers/stockTransfers.service.js';
import { assistantRoutes } from './modules/ai/assistant.router.js';
import { stockCountsRoutes } from './modules/stockCounts/stockCounts.router.js';
import { customerOrdersRoutes } from './modules/customerOrders/customerOrders.router.js';
import { startTelegramCustomerOrdersPoller } from './modules/customerOrders/customerOrders.telegramPoller.js';
import { licenseRoutes } from './modules/license/license.router.js';
import { getLicenseStatus } from './modules/license/license.service.js';
declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: number;
      username: string;
      full_name: string;
      role: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

import type { FastifyRequest, FastifyReply } from 'fastify';

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_PROD = process.env.NODE_ENV === 'production';

const CLIENT_DIR = IS_PROD
  ? join(process.cwd(), '..', 'client', 'dist')
  : join(__dirname, '../../client/dist');

  let dailyTelegramReportTimerStarted = false;
  let telegramStockTransferApprovalTimerStarted = false;

function startDailyTelegramReportTimer() {
  if (dailyTelegramReportTimerStarted) return;
  dailyTelegramReportTimerStarted = true;

  const runCheck = async () => {
    try {
      await checkAndSendDailyTelegramReportIfDue();
    } catch (error) {
      console.error('Daily Telegram report scheduler error:', error);
    }
  };

  // فحص أولي بعد الإقلاع بقليل
  setTimeout(() => {
    void runCheck();
  }, 15000);

  // ثم فحص دوري كل دقيقة
  setInterval(() => {
    void runCheck();
  }, 60 * 1000);
}

function startTelegramStockTransferApprovalTimer() {
  if (telegramStockTransferApprovalTimerStarted) return;
  telegramStockTransferApprovalTimerStarted = true;

  const runCheck = async () => {
    try {
      await pollTelegramStockTransferApprovals();
    } catch (error) {
      console.error('Telegram stock transfer approval poller error:', error);
    }
  };

  setTimeout(() => {
    void runCheck();
  }, 20000);

  setInterval(() => {
    void runCheck();
  }, 7000);
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'development' ? 'info' : 'warn',
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  await app.register(jwt, {
    secret: process.env.JWT_ACCESS_SECRET || 'fallback_secret_change_in_production',
  });

  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.status(401).send({
          success: false,
          message: 'غير مصرح. يرجى تسجيل الدخول أولاً.',
        });
      }
    }
  );

  app.setErrorHandler(errorHandler);
    const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  app.addHook('onRequest', async (request, reply) => {
    const method = String(request.method || '').toUpperCase();
    if (!WRITE_METHODS.has(method)) return;

    const pathOnly = String(request.raw.url || request.url || '').split('?')[0];

    if (
      pathOnly === '/health' ||
      pathOnly.startsWith('/api/auth/')
    ) {
      return;
    }

    const license = await getLicenseStatus();

    if (license.writable) return;

    return reply.status(402).send({
      success: false,
      code: 'LICENSE_READ_ONLY',
      message: license.message,
      license,
    });
  });

  app.get('/health', async () => ({
    success: true,
    app: 'Rayyan Pro',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  }));

  await app.register(authRoutes);
  await app.register(usersRoutes);
  await app.register(categoriesRoutes);
  await app.register(suppliersRoutes);
  await app.register(productsRoutes);
  await app.register(warehousesRoutes);
  await app.register(stockTransfersRoutes);
  await app.register(customersRoutes);
  await app.register(terminalsRoutes);
  await app.register(shiftsRoutes);
  await app.register(salesRoutes);
  await app.register(purchasesRoutes);
  await app.register(salesReturnsRoutes);
  await app.register(dashboardRoutes);
  await app.register(reportsRoutes);
  await app.register(auditLogsRoutes);
  await app.register(settingsRoutes);
  await app.register(adminRoutes);
  await app.register(expensesRoutes);
  await app.register(globalSearchRoutes);
  await app.register(notificationsRoutes);
  await app.register(purchaseReturnsRoutes);
  await app.register(assistantRoutes);
  await app.register(stockCountsRoutes);
  await app.register(customerOrdersRoutes);
  await app.register(licenseRoutes);

  console.log('IS_PROD:', IS_PROD);
  console.log('CLIENT_DIR:', CLIENT_DIR);
  console.log('CLIENT_DIR exists:', existsSync(CLIENT_DIR));

  if (IS_PROD && existsSync(CLIENT_DIR)) {
    await app.register(fastifyStatic, {
      root: CLIENT_DIR,
      prefix: '/',
    });

    app.get('/', async (_req, reply) => {
      return reply.sendFile('index.html');
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url && !req.raw.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }

      return reply.status(404).send({
        message: `Route ${req.method}:${req.raw.url} not found`,
        error: 'Not Found',
        statusCode: 404,
      });
    });
  }
  startDailyTelegramReportTimer();
  startTelegramStockTransferApprovalTimer();
  startTelegramCustomerOrdersPoller();

  return app;
}