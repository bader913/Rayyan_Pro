import { pool, withTransaction } from '../../shared/db/pool.js';
import { recordStockMovement } from '../../shared/services/stockMovements.service.js';
import {
  answerTelegramCallbackQuery,
  getTelegramUpdates,
  sendTelegramMessage,
} from '../notifications/telegram.service.js';

export interface StockTransferListItem {
  id: number;
  transfer_number: string;
  from_warehouse_id: number;
  from_warehouse_name: string;
  to_warehouse_id: number;
  to_warehouse_name: string;
  status: 'pending' | 'approved' | 'received' | 'cancelled';
  notes: string | null;
  created_by: number | null;
  approved_by: number | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  received_at: string | null;
  items_count: number;
  total_quantity: number;
}

export interface StockTransferItemDetails {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
}

export interface StockTransferDetails extends StockTransferListItem {
  items: StockTransferItemDetails[];
}

export interface CreateStockTransferInput {
  from_warehouse_id: number;
  to_warehouse_id: number;
  notes?: string;
  items: Array<{
    product_id: number;
    quantity: number;
  }>;
}

type TransferRow = {
  id: string | number;
  transfer_number: string;
  from_warehouse_id: string | number;
  from_warehouse_name: string;
  to_warehouse_id: string | number;
  to_warehouse_name: string;
  status: 'pending' | 'approved' | 'received' | 'cancelled';
  notes: string | null;
  created_by: string | number | null;
  approved_by: string | number | null;
  created_at: string | Date;
  updated_at: string | Date;
  approved_at: string | Date | null;
  received_at: string | Date | null;
  items_count?: string | number | null;
  total_quantity?: string | number | null;
};

type TransferItemRow = {
  id: string | number;
  product_id: string | number;
  product_name: string;
  quantity: string | number;
};

type TelegramTransferSettings = {
  enabled: boolean;
  botToken: string;
  chatId: string;
  updatesOffset: number;
  approvalUserId: number | null;
};

function toIso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapTransferRow(row: TransferRow): StockTransferListItem {
  return {
    id: Number(row.id),
    transfer_number: row.transfer_number,
    from_warehouse_id: Number(row.from_warehouse_id),
    from_warehouse_name: row.from_warehouse_name,
    to_warehouse_id: Number(row.to_warehouse_id),
    to_warehouse_name: row.to_warehouse_name,
    status: row.status,
    notes: row.notes ?? null,
    created_by: row.created_by === null ? null : Number(row.created_by),
    approved_by: row.approved_by === null ? null : Number(row.approved_by),
    created_at: toIso(row.created_at)!,
    updated_at: toIso(row.updated_at)!,
    approved_at: toIso(row.approved_at),
    received_at: toIso(row.received_at),
    items_count: Number(row.items_count ?? 0),
    total_quantity: parseFloat(String(row.total_quantity ?? 0)),
  };
}

function mapTransferItemRow(row: TransferItemRow): StockTransferItemDetails {
  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    product_name: row.product_name,
    quantity: parseFloat(String(row.quantity)),
  };
}

function buildTransferNumber() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = String(Math.floor(100000 + Math.random() * 900000));
  return `TR-${yyyy}${mm}${dd}-${rand}`;
}

async function isMultiWarehouseEnabled() {
  const res = await pool.query<{ value: string }>(
    `
    SELECT value
    FROM settings
    WHERE key = 'enable_multi_warehouse'
    LIMIT 1
    `
  );

  return String(res.rows[0]?.value ?? '') === 'true';
}

async function ensureStockTransfersEnabled() {
  const enabled = await isMultiWarehouseEnabled();

  if (!enabled) {
    throw Object.assign(
      new Error('ميزة تحويلات المخزون متاحة فقط عند تفعيل نظام المستودعات المتعددة'),
      { statusCode: 409 }
    );
  }
}

function fmtTransferQty(value: number) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

async function loadTelegramTransferSettings(): Promise<TelegramTransferSettings> {
  const res = await pool.query<{ key: string; value: string }>(
    `
    SELECT key, value
    FROM settings
    WHERE key = ANY($1::text[])
    `,
    [[
      'telegram_enabled',
      'telegram_bot_token',
      'telegram_chat_id',
      'telegram_updates_offset',
      'telegram_approval_user_id',
    ]]
  );

  const settings = Object.fromEntries(
    res.rows.map((row) => [row.key, String(row.value ?? '')])
  ) as Record<string, string>;

  const botToken = String(settings.telegram_bot_token || '').trim();
  const chatId = String(settings.telegram_chat_id || '').trim();
  const enabledRaw = String(settings.telegram_enabled || '').trim();

  return {
    enabled: enabledRaw ? enabledRaw === 'true' : true,
    botToken,
    chatId,
    updatesOffset: parseInt(settings.telegram_updates_offset || '0', 10) || 0,
    approvalUserId: settings.telegram_approval_user_id
      ? Number(settings.telegram_approval_user_id)
      : null,
  };
}

async function saveTelegramUpdatesOffset(offset: number) {
  await pool.query(
    `
    INSERT INTO settings (key, value, updated_at)
    VALUES ('telegram_updates_offset', $1, NOW())
    ON CONFLICT (key)
    DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [String(offset)]
  );
}

function buildPendingTransferTelegramText(transfer: StockTransferDetails) {
  const totalQuantity = transfer.items.reduce((sum, item) => sum + item.quantity, 0);

  const itemsLines = transfer.items
    .map((item) => `• ${item.product_name} — ${fmtTransferQty(item.quantity)}`)
    .join('\n');

  return [
    '🕓 تحويل مخزون جديد بانتظار الاعتماد',
    '',
    `رقم التحويل: ${transfer.transfer_number}`,
    `من: ${transfer.from_warehouse_name}`,
    `إلى: ${transfer.to_warehouse_name}`,
    `عدد الأصناف: ${transfer.items.length}`,
    `إجمالي الكمية: ${fmtTransferQty(totalQuantity)}`,
    transfer.notes ? '' : null,
    transfer.notes ? `ملاحظات: ${transfer.notes}` : null,
    '',
    'الأصناف:',
    itemsLines || '—',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildApprovedTransferTelegramText(transfer: StockTransferDetails) {
  return [
    '✅ تم اعتماد تحويل المخزون',
    '',
    `رقم التحويل: ${transfer.transfer_number}`,
    `من: ${transfer.from_warehouse_name}`,
    `إلى: ${transfer.to_warehouse_name}`,
    `عدد الأصناف: ${transfer.items.length}`,
  ].join('\n');
}

async function sendPendingTransferTelegramApprovalMessage(transfer: StockTransferDetails) {
  const settings = await loadTelegramTransferSettings();

  if (!settings.enabled || !settings.botToken || !settings.chatId) {
    return;
  }

  await sendTelegramMessage(
    settings.botToken,
    settings.chatId,
    buildPendingTransferTelegramText(transfer),
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ اعتماد التحويل',
              callback_data: `approve_stock_transfer:${transfer.id}`,
            },
          ],
        ],
      },
    }
  );
}

async function resolveTelegramApproverUserId(
  transferId: number,
  preferredApprovalUserId: number | null
): Promise<number | null> {
  if (preferredApprovalUserId && Number.isFinite(preferredApprovalUserId)) {
    return preferredApprovalUserId;
  }

  const res = await pool.query<{ created_by: string | number | null }>(
    `
    SELECT created_by
    FROM stock_transfers
    WHERE id = $1
    LIMIT 1
    `,
    [transferId]
  );

  const createdBy = res.rows[0]?.created_by;
  return createdBy == null ? null : Number(createdBy);
}

async function ensureWarehousesExistAndActive(fromId: number, toId: number) {
  const res = await pool.query<{
    id: string | number;
    name: string;
    is_active: boolean;
  }>(
    `
    SELECT id, name, is_active
    FROM warehouses
    WHERE id = ANY($1::bigint[])
    `,
    [[fromId, toId]]
  );

  if (res.rows.length !== 2) {
    throw Object.assign(new Error('أحد المستودعين غير موجود'), { statusCode: 404 });
  }

  const inactive = res.rows.find((w) => !w.is_active);
  if (inactive) {
    throw Object.assign(
      new Error(`المستودع "${inactive.name}" غير نشط حاليًا`),
      { statusCode: 409 }
    );
  }
}

async function ensureProductsExist(productIds: number[]) {
  if (productIds.length === 0) {
    throw Object.assign(new Error('لا توجد منتجات في التحويل'), { statusCode: 400 });
  }

  const res = await pool.query<{ id: string | number }>(
    `SELECT id FROM products WHERE id = ANY($1::bigint[])`,
    [productIds]
  );

  const foundIds = new Set(res.rows.map((r) => Number(r.id)));
  const missing = productIds.find((id) => !foundIds.has(id));

  if (missing) {
    throw Object.assign(new Error(`المنتج رقم ${missing} غير موجود`), { statusCode: 404 });
  }
}

export async function listStockTransfers(status?: string): Promise<StockTransferListItem[]> {
  await ensureStockTransfersEnabled();

  const params: unknown[] = [];
  let whereClause = '';

  if (status) {
    params.push(status);
    whereClause = `WHERE st.status = $1`;
  }

  const res = await pool.query<TransferRow>(
    `
    SELECT
      st.id,
      st.transfer_number,
      st.from_warehouse_id,
      wf.name AS from_warehouse_name,
      st.to_warehouse_id,
      wt.name AS to_warehouse_name,
      st.status,
      st.notes,
      st.created_by,
      st.approved_by,
      st.created_at,
      st.updated_at,
      st.approved_at,
      st.received_at,
      COUNT(sti.id) AS items_count,
      COALESCE(SUM(sti.quantity), 0) AS total_quantity
    FROM stock_transfers st
    JOIN warehouses wf ON wf.id = st.from_warehouse_id
    JOIN warehouses wt ON wt.id = st.to_warehouse_id
    LEFT JOIN stock_transfer_items sti ON sti.transfer_id = st.id
    ${whereClause}
    GROUP BY
      st.id,
      st.transfer_number,
      st.from_warehouse_id,
      wf.name,
      st.to_warehouse_id,
      wt.name,
      st.status,
      st.notes,
      st.created_by,
      st.approved_by,
      st.created_at,
      st.updated_at,
      st.approved_at,
      st.received_at
    ORDER BY st.created_at DESC, st.id DESC
    `,
    params
  );

  return res.rows.map(mapTransferRow);
}

export async function getStockTransferById(id: number): Promise<StockTransferDetails> {
  await ensureStockTransfersEnabled();

  const headerRes = await pool.query<TransferRow>(
    `
    SELECT
      st.id,
      st.transfer_number,
      st.from_warehouse_id,
      wf.name AS from_warehouse_name,
      st.to_warehouse_id,
      wt.name AS to_warehouse_name,
      st.status,
      st.notes,
      st.created_by,
      st.approved_by,
      st.created_at,
      st.updated_at,
      st.approved_at,
      st.received_at,
      COUNT(sti.id) AS items_count,
      COALESCE(SUM(sti.quantity), 0) AS total_quantity
    FROM stock_transfers st
    JOIN warehouses wf ON wf.id = st.from_warehouse_id
    JOIN warehouses wt ON wt.id = st.to_warehouse_id
    LEFT JOIN stock_transfer_items sti ON sti.transfer_id = st.id
    WHERE st.id = $1
    GROUP BY
      st.id,
      st.transfer_number,
      st.from_warehouse_id,
      wf.name,
      st.to_warehouse_id,
      wt.name,
      st.status,
      st.notes,
      st.created_by,
      st.approved_by,
      st.created_at,
      st.updated_at,
      st.approved_at,
      st.received_at
    `,
    [id]
  );

  if (!headerRes.rows[0]) {
    throw Object.assign(new Error('تحويل المخزون غير موجود'), { statusCode: 404 });
  }

  const itemsRes = await pool.query<TransferItemRow>(
    `
    SELECT
      sti.id,
      sti.product_id,
      p.name AS product_name,
      sti.quantity
    FROM stock_transfer_items sti
    JOIN products p ON p.id = sti.product_id
    WHERE sti.transfer_id = $1
    ORDER BY sti.id ASC
    `,
    [id]
  );

  return {
    ...mapTransferRow(headerRes.rows[0]),
    items: itemsRes.rows.map(mapTransferItemRow),
  };
}

export async function createStockTransfer(
  input: CreateStockTransferInput,
  userId: number
): Promise<StockTransferDetails> {
  await ensureStockTransfersEnabled();

  const fromWarehouseId = Number(input.from_warehouse_id);
  const toWarehouseId = Number(input.to_warehouse_id);
  const notes = String(input.notes ?? '').trim() || null;

  if (!fromWarehouseId || Number.isNaN(fromWarehouseId)) {
    throw Object.assign(new Error('المستودع المصدر غير صالح'), { statusCode: 400 });
  }

  if (!toWarehouseId || Number.isNaN(toWarehouseId)) {
    throw Object.assign(new Error('المستودع الوجهة غير صالح'), { statusCode: 400 });
  }

  if (fromWarehouseId === toWarehouseId) {
    throw Object.assign(new Error('يجب أن يكون المستودع المصدر مختلفًا عن الوجهة'), {
      statusCode: 400,
    });
  }

  const items = (input.items ?? []).map((item) => ({
    product_id: Number(item.product_id),
    quantity: Number(item.quantity),
  }));

  if (items.length === 0) {
    throw Object.assign(new Error('أضف منتجًا واحدًا على الأقل'), { statusCode: 400 });
  }

  const duplicateProductIds = new Set<number>();
  const seenProductIds = new Set<number>();

  for (const item of items) {
    if (!item.product_id || Number.isNaN(item.product_id)) {
      throw Object.assign(new Error('يوجد منتج غير صالح في بنود التحويل'), { statusCode: 400 });
    }

    if (!item.quantity || Number.isNaN(item.quantity) || item.quantity <= 0) {
      throw Object.assign(new Error('كمية التحويل يجب أن تكون أكبر من صفر'), { statusCode: 400 });
    }

    if (seenProductIds.has(item.product_id)) {
      duplicateProductIds.add(item.product_id);
    }
    seenProductIds.add(item.product_id);
  }

  if (duplicateProductIds.size > 0) {
    throw Object.assign(new Error('لا يمكن تكرار نفس المنتج داخل التحويل نفسه'), {
      statusCode: 409,
    });
  }

  await ensureWarehousesExistAndActive(fromWarehouseId, toWarehouseId);
  await ensureProductsExist(items.map((item) => item.product_id));

  const createdTransferId = await withTransaction(async (client) => {
    const transferNumber = buildTransferNumber();

    const headerRes = await client.query<{ id: string | number }>(
      `
      INSERT INTO stock_transfers (
        transfer_number,
        from_warehouse_id,
        to_warehouse_id,
        status,
        notes,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'pending', $4, $5, NOW(), NOW())
      RETURNING id
      `,
      [transferNumber, fromWarehouseId, toWarehouseId, notes, userId]
    );

    const transferId = Number(headerRes.rows[0].id);

    for (const item of items) {
      await client.query(
        `
        INSERT INTO stock_transfer_items (
          transfer_id,
          product_id,
          quantity,
          created_at
        )
        VALUES ($1, $2, $3, NOW())
        `,
        [transferId, item.product_id, item.quantity]
      );
    }

    return transferId;
  });

  const createdTransfer = await getStockTransferById(createdTransferId);

  await Promise.allSettled([
    sendPendingTransferTelegramApprovalMessage(createdTransfer),
  ]);

  return createdTransfer;
}

export async function approveStockTransfer(
  id: number,
  userId: number
): Promise<StockTransferDetails> {
  await ensureStockTransfersEnabled();

  await withTransaction(async (client) => {
    const transferRes = await client.query<{
      id: string | number;
      transfer_number: string;
      status: 'pending' | 'approved' | 'received' | 'cancelled';
      notes: string | null;
      from_warehouse_id: string | number;
      from_warehouse_name: string;
      to_warehouse_id: string | number;
      to_warehouse_name: string;
    }>(
      `
      SELECT
        st.id,
        st.transfer_number,
        st.status,
        st.notes,
        st.from_warehouse_id,
        wf.name AS from_warehouse_name,
        st.to_warehouse_id,
        wt.name AS to_warehouse_name
      FROM stock_transfers st
      JOIN warehouses wf ON wf.id = st.from_warehouse_id
      JOIN warehouses wt ON wt.id = st.to_warehouse_id
      WHERE st.id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (!transferRes.rows[0]) {
      throw Object.assign(new Error('تحويل المخزون غير موجود'), { statusCode: 404 });
    }

    const transfer = transferRes.rows[0];

    if (transfer.status !== 'pending') {
      throw Object.assign(
        new Error('لا يمكن اعتماد تحويل ليس بحالة قيد الانتظار'),
        { statusCode: 409 }
      );
    }

    const itemsRes = await client.query<{
      id: string | number;
      product_id: string | number;
      product_name: string;
      quantity: string | number;
    }>(
      `
      SELECT
        sti.id,
        sti.product_id,
        p.name AS product_name,
        sti.quantity
      FROM stock_transfer_items sti
      JOIN products p ON p.id = sti.product_id
      WHERE sti.transfer_id = $1
      ORDER BY sti.id ASC
      `,
      [id]
    );

    if (itemsRes.rows.length === 0) {
      throw Object.assign(new Error('لا يمكن اعتماد تحويل بدون بنود'), {
        statusCode: 409,
      });
    }

    const fromWarehouseId = Number(transfer.from_warehouse_id);
    const toWarehouseId = Number(transfer.to_warehouse_id);

    const warehousesRes = await client.query<{
      id: string | number;
      name: string;
      is_active: boolean;
    }>(
      `
      SELECT id, name, is_active
      FROM warehouses
      WHERE id = ANY($1::bigint[])
      FOR UPDATE
      `,
      [[fromWarehouseId, toWarehouseId]]
    );

    if (warehousesRes.rows.length !== 2) {
      throw Object.assign(new Error('أحد المستودعين لم يعد موجودًا'), { statusCode: 404 });
    }

    const inactiveWarehouse = warehousesRes.rows.find((w) => !w.is_active);
    if (inactiveWarehouse) {
      throw Object.assign(
        new Error(`لا يمكن اعتماد التحويل لأن المستودع "${inactiveWarehouse.name}" غير نشط حاليًا`),
        { statusCode: 409 }
      );
    }

    for (const item of itemsRes.rows) {
      const productId = Number(item.product_id);
      const quantity = parseFloat(String(item.quantity));

      const sourceStockRes = await client.query<{ quantity: string }>(
        `
        SELECT quantity
        FROM product_warehouse_stock
        WHERE product_id = $1 AND warehouse_id = $2
        FOR UPDATE
        `,
        [productId, fromWarehouseId]
      );

      const sourceQty = parseFloat(sourceStockRes.rows[0]?.quantity ?? '0');

      if (!sourceStockRes.rows[0] || sourceQty + 0.000001 < quantity) {
        throw Object.assign(
          new Error(
            `لا يوجد رصيد كافٍ للمنتج "${item.product_name}" في المستودع المصدر. المتوفر: ${sourceQty.toFixed(3)}`
          ),
          { statusCode: 409 }
        );
      }

      const targetStockRes = await client.query<{ quantity: string }>(
        `
        SELECT quantity
        FROM product_warehouse_stock
        WHERE product_id = $1 AND warehouse_id = $2
        FOR UPDATE
        `,
        [productId, toWarehouseId]
      );

      const targetQty = parseFloat(targetStockRes.rows[0]?.quantity ?? '0');

      await client.query(
        `
        UPDATE product_warehouse_stock
        SET quantity = $1, updated_at = NOW()
        WHERE product_id = $2 AND warehouse_id = $3
        `,
        [sourceQty - quantity, productId, fromWarehouseId]
      );

      if (targetStockRes.rows[0]) {
        await client.query(
          `
          UPDATE product_warehouse_stock
          SET quantity = $1, updated_at = NOW()
          WHERE product_id = $2 AND warehouse_id = $3
          `,
          [targetQty + quantity, productId, toWarehouseId]
        );
      } else {
        await client.query(
          `
          INSERT INTO product_warehouse_stock (
            product_id,
            warehouse_id,
            quantity,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, NOW(), NOW())
          `,
          [productId, toWarehouseId, quantity]
        );
      }

      const note = `اعتماد تحويل ${transfer.transfer_number} من "${transfer.from_warehouse_name}" إلى "${transfer.to_warehouse_name}"`;

      await recordStockMovement(client, {
        product_id: productId,
        movement_type: 'transfer_out',
        quantity_change: -quantity,
        reference_id: Number(transfer.id),
        reference_type: 'stock_transfer',
        note,
        created_by: userId,
        suppress_low_stock_detection: true,
      });

      await recordStockMovement(client, {
        product_id: productId,
        movement_type: 'transfer_in',
        quantity_change: quantity,
        reference_id: Number(transfer.id),
        reference_type: 'stock_transfer',
        note,
        created_by: userId,
        suppress_low_stock_detection: true,
      });
    }

    await client.query(
      `
      UPDATE stock_transfers
      SET
        status = 'approved',
        approved_by = $2,
        approved_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
      [id, userId]
    );
  });

  return await getStockTransferById(id);
}

export async function pollTelegramStockTransferApprovals() {
  const multiWarehouseEnabled = await isMultiWarehouseEnabled();
  if (!multiWarehouseEnabled) {
    return;
  }

  const settings = await loadTelegramTransferSettings();

  if (!settings.enabled || !settings.botToken || !settings.chatId) {
    return;
  }

  const updates = await getTelegramUpdates(settings.botToken, {
    offset: settings.updatesOffset > 0 ? settings.updatesOffset + 1 : undefined,
    limit: 20,
  });

  if (!updates.length) {
    return;
  }

  let lastOffset = settings.updatesOffset;

  for (const update of updates) {
    lastOffset = Math.max(lastOffset, Number(update.update_id || 0));

    const callback = update.callback_query;
    if (!callback?.data?.startsWith('approve_stock_transfer:')) {
      continue;
    }

    const callbackChatId = String(callback.message?.chat?.id ?? '').trim();
    if (!callbackChatId || callbackChatId !== settings.chatId) {
      await answerTelegramCallbackQuery(
        settings.botToken,
        callback.id,
        'هذه العملية غير مصرح بها من هذه المحادثة',
        true
      ).catch(() => {});
      continue;
    }

    const transferId = Number(callback.data.split(':')[1] || 0);
    if (!transferId || Number.isNaN(transferId)) {
      await answerTelegramCallbackQuery(
        settings.botToken,
        callback.id,
        'معرف التحويل غير صالح',
        true
      ).catch(() => {});
      continue;
    }

    const approverUserId = await resolveTelegramApproverUserId(
      transferId,
      settings.approvalUserId
    );

    if (!approverUserId) {
      await answerTelegramCallbackQuery(
        settings.botToken,
        callback.id,
        'لا يوجد مستخدم داخلي معتمد لتنفيذ الاعتماد',
        true
      ).catch(() => {});
      continue;
    }

    try {
      const approvedTransfer = await approveStockTransfer(transferId, approverUserId);

      await Promise.allSettled([
        answerTelegramCallbackQuery(
          settings.botToken,
          callback.id,
          'تم اعتماد التحويل بنجاح'
        ),
        sendTelegramMessage(
          settings.botToken,
          settings.chatId,
          buildApprovedTransferTelegramText(approvedTransfer)
        ),
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'تعذر اعتماد التحويل';

      await answerTelegramCallbackQuery(
        settings.botToken,
        callback.id,
        message,
        true
      ).catch(() => {});
    }
  }

  await saveTelegramUpdatesOffset(lastOffset);
}