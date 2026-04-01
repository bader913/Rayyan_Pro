import type pg from 'pg';
import { dbAll } from '../../shared/db/pool.js';
import { sendTelegramMessage } from './telegram.service.js';

const CUSTOMER_CREDIT_ALERT_STATE_KEY = 'telegram_customer_credit_limit_alert_state';

type SettingsMap = Record<string, string>;

export interface CustomerCreditLimitTransitionEvent {
  kind: 'exceeded_credit_limit';
  customerId: number;
  customerName: string;
  balanceBefore: number;
  balanceAfter: number;
  creditLimit: number;
  saleId?: number;
  invoiceNumber?: string;
}

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

function safeParseState(value: string | null | undefined): Record<string, true> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const normalized: Record<string, true> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (val) normalized[String(key)] = true;
    }
    return normalized;
  } catch {
    return {};
  }
}

async function loadStateForUpdate(client: pg.PoolClient) {
  const result = await client.query<{ value: string }>(
    `SELECT value FROM settings WHERE key = $1 FOR UPDATE`,
    [CUSTOMER_CREDIT_ALERT_STATE_KEY]
  );

  return safeParseState(result.rows[0]?.value);
}

async function saveState(
  client: pg.PoolClient,
  state: Record<string, true>,
  userId?: number
) {
  await client.query(
    `INSERT INTO settings (key, value, updated_by, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE
       SET value = $2, updated_by = $3, updated_at = NOW()`,
    [CUSTOMER_CREDIT_ALERT_STATE_KEY, JSON.stringify(state), userId ?? null]
  );
}

export async function detectCustomerCreditLimitTransition(
  client: pg.PoolClient,
  params: {
    customerId: number;
    customerName: string;
    balanceBefore: number;
    balanceAfter: number;
    creditLimit: number;
    saleId?: number;
    invoiceNumber?: string;
    userId?: number;
  }
): Promise<CustomerCreditLimitTransitionEvent | null> {
  const creditLimit = Number(params.creditLimit || 0);

  // إذا الحد 0 أو غير صالح، لا نعتبره حدًا ائتمانيًا للتنبيه
  if (!(creditLimit > 0)) {
    return null;
  }

  const customerKey = String(params.customerId);
  const state = await loadStateForUpdate(client);
  const alreadyAlerted = !!state[customerKey];
  const isOverNow = params.balanceAfter > creditLimit;

  if (isOverNow && !alreadyAlerted) {
    state[customerKey] = true;
    await saveState(client, state, params.userId);

    return {
      kind: 'exceeded_credit_limit',
      customerId: params.customerId,
      customerName: params.customerName,
      balanceBefore: params.balanceBefore,
      balanceAfter: params.balanceAfter,
      creditLimit,
      saleId: params.saleId,
      invoiceNumber: params.invoiceNumber,
    };
  }

  // رجع ضمن الحد => نفك الحالة فقط حتى يسمح بالتنبيه مستقبلًا إن تجاوزه مرة أخرى
  if (!isOverNow && alreadyAlerted) {
    delete state[customerKey];
    await saveState(client, state, params.userId);
  }

  return null;
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export async function sendCustomerCreditLimitTelegramAlert(
  event: CustomerCreditLimitTransitionEvent
) {
  const settings = await getSettingsMap([
    'shop_name',
    'telegram_enabled',
    'telegram_bot_token',
    'telegram_chat_id',
    'telegram_alert_customer_credit_limit',
  ]);

  const enabled = settings.telegram_enabled === 'true';
  const botToken = String(settings.telegram_bot_token || '').trim();
  const chatId = String(settings.telegram_chat_id || '').trim();
  const creditAlertEnabled = settings.telegram_alert_customer_credit_limit !== 'false';

  if (!enabled || !botToken || !chatId || !creditAlertEnabled) {
    return { success: true, skipped: true };
  }

  const shopName = String(settings.shop_name || 'Rayyan Pro').trim();

  let text =
    `🚨 تنبيه تجاوز حد ائتمان عميل\n` +
    `🏪 المتجر: ${shopName}\n` +
    `👤 العميل: ${event.customerName}\n` +
    `💳 حد الائتمان: ${formatAmount(event.creditLimit)}\n` +
    `📈 الرصيد السابق: ${formatAmount(event.balanceBefore)}\n` +
    `📉 الرصيد الحالي: ${formatAmount(event.balanceAfter)}`;

  if (event.invoiceNumber) {
    text += `\n🧾 الفاتورة: ${event.invoiceNumber}`;
  }

  await sendTelegramMessage(botToken, chatId, text);

  return { success: true, skipped: false };
}