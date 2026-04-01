import type pg from 'pg';
import { dbAll } from '../../shared/db/pool.js';
import { sendTelegramMessage } from './telegram.service.js';

const LOW_STOCK_STATE_KEY = 'telegram_low_stock_alert_state';

type SettingsMap = Record<string, string>;

export interface LowStockTransitionEvent {
  kind: 'entered_low_stock' | 'recovered_from_low_stock';
  productId: number;
  productName: string;
  quantityBefore: number;
  quantityAfter: number;
  minStockLevel: number;
  movementType: string;
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
    [LOW_STOCK_STATE_KEY]
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
    [LOW_STOCK_STATE_KEY, JSON.stringify(state), userId ?? null]
  );
}

export async function detectLowStockTransition(
  client: pg.PoolClient,
  params: {
    productId: number;
    productName: string;
    quantityBefore: number;
    quantityAfter: number;
    minStockLevel: number;
    movementType: string;
    userId?: number;
  }
): Promise<LowStockTransitionEvent | null> {
  const productKey = String(params.productId);
  const state = await loadStateForUpdate(client);

  const isLowNow = params.quantityAfter <= params.minStockLevel;
  const wasLowBefore = params.quantityBefore <= params.minStockLevel;
  const alreadyAlerted = !!state[productKey];

  if (isLowNow && !alreadyAlerted) {
    state[productKey] = true;
    await saveState(client, state, params.userId);

    return {
      kind: 'entered_low_stock',
      productId: params.productId,
      productName: params.productName,
      quantityBefore: params.quantityBefore,
      quantityAfter: params.quantityAfter,
      minStockLevel: params.minStockLevel,
      movementType: params.movementType,
    };
  }

  if (!isLowNow && (wasLowBefore || alreadyAlerted) && alreadyAlerted) {
    delete state[productKey];
    await saveState(client, state, params.userId);

    return {
      kind: 'recovered_from_low_stock',
      productId: params.productId,
      productName: params.productName,
      quantityBefore: params.quantityBefore,
      quantityAfter: params.quantityAfter,
      minStockLevel: params.minStockLevel,
      movementType: params.movementType,
    };
  }

  return null;
}

function getMovementLabel(movementType: string) {
  switch (movementType) {
    case 'sale':
      return 'بيع';
    case 'purchase':
      return 'شراء';
    case 'return_in':
      return 'مرتجع بيع';
    case 'return_out':
      return 'مرتجع شراء';
    case 'adjustment_in':
      return 'تعديل زيادة';
    case 'adjustment_out':
      return 'تعديل نقص';
    case 'initial':
      return 'رصيد افتتاحي';
    case 'damage':
      return 'تالف';
    case 'transfer_in':
      return 'تحويل وارد';
    case 'transfer_out':
      return 'تحويل صادر';
    default:
      return movementType;
  }
}

export async function sendLowStockTelegramAlert(event: LowStockTransitionEvent) {
  const settings = await getSettingsMap([
    'shop_name',
    'telegram_enabled',
    'telegram_bot_token',
    'telegram_chat_id',
    'telegram_alert_low_stock',
  ]);

  const enabled = settings.telegram_enabled === 'true';
  const botToken = String(settings.telegram_bot_token || '').trim();
  const chatId = String(settings.telegram_chat_id || '').trim();
  const lowStockEnabled = settings.telegram_alert_low_stock !== 'false';

  if (!enabled || !botToken || !chatId || !lowStockEnabled) {
    return { success: true, skipped: true };
  }

  const shopName = String(settings.shop_name || 'Rayyan Pro').trim();
  const qty = Number.isInteger(event.quantityAfter)
    ? String(event.quantityAfter)
    : event.quantityAfter.toFixed(3);

  const minQty = Number.isInteger(event.minStockLevel)
    ? String(event.minStockLevel)
    : event.minStockLevel.toFixed(3);

  const movementLabel = getMovementLabel(event.movementType);

  let text = '';

  if (event.kind === 'entered_low_stock') {
    text =
      `⚠️ تنبيه مخزون منخفض\n` +
      `🏪 المتجر: ${shopName}\n` +
      `📦 الصنف: ${event.productName}\n` +
      `📉 الكمية الحالية: ${qty}\n` +
      `📌 الحد الأدنى: ${minQty}\n` +
      `🔄 الحركة: ${movementLabel}`;
  } else if (event.kind === 'recovered_from_low_stock') {
    text =
      `✅ عودة المخزون للوضع الطبيعي\n` +
      `🏪 المتجر: ${shopName}\n` +
      `📦 الصنف: ${event.productName}\n` +
      `📦 الكمية الحالية: ${qty}\n` +
      `📌 الحد الأدنى: ${minQty}\n` +
      `🔄 الحركة: ${movementLabel}`;
  } else {
    return { success: true, skipped: true };
  }

  await sendTelegramMessage(botToken, chatId, text);

  return { success: true, skipped: false };
}