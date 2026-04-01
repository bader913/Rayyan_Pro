import { pool } from '../../shared/db/pool.js';
import { CustomerOrdersService } from './customerOrders.service.js';

type TelegramUpdate = {
    update_id: number;
    message?: {
        message_id: number;
        text?: string;
        chat: {
            id: number | string;
            type: string;
        };
        from?: {
            id: number | string;
            username?: string;
            first_name?: string;
            last_name?: string;
        };
    };
    callback_query?: {
        id: string;
        data?: string;
        from?: {
            id: number | string;
            username?: string;
            first_name?: string;
            last_name?: string;
        };
        message?: {
            message_id: number;
            chat: {
                id: number | string;
                type: string;
            };
        };
    };
};

type ParsedTelegramOrder = {
    customer_name: string;
    recipient_name: string | null;
    phone: string | null;
    notes: string | null;
    payment_method: 'cash_on_delivery' | 'sham_cash';
    currency_code: 'USD' | 'SYP' | 'TRY' | 'SAR' | 'AED';
    items: Array<{
        product_name: string;
        quantity: number;
    }>;
};

type TelegramOrderSession = {
    id: number;
    chat_id: string;
    telegram_user_id: string | null;
    telegram_username: string | null;
    telegram_full_name: string | null;
    step: string;
    draft_json: Record<string, unknown>;
    last_message_text: string | null;
    last_update_id: number | null;
    status: string;
};

type TelegramApiResponse<T> = {
    ok?: boolean;
    result?: T;
    description?: string;
};

type TelegramCartItem = {
    product_id: number;
    product_name: string;
    quantity: number;
};

let telegramOrdersPollerStarted = false;
const svc = new CustomerOrdersService();

async function getSettingsMap() {
    const res = await pool.query<{ key: string; value: string }>(
        `
    SELECT key, value
    FROM settings
    WHERE key IN (
      'telegram_bot_token',
      'customer_orders_enabled',
      'customer_orders_telegram_enabled',
      'customer_orders_telegram_last_update_id'
    )
    `
    );

    return Object.fromEntries(res.rows.map((row) => [row.key, row.value ?? '']));
}

async function saveLastUpdateId(updateId: number) {
    await pool.query(
        `
    INSERT INTO settings (key, value, updated_at)
    VALUES ('customer_orders_telegram_last_update_id', $1, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = $1, updated_at = NOW()
    `,
        [String(updateId)]
    );
}

async function telegramApi<T>(
    token: string,
    method: string,
    body?: Record<string, unknown>
): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });

    const raw: unknown = await res.json().catch(() => null);

    const data: TelegramApiResponse<T> | null =
        raw && typeof raw === 'object'
            ? (raw as TelegramApiResponse<T>)
            : null;

    if (!res.ok || !data?.ok) {
        throw new Error(data?.description || `Telegram API error on ${method}`);
    }

    if (data.result === undefined) {
        throw new Error(`Telegram API returned no result for ${method}`);
    }

    return data.result;
}

async function sendTelegramMessage(
    token: string,
    chatId: number | string,
    text: string,
    replyMarkup?: Record<string, unknown>
) {
    await telegramApi(token, 'sendMessage', {
        chat_id: chatId,
        text,
        reply_markup: replyMarkup,
    });
}

async function editTelegramMessage(
    token: string,
    chatId: number | string,
    messageId: number,
    text: string,
    replyMarkup?: Record<string, unknown>
) {
    try {
        await telegramApi(token, 'editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text,
            reply_markup: replyMarkup,
        });
    } catch {
        await sendTelegramMessage(token, chatId, text, replyMarkup);
    }
}

async function answerCallbackQuery(
    token: string,
    callbackQueryId: string,
    text?: string
) {
    try {
        await telegramApi(token, 'answerCallbackQuery', {
            callback_query_id: callbackQueryId,
            text: text || undefined,
        });
    } catch {
        // ignore
    }
}

function parseTelegramOrderMessage(text: string): ParsedTelegramOrder | null {
    const raw = String(text || '').replace(/\r/g, '').trim();
    if (!raw.startsWith('#RAYYAN_ORDER')) return null;

    const lines = raw.split('\n');
    const values = new Map<string, string>();
    const items: Array<{ product_name: string; quantity: number }> = [];

    let inItems = false;

    for (const line of lines.slice(1)) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed === 'ITEMS:') {
            inItems = true;
            continue;
        }

        if (inItems) {
            if (
                trimmed.startsWith('NOTES:') ||
                trimmed.startsWith('TOTAL_DISPLAY:') ||
                trimmed.startsWith('CUSTOMER_NAME:') ||
                trimmed.startsWith('RECIPIENT_NAME:') ||
                trimmed.startsWith('PHONE:') ||
                trimmed.startsWith('PAYMENT_METHOD:') ||
                trimmed.startsWith('CURRENCY_CODE:') ||
                trimmed.startsWith('WAREHOUSE_NAME:')
            ) {
                inItems = false;
            } else {
                const [namePart, qtyPart] = trimmed.split('||').map((v) => String(v || '').trim());
                const quantity = Number(qtyPart || 0);

                if (namePart && Number.isFinite(quantity) && quantity > 0) {
                    items.push({
                        product_name: namePart,
                        quantity,
                    });
                }

                continue;
            }
        }

        const idx = trimmed.indexOf(':');
        if (idx <= 0) continue;

        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        values.set(key, value);
    }

    const payment_method =
        values.get('PAYMENT_METHOD') === 'sham_cash' ? 'sham_cash' : 'cash_on_delivery';

    const currencyRaw = String(values.get('CURRENCY_CODE') || 'USD').trim().toUpperCase();
    const currency_code =
        currencyRaw === 'SYP' || currencyRaw === 'TRY' || currencyRaw === 'SAR' || currencyRaw === 'AED'
            ? currencyRaw
            : 'USD';

    const customer_name = String(values.get('CUSTOMER_NAME') || '').trim();

    if (!customer_name || items.length === 0) {
        return null;
    }

    return {
        customer_name,
        recipient_name: String(values.get('RECIPIENT_NAME') || '').trim() || null,
        phone: String(values.get('PHONE') || '').trim() || null,
        notes: String(values.get('NOTES') || '').trim() || null,
        payment_method,
        currency_code,
        items,
    };
}

async function getTelegramSession(chatId: string) {
    const res = await pool.query<{
        id: number;
        chat_id: string;
        telegram_user_id: string | null;
        telegram_username: string | null;
        telegram_full_name: string | null;
        step: string;
        draft_json: Record<string, unknown> | null;
        last_message_text: string | null;
        last_update_id: string | null;
        status: string;
    }>(
        `
    SELECT
      id,
      chat_id,
      telegram_user_id,
      telegram_username,
      telegram_full_name,
      step,
      draft_json,
      last_message_text,
      last_update_id,
      status
    FROM telegram_customer_order_sessions
    WHERE chat_id = $1
    LIMIT 1
    `,
        [chatId]
    );

    const row = res.rows[0];
    if (!row) return null;

    return {
        id: row.id,
        chat_id: row.chat_id,
        telegram_user_id: row.telegram_user_id,
        telegram_username: row.telegram_username,
        telegram_full_name: row.telegram_full_name,
        step: row.step,
        draft_json:
            row.draft_json && typeof row.draft_json === 'object' ? row.draft_json : {},
        last_message_text: row.last_message_text,
        last_update_id: row.last_update_id ? Number(row.last_update_id) : null,
        status: row.status,
    } as TelegramOrderSession;
}

async function upsertTelegramSession(params: {
    chat_id: string;
    telegram_user_id?: string | null;
    telegram_username?: string | null;
    telegram_full_name?: string | null;
    step: string;
    draft_json?: Record<string, unknown>;
    last_message_text?: string | null;
    last_update_id?: number | null;
    status?: string;
}) {
    await pool.query(
        `
    INSERT INTO telegram_customer_order_sessions (
      chat_id,
      telegram_user_id,
      telegram_username,
      telegram_full_name,
      step,
      draft_json,
      last_message_text,
      last_update_id,
      status,
      updated_at
    )
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,NOW())
    ON CONFLICT (chat_id)
    DO UPDATE SET
      telegram_user_id = EXCLUDED.telegram_user_id,
      telegram_username = EXCLUDED.telegram_username,
      telegram_full_name = EXCLUDED.telegram_full_name,
      step = EXCLUDED.step,
      draft_json = EXCLUDED.draft_json,
      last_message_text = EXCLUDED.last_message_text,
      last_update_id = EXCLUDED.last_update_id,
      status = EXCLUDED.status,
      updated_at = NOW()
    `,
        [
            params.chat_id,
            params.telegram_user_id ?? null,
            params.telegram_username ?? null,
            params.telegram_full_name ?? null,
            params.step,
            JSON.stringify(params.draft_json ?? {}),
            params.last_message_text ?? null,
            params.last_update_id ?? null,
            params.status ?? 'active',
        ]
    );
}

async function resetTelegramSession(params: {
    chat_id: string;
    telegram_user_id?: string | null;
    telegram_username?: string | null;
    telegram_full_name?: string | null;
    last_message_text?: string | null;
    last_update_id?: number | null;
}) {
    await upsertTelegramSession({
        chat_id: params.chat_id,
        telegram_user_id: params.telegram_user_id ?? null,
        telegram_username: params.telegram_username ?? null,
        telegram_full_name: params.telegram_full_name ?? null,
        step: 'awaiting_customer_name',
        draft_json: {},
        last_message_text: params.last_message_text ?? null,
        last_update_id: params.last_update_id ?? null,
        status: 'active',
    });
}

function getDraftCart(draft: Record<string, unknown>): TelegramCartItem[] {
    const raw = draft.cart;
    if (!Array.isArray(raw)) return [];

    return raw
        .map((item) => {
            if (!item || typeof item !== 'object') return null;

            const row = item as Record<string, unknown>;
            const product_id = Number(row.product_id || 0);
            const product_name = String(row.product_name || '').trim();
            const quantity = Number(row.quantity || 0);

            if (!product_id || !product_name || !Number.isFinite(quantity) || quantity <= 0) {
                return null;
            }

            return {
                product_id,
                product_name,
                quantity,
            } satisfies TelegramCartItem;
        })
        .filter(Boolean) as TelegramCartItem[];
}

function setDraftCart(
    draft: Record<string, unknown>,
    cart: TelegramCartItem[]
): Record<string, unknown> {
    return {
        ...draft,
        cart,
    };
}

function getCartCount(cart: TelegramCartItem[]) {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
}
function makeInlineKeyboard(
  rows: Array<Array<{ text: unknown; callback_data: unknown }>>
) {
  return {
    inline_keyboard: rows
      .map((row) =>
        Array.isArray(row)
          ? row
              .filter(
                (button) =>
                  button &&
                  typeof button === 'object' &&
                  typeof button.text === 'string' &&
                  button.text.trim().length > 0 &&
                  typeof button.callback_data === 'string' &&
                  button.callback_data.trim().length > 0
              )
              .map((button) => ({
                text: String(button.text),
                callback_data: String(button.callback_data),
              }))
          : []
      )
      .filter((row) => row.length > 0),
  };
}
function buildCategoriesKeyboard(params: {
  items: Array<{ id: number; name: string; products_count: number }>;
  page: number;
  pages: number;
}) {
  const rows: Array<Array<{ text: unknown; callback_data: unknown }>> = [];

  for (const category of params.items) {
    rows.push([
      {
        text: `${String(category.name || '').trim()} (${Number(category.products_count || 0)})`,
        callback_data: `ord:cat:${Number(category.id || 0)}:1`,
      },
    ]);
  }

  const navRow: Array<{ text: unknown; callback_data: unknown }> = [];

  if (params.page > 1) {
    navRow.push({
      text: 'السابق',
      callback_data: `ord:categories:page:${params.page - 1}`,
    });
  }

  if (params.page < params.pages) {
    navRow.push({
      text: 'التالي',
      callback_data: `ord:categories:page:${params.page + 1}`,
    });
  }

  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([
    {
      text: 'عرض السلة',
      callback_data: 'ord:cart:view',
    },
  ]);

  rows.push([
    {
      text: 'إلغاء الطلب',
      callback_data: 'ord:cancel',
    },
  ]);

  return makeInlineKeyboard(rows);
}

function buildProductsKeyboard(params: {
  categoryId: number;
  page: number;
  pages: number;
  items: Array<{
    id: number;
    name: string;
    retail_price: string;
  }>;
}) {
  const rows: Array<Array<{ text: unknown; callback_data: unknown }>> = [];

  for (const item of params.items) {
    rows.push([
      {
        text: `${String(item.name || '').trim()} — ${Number(item.retail_price || 0).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} $`,
        callback_data: `ord:add:${params.categoryId}:${params.page}:${Number(item.id || 0)}`,
      },
    ]);
  }

  const navRow: Array<{ text: unknown; callback_data: unknown }> = [];

  if (params.page > 1) {
    navRow.push({
      text: 'السابق',
      callback_data: `ord:cat:${params.categoryId}:${params.page - 1}`,
    });
  }

  if (params.page < params.pages) {
    navRow.push({
      text: 'التالي',
      callback_data: `ord:cat:${params.categoryId}:${params.page + 1}`,
    });
  }

  if (navRow.length > 0) {
    rows.push(navRow);
  }

  rows.push([
    { text: 'التصنيفات', callback_data: 'ord:categories:list' },
    { text: 'عرض السلة', callback_data: 'ord:cart:view' },
  ]);

  rows.push([{ text: 'إلغاء الطلب', callback_data: 'ord:cancel' }]);

  return makeInlineKeyboard(rows);
}

function buildCartKeyboard(cartEmpty: boolean) {
  const rows: Array<Array<{ text: unknown; callback_data: unknown }>> = [];

  if (!cartEmpty) {
    rows.push([{ text: 'تأكيد الطلب', callback_data: 'ord:cart:checkout' }]);
    rows.push([{ text: 'تفريغ السلة', callback_data: 'ord:cart:clear' }]);
  }

  rows.push([{ text: 'التصنيفات', callback_data: 'ord:categories:list' }]);
  rows.push([{ text: 'إلغاء الطلب', callback_data: 'ord:cancel' }]);

  return makeInlineKeyboard(rows);
}

async function showCategories(
    token: string,
    chatId: string,
    messageId?: number,
    page = 1
) {
    const allCategories = await svc.getTelegramOrderCategories();
    const pageSize = 8;
    const pages = Math.max(1, Math.ceil(allCategories.length / pageSize));
    const safePage = Math.min(Math.max(1, page), pages);
    const start = (safePage - 1) * pageSize;
    const items = allCategories.slice(start, start + pageSize);

    const text =
        allCategories.length > 0
            ? `اختر التصنيف الذي تريد التسوق منه:\nصفحة ${safePage} من ${pages}`
            : 'لا توجد تصنيفات متاحة حاليًا للطلب.';

    const replyMarkup =
        allCategories.length > 0
            ? buildCategoriesKeyboard({
                items,
                page: safePage,
                pages,
            })
            : buildCartKeyboard(true);

    if (messageId) {
        await editTelegramMessage(token, chatId, messageId, text, replyMarkup);
    } else {
        await sendTelegramMessage(token, chatId, text, replyMarkup);
    }
}

async function showProductsByCategory(
    token: string,
    chatId: string,
    categoryId: number,
    page: number,
    cartCount: number,
    messageId?: number
) {
    const result = await svc.getTelegramOrderProductsByCategory({
        category_id: categoryId,
        page,
        limit: 8,
    });

    const text =
        result.items.length > 0
            ? `اختر المنتج المطلوب.\nعدد القطع في السلة الآن: ${cartCount}`
            : 'لا توجد منتجات متاحة في هذا التصنيف حاليًا.';

    const replyMarkup =
        result.items.length > 0
            ? buildProductsKeyboard({
                categoryId,
                page: result.pagination.page,
                pages: result.pagination.pages,
                items: result.items,
            })
            : buildCartKeyboard(cartCount === 0);

    if (messageId) {
        await editTelegramMessage(token, chatId, messageId, text, replyMarkup);
    } else {
        await sendTelegramMessage(token, chatId, text, replyMarkup);
    }
}

async function showCart(
    token: string,
    chatId: string,
    draft: Record<string, unknown>,
    messageId?: number
) {
    const cart = getDraftCart(draft);

    const text =
        cart.length === 0
            ? 'السلة فارغة حاليًا.'
            : [
                'السلة الحالية:',
                ...cart.map((item, index) => `${index + 1}) ${item.product_name} × ${item.quantity}`),
                '',
                `إجمالي القطع: ${getCartCount(cart)}`,
            ].join('\n');

    const replyMarkup = buildCartKeyboard(cart.length === 0);

    if (messageId) {
        await editTelegramMessage(token, chatId, messageId, text, replyMarkup);
    } else {
        await sendTelegramMessage(token, chatId, text, replyMarkup);
    }
}

async function processMessageUpdate(token: string, update: TelegramUpdate) {
    const message = update.message;
    if (!message?.text) return;

    if (message.chat?.type !== 'private') return;

    const text = String(message.text || '').trim();
    const chatId = String(message.chat.id);
    const telegramUserId = message.from?.id ? String(message.from.id) : null;
    const telegramUsername = message.from?.username || null;
    const telegramFullName =
        [message.from?.first_name || '', message.from?.last_name || '']
            .join(' ')
            .trim() || null;

    if (text === '/cancel') {
        await upsertTelegramSession({
            chat_id: chatId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_full_name: telegramFullName,
            step: 'idle',
            draft_json: {},
            last_message_text: text,
            last_update_id: update.update_id,
            status: 'cancelled',
        });

        await sendTelegramMessage(
            token,
            message.chat.id,
            'تم إلغاء الطلب الحالي. أرسل /start لبدء طلب جديد.'
        );
        return;
    }

    if (text === '/start' || text === '/help') {
        await resetTelegramSession({
            chat_id: chatId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_full_name: telegramFullName,
            last_message_text: text,
            last_update_id: update.update_id,
        });

        await sendTelegramMessage(
            token,
            message.chat.id,
            'أهلًا بك 🌷\nلنبدأ طلبًا جديدًا.\n\nما اسم صاحب الطلب؟'
        );
        return;
    }

    const parsed = parseTelegramOrderMessage(text);

    if (parsed) {
        try {
            const order = await svc.createTelegramOrderFromParsed({
                customer_name: parsed.customer_name,
                recipient_name: parsed.recipient_name,
                phone: parsed.phone,
                notes: parsed.notes,
                payment_method: parsed.payment_method,
                currency_code: parsed.currency_code,
                items: parsed.items,
                telegram_update_id: update.update_id,
                telegram_chat_id: String(message.chat.id),
                telegram_username: message.from?.username || null,
            });

            await upsertTelegramSession({
                chat_id: chatId,
                telegram_user_id: telegramUserId,
                telegram_username: telegramUsername,
                telegram_full_name: telegramFullName,
                step: 'idle',
                draft_json: {},
                last_message_text: text,
                last_update_id: update.update_id,
                status: 'completed',
            });

            await sendTelegramMessage(
                token,
                message.chat.id,
                `تم استلام طلبك بنجاح ✅\nرقم الطلب: ${order?.order_number ?? '-'}`
            );
        } catch (error: any) {
            await sendTelegramMessage(
                token,
                message.chat.id,
                `تعذر تسجيل الطلب: ${error?.message || 'حدث خطأ غير متوقع'}`
            );
        }

        return;
    }

    const session = await getTelegramSession(chatId);

    if (!session || session.status !== 'active') {
        await sendTelegramMessage(
            token,
            message.chat.id,
            'أرسل /start لبدء طلب جديد.'
        );
        return;
    }

    if (session.step === 'awaiting_customer_name') {
        await upsertTelegramSession({
            chat_id: chatId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_full_name: telegramFullName,
            step: 'awaiting_phone',
            draft_json: {
                ...(session.draft_json || {}),
                customer_name: text,
            },
            last_message_text: text,
            last_update_id: update.update_id,
            status: 'active',
        });

        await sendTelegramMessage(
            token,
            message.chat.id,
            'تم حفظ الاسم ✅\nالآن أرسل رقم الهاتف.\nوإذا لا تريد، أرسل علامة -'
        );
        return;
    }

    if (session.step === 'awaiting_phone') {
        await upsertTelegramSession({
            chat_id: chatId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_full_name: telegramFullName,
            step: 'awaiting_recipient_name',
            draft_json: {
                ...(session.draft_json || {}),
                phone: text === '-' ? '' : text,
            },
            last_message_text: text,
            last_update_id: update.update_id,
            status: 'active',
        });

        await sendTelegramMessage(
            token,
            message.chat.id,
            'ممتاز ✅\nما اسم المستلم؟\nوإذا هو نفس صاحب الطلب أرسل علامة -'
        );
        return;
    }

    if (session.step === 'awaiting_recipient_name') {
        const nextDraft = {
            ...(session.draft_json || {}),
            recipient_name: text === '-' ? '' : text,
            cart: [],
        };

        await upsertTelegramSession({
            chat_id: chatId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_full_name: telegramFullName,
            step: 'browsing_catalog',
            draft_json: nextDraft,
            last_message_text: text,
            last_update_id: update.update_id,
            status: 'active',
        });

        try {
            await showCategories(token, chatId, undefined, 1);
        } catch (error: any) {
            console.error('Failed to show Telegram categories:', error);

            const errorText =
                error?.message ||
                error?.response?.data?.message ||
                'Unknown error while loading categories';

            await sendTelegramMessage(
                token,
                message.chat.id,
                `تعذر تحميل التصنيفات الآن.\n${String(errorText).slice(0, 300)}`
            );
        }

        return;
    }

    await sendTelegramMessage(
        token,
        message.chat.id,
        'أنت داخل طلب جارٍ. استخدم الأزرار الظاهرة، أو أرسل /cancel للإلغاء.'
    );
}

async function processCallbackUpdate(token: string, update: TelegramUpdate) {
    const callback = update.callback_query;
    if (!callback?.data || !callback.message) return;

    const chatId = String(callback.message.chat.id);
    const messageId = callback.message.message_id;
    const data = String(callback.data);
    const telegramUserId = callback.from?.id ? String(callback.from.id) : null;
    const telegramUsername = callback.from?.username || null;
    const telegramFullName =
        [callback.from?.first_name || '', callback.from?.last_name || '']
            .join(' ')
            .trim() || null;

    const session = await getTelegramSession(chatId);

    if (!session || session.status !== 'active') {
        await answerCallbackQuery(token, callback.id, 'أرسل /start لبدء طلب جديد');
        return;
    }

    if (data === 'ord:cancel') {
        await upsertTelegramSession({
            chat_id: chatId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_full_name: telegramFullName,
            step: 'idle',
            draft_json: {},
            last_message_text: data,
            last_update_id: update.update_id,
            status: 'cancelled',
        });

        await answerCallbackQuery(token, callback.id, 'تم الإلغاء');
        await editTelegramMessage(
            token,
            chatId,
            messageId,
            'تم إلغاء الطلب الحالي. أرسل /start لبدء طلب جديد.'
        );
        return;
    }

    if (data === 'ord:categories:list') {
        await answerCallbackQuery(token, callback.id);
        await showCategories(token, chatId, messageId, 1);
        return;
    }

    if (data.startsWith('ord:categories:page:')) {
        const page = Math.max(1, Number(data.split(':')[3] || 1) || 1);
        await answerCallbackQuery(token, callback.id);
        await showCategories(token, chatId, messageId, page);
        return;
    }

    if (data === 'ord:cart:view') {
        await answerCallbackQuery(token, callback.id);
        await showCart(token, chatId, session.draft_json || {}, messageId);
        return;
    }

    if (data === 'ord:cart:clear') {
        const clearedDraft = setDraftCart(session.draft_json || {}, []);

        await upsertTelegramSession({
            chat_id: chatId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_full_name: telegramFullName,
            step: 'browsing_catalog',
            draft_json: clearedDraft,
            last_message_text: data,
            last_update_id: update.update_id,
            status: 'active',
        });

        await answerCallbackQuery(token, callback.id, 'تم تفريغ السلة');
        await showCart(token, chatId, clearedDraft, messageId);
        return;
    }

    if (data === 'ord:cart:checkout') {
        const draft = session.draft_json || {};
        const cart = getDraftCart(draft);

        if (cart.length === 0) {
            await answerCallbackQuery(token, callback.id, 'السلة فارغة');
            await showCart(token, chatId, draft, messageId);
            return;
        }

        try {
            const order = await svc.createTelegramOrderFromParsed({
                customer_name: String(draft.customer_name || '').trim(),
                recipient_name: String(draft.recipient_name || '').trim() || null,
                phone: String(draft.phone || '').trim() || null,
                notes: null,
                payment_method: 'cash_on_delivery',
                currency_code: 'USD',
                items: cart.map((item) => ({
                    product_name: item.product_name,
                    quantity: item.quantity,
                })),
                telegram_update_id: update.update_id,
                telegram_chat_id: chatId,
                telegram_username: telegramUsername,
            });

            await upsertTelegramSession({
                chat_id: chatId,
                telegram_user_id: telegramUserId,
                telegram_username: telegramUsername,
                telegram_full_name: telegramFullName,
                step: 'idle',
                draft_json: {},
                last_message_text: data,
                last_update_id: update.update_id,
                status: 'completed',
            });

            await answerCallbackQuery(token, callback.id, 'تم إنشاء الطلب');
            await editTelegramMessage(
                token,
                chatId,
                messageId,
                `تم استلام طلبك بنجاح ✅\nرقم الطلب: ${order?.order_number ?? '-'}`
            );
        } catch (error: any) {
            await answerCallbackQuery(token, callback.id, 'تعذر إنشاء الطلب');
            await sendTelegramMessage(
                token,
                chatId,
                `تعذر تسجيل الطلب: ${error?.message || 'حدث خطأ غير متوقع'}`
            );
        }

        return;
    }

    if (data.startsWith('ord:cat:')) {
        const parts = data.split(':');
        const categoryId = Number(parts[2] || 0);
        const page = Math.max(1, Number(parts[3] || 1) || 1);
        const cart = getDraftCart(session.draft_json || {});

        await answerCallbackQuery(token, callback.id);
        await showProductsByCategory(
            token,
            chatId,
            categoryId,
            page,
            getCartCount(cart),
            messageId
        );
        return;
    }

    if (data.startsWith('ord:add:')) {
        const parts = data.split(':');
        const categoryId = Number(parts[2] || 0);
        const page = Math.max(1, Number(parts[3] || 1) || 1);
        const productId = Number(parts[4] || 0);

        const product = await svc.getTelegramOrderProductById(productId);

        if (!product) {
            await answerCallbackQuery(token, callback.id, 'المنتج غير متاح');
            return;
        }

        const currentDraft = session.draft_json || {};
        const currentCart = getDraftCart(currentDraft);
        const existing = currentCart.find((item) => item.product_id === product.id);

        const nextCart = existing
            ? currentCart.map((item) =>
                item.product_id === product.id
                    ? { ...item, quantity: item.quantity + 1 }
                    : item
            )
            : [
                ...currentCart,
                {
                    product_id: product.id,
                    product_name: product.name,
                    quantity: 1,
                },
            ];

        const nextDraft = setDraftCart(currentDraft, nextCart);

        await upsertTelegramSession({
            chat_id: chatId,
            telegram_user_id: telegramUserId,
            telegram_username: telegramUsername,
            telegram_full_name: telegramFullName,
            step: 'browsing_catalog',
            draft_json: nextDraft,
            last_message_text: data,
            last_update_id: update.update_id,
            status: 'active',
        });

        await answerCallbackQuery(token, callback.id, `تمت إضافة ${product.name}`);
        await showProductsByCategory(
            token,
            chatId,
            categoryId,
            page,
            getCartCount(nextCart),
            messageId
        );
        return;
    }

    await answerCallbackQuery(token, callback.id);
}

async function processUpdate(token: string, update: TelegramUpdate) {
    if (update.callback_query) {
        await processCallbackUpdate(token, update);
        return;
    }

    if (update.message) {
        await processMessageUpdate(token, update);
    }
}

async function pollTelegramOrdersOnce() {
    const settings = await getSettingsMap();

    const token = String(settings.telegram_bot_token ?? '').trim();
    const ordersEnabled =
        String(settings.customer_orders_enabled ?? 'true').trim().toLowerCase() === 'true';
    const telegramEnabled =
        String(settings.customer_orders_telegram_enabled ?? 'false').trim().toLowerCase() === 'true';

    if (!token || !ordersEnabled || !telegramEnabled) {
        return;
    }

    const lastUpdateId = Number(settings.customer_orders_telegram_last_update_id ?? 0) || 0;

    const updates = await telegramApi<TelegramUpdate[]>(token, 'getUpdates', {
        timeout: 0,
        offset: lastUpdateId + 1,
        allowed_updates: ['message', 'callback_query'],
    });

    for (const update of updates) {
        await processUpdate(token, update);
        await saveLastUpdateId(update.update_id);
    }
}

export function startTelegramCustomerOrdersPoller() {
    if (telegramOrdersPollerStarted) return;
    telegramOrdersPollerStarted = true;

    const run = async () => {
        try {
            await pollTelegramOrdersOnce();
        } catch (error) {
            console.error('Telegram customer orders poller error:', error);
        }
    };

    setTimeout(() => {
        void run();
    }, 12000);

    setInterval(() => {
        void run();
    }, 5000);
}