type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

type TelegramChat = {
  id: number;
  type: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: TelegramChat;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

function getApiBase(botToken: string) {
  return `https://api.telegram.org/bot${botToken}`;
}

function ensureToken(botToken: string) {
  const token = String(botToken || '').trim();
  if (!token) {
    throw new Error('رمز بوت تلغرام غير موجود');
  }
  return token;
}

async function telegramRequest<T>(
  botToken: string,
  method: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const token = ensureToken(botToken);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const url = `${getApiBase(token)}/${method}`;
    const response = await fetch(url, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });

    const json = (await response.json()) as TelegramApiResponse<T>;

    if (!response.ok || !json.ok || json.result === undefined) {
      throw new Error(json.description || 'فشل الاتصال مع Telegram');
    }

    return json.result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال مع Telegram');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function maskTelegramToken(botToken: string | null | undefined) {
  const token = String(botToken || '').trim();
  if (!token) return '';

  if (token.length <= 10) {
    return '**********';
  }

  return `${token.slice(0, 6)}********${token.slice(-4)}`;
}

export function buildTelegramBotLink(botToken: string | null | undefined) {
  const token = String(botToken || '').trim();

  if (!token.includes(':')) return null;

  const botId = token.split(':')[0]?.trim();
  if (!botId) return null;

  return `https://t.me/${botId}`;
}

export async function getTelegramMe(botToken: string) {
  return telegramRequest<{
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  }>(botToken, 'getMe');
}

export async function getTelegramUpdates(
  botToken: string,
  options?: { offset?: number; limit?: number }
) {
  const payload: Record<string, unknown> = {};

  if (options?.offset !== undefined) payload.offset = options.offset;
  if (options?.limit !== undefined) payload.limit = options.limit;

  return telegramRequest<TelegramUpdate[]>(
    botToken,
    'getUpdates',
    Object.keys(payload).length > 0 ? payload : undefined
  );
}

export async function discoverTelegramPrivateChat(botToken: string) {
  const updates = await getTelegramUpdates(botToken);

  const privateMessages = updates
    .filter((u) => u.message?.chat?.type === 'private')
    .map((u) => ({
      update_id: u.update_id,
      chat_id: u.message!.chat.id,
      chat_type: u.message!.chat.type,
      first_name: u.message!.chat.first_name || '',
      last_name: u.message!.chat.last_name || '',
      username: u.message!.chat.username || '',
      text: u.message!.text || '',
    }));

  if (privateMessages.length === 0) {
    return null;
  }

  const latest = privateMessages[privateMessages.length - 1];

  return {
    chatId: String(latest.chat_id),
    displayName:
      [latest.first_name, latest.last_name].filter(Boolean).join(' ').trim() ||
      latest.username ||
      `Chat ${latest.chat_id}`,
    username: latest.username || '',
    lastMessage: latest.text || '',
    updateId: latest.update_id,
  };
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  extra?: Record<string, unknown>
) {
  const safeChatId = String(chatId || '').trim();
  if (!safeChatId) {
    throw new Error('معرف محادثة تلغرام غير موجود');
  }

  const safeText = String(text || '').trim();
  if (!safeText) {
    throw new Error('نص الرسالة فارغ');
  }

  return telegramRequest<{
    message_id: number;
    date: number;
    chat: TelegramChat;
    text?: string;
  }>(botToken, 'sendMessage', {
    chat_id: safeChatId,
    text: safeText,
    ...(extra ?? {}),
  });
}
export async function answerTelegramCallbackQuery(
  botToken: string,
  callbackQueryId: string,
  text?: string,
  showAlert = false
) {
  const safeId = String(callbackQueryId || '').trim();
  if (!safeId) {
    throw new Error('معرف callback query غير موجود');
  }

  return telegramRequest<boolean>(botToken, 'answerCallbackQuery', {
    callback_query_id: safeId,
    text: text ? String(text).trim() : undefined,
    show_alert: showAlert,
  });
}