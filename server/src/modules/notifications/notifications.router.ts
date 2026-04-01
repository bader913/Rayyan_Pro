import type { FastifyInstance } from 'fastify';
import { dbAll, dbRun } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import { auditLog } from '../../shared/utils/auditLog.js';
import { sendTodayTelegramReport } from './dailyTelegramReport.service.js';
import {
  maskTelegramToken,
  getTelegramMe,
  discoverTelegramPrivateChat,
  sendTelegramMessage,
} from './telegram.service.js';

type SettingsMap = Record<string, string>;

const TELEGRAM_SETTING_KEYS = [
  'telegram_enabled',
  'telegram_bot_token',
  'telegram_chat_id',
  'telegram_bot_username',
  'telegram_bot_name',
  'telegram_chat_name',
] as const;

async function getSettingsMap(keys: readonly string[]): Promise<SettingsMap> {
  if (!keys.length) return {};

  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await dbAll<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
    [...keys]
  );

  return rows.reduce<SettingsMap>((acc, row) => {
    acc[row.key] = row.value ?? '';
    return acc;
  }, {});
}

async function setSetting(key: string, value: string, userId: number) {
  await dbRun(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_by = $3, updated_at = NOW()`,
    [key, value, userId]
  );
}

function maskChatId(chatId: string | null | undefined) {
  const value = String(chatId || '').trim();
  if (!value) return '';

  if (value.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

export async function notificationsRoutes(fastify: FastifyInstance) {
  // حالة إعدادات تلغرام
  fastify.get(
    '/api/notifications/telegram/status',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async () => {
      const settings = await getSettingsMap(TELEGRAM_SETTING_KEYS);

      return {
        success: true,
        telegram: {
          enabled: settings.telegram_enabled === 'true',
          hasBotToken: Boolean(settings.telegram_bot_token),
          botTokenMasked: maskTelegramToken(settings.telegram_bot_token),
          hasChatId: Boolean(settings.telegram_chat_id),
          chatIdMasked: maskChatId(settings.telegram_chat_id),
          botUsername: settings.telegram_bot_username || '',
          botName: settings.telegram_bot_name || '',
          chatName: settings.telegram_chat_name || '',
          botLink: settings.telegram_bot_username
            ? `https://t.me/${settings.telegram_bot_username}`
            : null,
        },
      };
    }
  );

  // حفظ التوكن + التحقق منه
  fastify.post(
    '/api/notifications/telegram/connect',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const body = request.body as {
        botToken?: string;
        enabled?: boolean;
      };

      const botToken = String(body?.botToken || '').trim();
      const enabled = body?.enabled !== false;

      if (!botToken) {
        return reply.status(400).send({
          success: false,
          message: 'رمز بوت تلغرام مطلوب',
        });
      }

      try {
        const me = await getTelegramMe(botToken);

        await setSetting('telegram_bot_token', botToken, request.user.id);
        await setSetting('telegram_enabled', String(enabled), request.user.id);
        await setSetting('telegram_bot_username', String(me.username || ''), request.user.id);
        await setSetting('telegram_bot_name', String(me.first_name || ''), request.user.id);

        auditLog({
          userId: request.user.id,
          action: 'connect_telegram',
          entityType: 'setting',
          newData: {
            telegram_enabled: String(enabled),
            telegram_bot_username: String(me.username || ''),
            telegram_bot_name: String(me.first_name || ''),
          },
          ipAddress: request.ip,
        }).catch(() => {});

        return {
          success: true,
          message: 'تم حفظ إعدادات تلغرام بنجاح',
          telegram: {
            enabled,
            hasBotToken: true,
            botTokenMasked: maskTelegramToken(botToken),
            botUsername: me.username || '',
            botName: me.first_name || '',
            botLink: me.username ? `https://t.me/${me.username}` : null,
          },
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          message: error instanceof Error ? error.message : 'تعذر التحقق من بوت تلغرام',
        });
      }
    }
  );

  // اكتشاف آخر محادثة خاصة بعد ضغط Start داخل البوت
  fastify.post(
    '/api/notifications/telegram/discover-chat',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const settings = await getSettingsMap([
        'telegram_bot_token',
        'telegram_enabled',
      ]);

      const botToken = String(settings.telegram_bot_token || '').trim();

      if (!botToken) {
        return reply.status(400).send({
          success: false,
          message: 'احفظ رمز البوت أولاً',
        });
      }

      try {
        const chat = await discoverTelegramPrivateChat(botToken);

        if (!chat) {
          return reply.status(404).send({
            success: false,
            message: 'لم يتم العثور على محادثة خاصة. افتح البوت واضغط Start ثم أعد المحاولة.',
          });
        }

        await setSetting('telegram_chat_id', chat.chatId, request.user.id);
        await setSetting('telegram_chat_name', chat.displayName, request.user.id);

        auditLog({
          userId: request.user.id,
          action: 'discover_telegram_chat',
          entityType: 'setting',
          newData: {
            telegram_chat_id: chat.chatId,
            telegram_chat_name: chat.displayName,
          },
          ipAddress: request.ip,
        }).catch(() => {});

        return {
          success: true,
          message: 'تم اكتشاف حساب تلغرام بنجاح',
          telegram: {
            chatIdMasked: maskChatId(chat.chatId),
            chatName: chat.displayName,
            username: chat.username || '',
            lastMessage: chat.lastMessage || '',
          },
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          message: error instanceof Error ? error.message : 'تعذر اكتشاف المحادثة',
        });
      }
    }
  );


    // حفظ chat_id يدويًا
  fastify.post(
    '/api/notifications/telegram/save-chat',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const body = request.body as {
        chatId?: string;
        chatName?: string;
      };

      const chatId = String(body?.chatId || '').trim();
      const chatName = String(body?.chatName || '').trim();

      if (!chatId) {
        return reply.status(400).send({
          success: false,
          message: 'معرف المحادثة chat_id مطلوب',
        });
      }

      await setSetting('telegram_chat_id', chatId, request.user.id);
      await setSetting('telegram_chat_name', chatName, request.user.id);

      auditLog({
        userId: request.user.id,
        action: 'save_telegram_chat',
        entityType: 'setting',
        newData: {
          telegram_chat_id: chatId,
          telegram_chat_name: chatName,
        },
        ipAddress: request.ip,
      }).catch(() => {});

      return {
        success: true,
        message: 'تم حفظ معرف محادثة تلغرام بنجاح',
        telegram: {
          chatIdMasked: maskChatId(chatId),
          chatName,
        },
      };
    }
  );
    // إرسال تقرير اليوم الآن
  fastify.post(
    '/api/notifications/telegram/send-daily-report-now',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      try {
        const report = await sendTodayTelegramReport();

        auditLog({
          userId: request.user.id,
          action: 'send_daily_telegram_report',
          entityType: 'setting',
          newData: report.summary,
          ipAddress: request.ip,
        }).catch(() => {});

        return {
          success: true,
          message: 'تم إرسال تقرير اليوم إلى تلغرام بنجاح',
          summary: report.summary,
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          message: error instanceof Error ? error.message : 'فشل إرسال تقرير اليوم',
        });
      }
    }
  );
  // رسالة تجريبية
  fastify.post(
    '/api/notifications/telegram/test',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const body = request.body as {
        message?: string;
      };

      const settings = await getSettingsMap([
        'telegram_enabled',
        'telegram_bot_token',
        'telegram_chat_id',
      ]);

      const enabled = settings.telegram_enabled === 'true';
      const botToken = String(settings.telegram_bot_token || '').trim();
      const chatId = String(settings.telegram_chat_id || '').trim();

      if (!enabled) {
        return reply.status(400).send({
          success: false,
          message: 'تنبيهات تلغرام غير مفعلة',
        });
      }

      if (!botToken) {
        return reply.status(400).send({
          success: false,
          message: 'رمز بوت تلغرام غير محفوظ',
        });
      }

      if (!chatId) {
        return reply.status(400).send({
          success: false,
          message: 'لم يتم ربط حساب تلغرام بعد',
        });
      }

      const text =
        String(body?.message || '').trim() ||
        `✅ رسالة تجريبية من Rayyan Pro\n🕒 ${new Date().toLocaleString('en-GB')}`;

      try {
        const sent = await sendTelegramMessage(botToken, chatId, text);

        auditLog({
          userId: request.user.id,
          action: 'test_telegram_message',
          entityType: 'setting',
          newData: {
            telegram_chat_id: chatId,
            telegram_message_id: sent.message_id,
          },
          ipAddress: request.ip,
        }).catch(() => {});

        return {
          success: true,
          message: 'تم إرسال الرسالة التجريبية بنجاح',
          telegram: {
            chatIdMasked: maskChatId(chatId),
            messageId: sent.message_id,
          },
        };
      } catch (error) {
        return reply.status(400).send({
          success: false,
          message: error instanceof Error ? error.message : 'فشل إرسال الرسالة التجريبية',
        });
      }
    }
  );
}