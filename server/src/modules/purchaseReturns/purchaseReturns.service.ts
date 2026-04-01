import { pool, withTransaction } from '../../shared/db/pool.js';
import { recordStockMovement } from '../../shared/services/stockMovements.service.js';
import { generateInvoiceNumber } from '../../shared/utils/invoiceNumber.js';
import {
  sendLowStockTelegramAlert,
  type LowStockTransitionEvent,
} from '../notifications/lowStockAlerts.service.js';

export interface PurchaseReturnItemInput {
  purchase_item_id: number | null;
  product_id: number;
  quantity: number;
  unit_price: number;
}

export interface CreatePurchaseReturnInput {
  purchase_id: number;
  items: PurchaseReturnItemInput[];
  return_method: 'cash_refund' | 'debt_discount' | 'stock_only';
  reason?: string;
  notes?: string;
}

export class PurchaseReturnsService {
  async createReturn(input: CreatePurchaseReturnInput, userId: number) {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw Object.assign(new Error('لا توجد بنود للإرجاع'), { statusCode: 400 });
    }

    let result: {
      returnId: number;
      returnNumber: string;
      totalAmount: number;
    };

    const lowStockEvents: LowStockTransitionEvent[] = [];

    await withTransaction(async (client) => {
      const settingsRes = await client.query<{ key: string; value: string }>(
        `SELECT key, value
         FROM settings
         WHERE key IN ('enable_multi_warehouse', 'default_sales_warehouse_id')`
      );

      const settingsMap = new Map(settingsRes.rows.map((row) => [row.key, row.value]));
      const isMultiWarehouseEnabled = settingsMap.get('enable_multi_warehouse') === 'true';

      const rawDefaultWarehouseId = String(settingsMap.get('default_sales_warehouse_id') ?? '').trim();
      const parsedDefaultWarehouseId = parseInt(rawDefaultWarehouseId, 10);
      const configuredDefaultWarehouseId =
        Number.isFinite(parsedDefaultWarehouseId) && parsedDefaultWarehouseId > 0
          ? parsedDefaultWarehouseId
          : null;

      const purchaseRow = await client.query<{
        id: number;
        supplier_id: number | null;
        total_amount: string;
        paid_amount: string;
        purchase_currency: string;
        exchange_rate: string;
        warehouse_id: number | null;
        warehouse_name: string | null;
        warehouse_code: string | null;
      }>(
        `SELECT
           p.id,
           p.supplier_id,
           p.total_amount,
           p.paid_amount,
           p.purchase_currency,
           p.exchange_rate,
           p.warehouse_id,
           w.name AS warehouse_name,
           w.code AS warehouse_code
         FROM purchases p
         LEFT JOIN warehouses w ON w.id = p.warehouse_id
         WHERE p.id = $1
         FOR UPDATE OF p`,
        [input.purchase_id]
      );

      if (!purchaseRow.rows[0]) {
        throw Object.assign(new Error('فاتورة الشراء غير موجودة'), { statusCode: 404 });
      }

      const purchase = purchaseRow.rows[0];

      let purchaseWarehouseId =
        purchase.warehouse_id != null
          ? Number(purchase.warehouse_id)
          : null;

      let purchaseWarehouseLabel =
        purchase.warehouse_name?.trim() ||
        purchase.warehouse_code?.trim() ||
        (purchaseWarehouseId ? `#${purchaseWarehouseId}` : 'غير معروف');

      if (!purchaseWarehouseId && !isMultiWarehouseEnabled) {
        if (configuredDefaultWarehouseId) {
          const defaultWarehouseRes = await client.query<{ id: string; name: string | null; code: string | null }>(
            `SELECT id, name, code
             FROM warehouses
             WHERE id = $1 AND is_active = TRUE
             LIMIT 1`,
            [configuredDefaultWarehouseId]
          );

          if (defaultWarehouseRes.rows[0]) {
            purchaseWarehouseId = parseInt(defaultWarehouseRes.rows[0].id, 10);
            purchaseWarehouseLabel =
              defaultWarehouseRes.rows[0].name?.trim() ||
              defaultWarehouseRes.rows[0].code?.trim() ||
              `#${purchaseWarehouseId}`;
          }
        }

        if (!purchaseWarehouseId) {
          const mainWarehouseRes = await client.query<{ id: string; name: string | null; code: string | null }>(
            `SELECT id, name, code
             FROM warehouses
             WHERE code = 'MAIN' AND is_active = TRUE
             ORDER BY id ASC
             LIMIT 1`
          );

          if (mainWarehouseRes.rows[0]) {
            purchaseWarehouseId = parseInt(mainWarehouseRes.rows[0].id, 10);
            purchaseWarehouseLabel =
              mainWarehouseRes.rows[0].name?.trim() ||
              mainWarehouseRes.rows[0].code?.trim() ||
              `#${purchaseWarehouseId}`;
          }
        }

        if (!purchaseWarehouseId) {
          const fallbackWarehouseRes = await client.query<{ id: string; name: string | null; code: string | null }>(
            `SELECT id, name, code
             FROM warehouses
             WHERE is_active = TRUE
             ORDER BY id ASC
             LIMIT 1`
          );

          if (fallbackWarehouseRes.rows[0]) {
            purchaseWarehouseId = parseInt(fallbackWarehouseRes.rows[0].id, 10);
            purchaseWarehouseLabel =
              fallbackWarehouseRes.rows[0].name?.trim() ||
              fallbackWarehouseRes.rows[0].code?.trim() ||
              `#${purchaseWarehouseId}`;
          }
        }
      }

      if (isMultiWarehouseEnabled && !purchaseWarehouseId) {
        throw Object.assign(
          new Error(
            'هذه الفاتورة غير مرتبطة بمستودع محدد، لذلك لا يمكن تنفيذ مرتجع الشراء عليها بأمان أثناء تفعيل المستودعات المتعددة'
          ),
          { statusCode: 409 }
        );
      }

      if (input.return_method === 'debt_discount' && !purchase.supplier_id) {
        throw Object.assign(
          new Error('لا يمكن الخصم من ذمة المورد لأن الفاتورة بدون مورد'),
          { statusCode: 400 }
        );
      }

      const purchaseItemsRow = await client.query<{
        id: number;
        product_id: number;
        quantity: string;
        unit_price: string;
        product_name: string;
      }>(
        `SELECT
           pi.id,
           pi.product_id,
           pi.quantity,
           pi.unit_price,
           p.name AS product_name
         FROM purchase_items pi
         JOIN products p ON p.id = pi.product_id
         WHERE pi.purchase_id = $1
         FOR UPDATE OF pi`,
        [input.purchase_id]
      );

      const purchaseItemsMap = new Map(
        purchaseItemsRow.rows.map((row) => [row.id, row])
      );

      const returnedQtyRow = await client.query<{
        purchase_item_id: number;
        returned_quantity: string;
      }>(
        `SELECT
           pri.purchase_item_id,
           COALESCE(SUM(pri.quantity), 0) AS returned_quantity
         FROM purchase_return_items pri
         JOIN purchase_returns pr ON pr.id = pri.return_id
         WHERE pr.purchase_id = $1
         GROUP BY pri.purchase_item_id`,
        [input.purchase_id]
      );

      const returnedQtyMap = new Map<number, number>(
        returnedQtyRow.rows.map((row) => [
          row.purchase_item_id,
          parseFloat(String(row.returned_quantity || 0)),
        ])
      );

      const normalizedItems = input.items.map((raw) => {
        const purchaseItemId = Number(raw.purchase_item_id);
        const productId = Number(raw.product_id);
        const quantity = Number(raw.quantity);

        if (!purchaseItemId || Number.isNaN(purchaseItemId)) {
          throw Object.assign(
            new Error('أحد بنود المرتجع لا يحتوي على purchase_item_id صحيح'),
            { statusCode: 400 }
          );
        }

        if (!productId || Number.isNaN(productId)) {
          throw Object.assign(
            new Error('أحد بنود المرتجع لا يحتوي على product_id صحيح'),
            { statusCode: 400 }
          );
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw Object.assign(
            new Error('كمية الإرجاع يجب أن تكون أكبر من صفر'),
            { statusCode: 400 }
          );
        }

        return {
          purchase_item_id: purchaseItemId,
          product_id: productId,
          quantity,
        };
      });

      const requestedQtyMap = new Map<number, number>();
      for (const item of normalizedItems) {
        requestedQtyMap.set(
          item.purchase_item_id,
          (requestedQtyMap.get(item.purchase_item_id) ?? 0) + item.quantity
        );
      }

      const validatedItems = normalizedItems.map((item) => {
        const purchaseItem = purchaseItemsMap.get(item.purchase_item_id);

        if (!purchaseItem) {
          throw Object.assign(
            new Error('أحد البنود لا يتبع لفاتورة الشراء المحددة'),
            { statusCode: 400 }
          );
        }

        if (Number(purchaseItem.product_id) !== Number(item.product_id)) {
          throw Object.assign(
            new Error(`الصنف "${purchaseItem.product_name}" غير مطابق لسطر الشراء الأصلي`),
            { statusCode: 400 }
          );
        }

        const purchasedQty = parseFloat(String(purchaseItem.quantity || 0));
        const returnedQty = returnedQtyMap.get(item.purchase_item_id) ?? 0;
        const remainingQty = Math.max(purchasedQty - returnedQty, 0);
        const requestedQty = requestedQtyMap.get(item.purchase_item_id) ?? 0;

        if (requestedQty > remainingQty + 0.000001) {
          throw Object.assign(
            new Error(
              `لا يمكن إرجاع كمية أكبر من المتبقي للصنف "${purchaseItem.product_name}". المتاح للإرجاع: ${remainingQty}`
            ),
            { statusCode: 400 }
          );
        }

        return {
          purchase_item_id: item.purchase_item_id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: parseFloat(String(purchaseItem.unit_price || 0)),
          product_name: purchaseItem.product_name,
        };
      });

      const returnNumber = await generateInvoiceNumber(client, 'PRT');

      let totalAmount = 0;
      for (const item of validatedItems) {
        totalAmount += item.quantity * item.unit_price;
      }

      const returnRow = await client.query<{ id: number }>(
        `INSERT INTO purchase_returns
           (return_number, purchase_id, supplier_id, user_id, return_method, total_amount, reason, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          returnNumber,
          input.purchase_id,
          purchase.supplier_id ?? null,
          userId,
          input.return_method,
          totalAmount,
          input.reason?.trim() || null,
          input.notes?.trim() || null,
        ]
      );

      const returnId = returnRow.rows[0].id;

      for (const item of validatedItems) {
        const lineTotal = item.quantity * item.unit_price;

        await client.query(
          `INSERT INTO purchase_return_items
             (return_id, purchase_item_id, product_id, quantity, unit_price, total_price)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            returnId,
            item.purchase_item_id,
            item.product_id,
            item.quantity,
            item.unit_price,
            lineTotal,
          ]
        );

        if (purchaseWarehouseId) {
          const warehouseStockRow = await client.query<{ quantity: string }>(
            `SELECT quantity
             FROM product_warehouse_stock
             WHERE product_id = $1 AND warehouse_id = $2
             FOR UPDATE`,
            [item.product_id, purchaseWarehouseId]
          );

          const warehouseQty = parseFloat(String(warehouseStockRow.rows[0]?.quantity ?? 0));

          if (warehouseQty + 0.000001 < item.quantity) {
            throw Object.assign(
              new Error(
                `لا يمكن إرجاع الصنف "${item.product_name}" لأن الكمية الموجودة حاليًا في مستودع الفاتورة "${purchaseWarehouseLabel}" هي ${warehouseQty} فقط`
              ),
              { statusCode: 409 }
            );
          }
        }

        const movement = await recordStockMovement(client, {
          product_id: item.product_id,
          movement_type: 'return_out',
          quantity_change: -item.quantity,
          reference_id: returnId,
          reference_type: 'purchase_return',
          note:
            purchaseWarehouseId
              ? `مرتجع شراء ${returnNumber} من مستودع ${purchaseWarehouseLabel}`
              : `مرتجع شراء ${returnNumber}`,
          created_by: userId,
        });

        if (movement.low_stock_event) {
          lowStockEvents.push(movement.low_stock_event);
        }

        if (purchaseWarehouseId) {
          await client.query(
            `UPDATE product_warehouse_stock
             SET quantity = quantity - $1, updated_at = NOW()
             WHERE product_id = $2 AND warehouse_id = $3`,
            [item.quantity, item.product_id, purchaseWarehouseId]
          );
        }
      }

      if (purchase.supplier_id) {
        if (input.return_method === 'debt_discount') {
          await client.query(
            `UPDATE suppliers
             SET balance = balance - $1, updated_at = NOW()
             WHERE id = $2`,
            [totalAmount, purchase.supplier_id]
          );

          const supplierRow = await client.query<{ balance: string }>(
            'SELECT balance FROM suppliers WHERE id = $1',
            [purchase.supplier_id]
          );

          const balanceAfter = parseFloat(supplierRow.rows[0]?.balance ?? '0');

          await client.query(
            `INSERT INTO supplier_account_transactions
               (supplier_id, transaction_type, reference_id, reference_type,
                debit_amount, credit_amount, balance_after, currency_code,
                exchange_rate, note, created_by)
             VALUES ($1,'return',$2,'purchase_return',0,$3,$4,$5,$6,$7,$8)`,
            [
              purchase.supplier_id,
              returnId,
              totalAmount,
              balanceAfter,
              purchase.purchase_currency || 'USD',
              parseFloat(String(purchase.exchange_rate || 1)),
              `مرتجع شراء ${returnNumber} — خصم من الذمة`,
              userId,
            ]
          );
        } else if (input.return_method === 'cash_refund') {
          const supplierRow = await client.query<{ balance: string }>(
            'SELECT balance FROM suppliers WHERE id = $1',
            [purchase.supplier_id]
          );

          const balanceAfter = parseFloat(supplierRow.rows[0]?.balance ?? '0');

          await client.query(
            `INSERT INTO supplier_account_transactions
               (supplier_id, transaction_type, reference_id, reference_type,
                debit_amount, credit_amount, balance_after, currency_code,
                exchange_rate, note, created_by)
             VALUES ($1,'return',$2,'purchase_return',0,0,$3,$4,$5,$6,$7)`,
            [
              purchase.supplier_id,
              returnId,
              balanceAfter,
              purchase.purchase_currency || 'USD',
              parseFloat(String(purchase.exchange_rate || 1)),
              `مرتجع شراء ${returnNumber} — استرداد نقدي`,
              userId,
            ]
          );
        }
      }

      result = {
        returnId,
        returnNumber,
        totalAmount,
      };
    });

    if (lowStockEvents.length > 0) {
      await Promise.allSettled(
        lowStockEvents.map((event) => sendLowStockTelegramAlert(event))
      );
    }

    return result!;
  }

    async listReturns(params: {
    purchase_id?: number;
    warehouse_id?: number;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.purchase_id) {
      conditions.push(`r.purchase_id = $${idx++}`);
      values.push(params.purchase_id);
    }
    if (params.warehouse_id) {
      conditions.push(`p.warehouse_id = $${idx++}`);
      values.push(params.warehouse_id);
    }
    if (params.date_from) {
      conditions.push(`r.created_at >= $${idx++}`);
      values.push(params.date_from);
    }
    if (params.date_to) {
      conditions.push(`r.created_at < ($${idx++}::date + interval '1 day')`);
      values.push(params.date_to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM purchase_returns r
       LEFT JOIN purchases p ON p.id = r.purchase_id
       ${where}`,
      values
    );
    const total = parseInt(countRes.rows[0].total, 10);

    const rows = await pool.query(
      `SELECT r.id, r.return_number, r.purchase_id, r.return_method,
              r.total_amount, r.reason, r.notes, r.created_at,
              r.supplier_id,
              p.invoice_number AS purchase_invoice,
              p.warehouse_id,
              w.name AS warehouse_name,
              w.code AS warehouse_code,
              s.name AS supplier_name,
              u.full_name AS created_by
       FROM purchase_returns r
       LEFT JOIN purchases p ON p.id = r.purchase_id
       LEFT JOIN warehouses w ON w.id = p.warehouse_id
       LEFT JOIN suppliers s ON s.id = r.supplier_id
       LEFT JOIN users u ON u.id = r.user_id
       ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return { returns: rows.rows, total, page, limit };
  }

  async getReturnById(id: number) {
    const returnRow = await pool.query(
      `SELECT r.id, r.return_number, r.purchase_id, r.return_method,
              r.total_amount, r.reason, r.notes, r.created_at,
              r.supplier_id,
              p.invoice_number AS purchase_invoice,
              s.name AS supplier_name,
              u.full_name AS created_by
       FROM purchase_returns r
       LEFT JOIN purchases p ON p.id = r.purchase_id
       LEFT JOIN suppliers s ON s.id = r.supplier_id
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.id = $1`,
      [id]
    );

    if (!returnRow.rows[0]) return null;

    const itemsRow = await pool.query(
      `SELECT
         ri.id,
         ri.purchase_item_id,
         ri.product_id,
         ri.quantity,
         ri.unit_price,
         ri.total_price,
         p.name AS product_name,
         p.barcode,
         p.unit
       FROM purchase_return_items ri
       JOIN products p ON p.id = ri.product_id
       WHERE ri.return_id = $1
       ORDER BY ri.id`,
      [id]
    );

    return { ...returnRow.rows[0], items: itemsRow.rows };
  }

  async getPurchaseForReturn(purchaseId: number) {
    const settingsRes = await pool.query<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'enable_multi_warehouse' LIMIT 1`
    );
    const isMultiWarehouseEnabled = settingsRes.rows[0]?.value === 'true';

    const purchaseRow = await pool.query(
      `SELECT p.id, p.invoice_number, p.total_amount, p.paid_amount,
              p.purchase_currency, p.exchange_rate, p.created_at,
              p.warehouse_id,
              w.name AS warehouse_name,
              w.code AS warehouse_code,
              s.id AS supplier_id, s.name AS supplier_name
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN warehouses w ON w.id = p.warehouse_id
       WHERE p.id = $1`,
      [purchaseId]
    );

    if (!purchaseRow.rows[0]) return null;

    const itemsRow = await pool.query(
      `SELECT
         pi.id,
         pi.product_id,
         pi.quantity,
         COALESCE(rr.returned_quantity, 0) AS returned_quantity,
         GREATEST(pi.quantity - COALESCE(rr.returned_quantity, 0), 0) AS remaining_quantity,
         pi.unit_price,
         pi.total_price,
         p.name AS product_name,
         p.barcode,
         p.unit
       FROM purchase_items pi
       JOIN products p ON p.id = pi.product_id
       LEFT JOIN (
         SELECT
           pri.purchase_item_id,
           SUM(pri.quantity) AS returned_quantity
         FROM purchase_return_items pri
         JOIN purchase_returns pr ON pr.id = pri.return_id
         WHERE pr.purchase_id = $1
         GROUP BY pri.purchase_item_id
       ) rr ON rr.purchase_item_id = pi.id
       WHERE pi.purchase_id = $1
       ORDER BY pi.id`,
      [purchaseId]
    );

    return {
      ...purchaseRow.rows[0],
      is_multi_warehouse_enabled: isMultiWarehouseEnabled,
      items: itemsRow.rows,
    };
  }
}