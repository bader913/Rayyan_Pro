import { pool, withTransaction } from '../../shared/db/pool.js';
import { recordStockMovement } from '../../shared/services/stockMovements.service.js';
import { generateInvoiceNumber } from '../../shared/utils/invoiceNumber.js';
import {
  sendLowStockTelegramAlert,
  type LowStockTransitionEvent,
} from '../notifications/lowStockAlerts.service.js';

export interface ReturnItemInput {
  sale_item_id: number | null;
  product_id: number;
  quantity: number;
  unit_price: number;
}

export interface CreateReturnInput {
  sale_id: number;
  items: ReturnItemInput[];
  return_method: 'cash_refund' | 'debt_discount' | 'stock_only';
  reason?: string;
  notes?: string;
  shift_id?: number | null;
}

export class SalesReturnsService {
  async createReturn(input: CreateReturnInput, userId: number) {
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

      const saleRow = await client.query<{
        id: number;
        customer_id: number | null;
        total_amount: string;
        warehouse_id: number | null;
        warehouse_name: string | null;
        warehouse_code: string | null;
      }>(
        `SELECT
           s.id,
           s.customer_id,
           s.total_amount,
           s.warehouse_id,
           w.name AS warehouse_name,
           w.code AS warehouse_code
         FROM sales s
         LEFT JOIN warehouses w ON w.id = s.warehouse_id
         WHERE s.id = $1
         FOR UPDATE OF s`,
        [input.sale_id]
      );

      if (!saleRow.rows[0]) {
        throw Object.assign(new Error('فاتورة البيع غير موجودة'), { statusCode: 404 });
      }

      const sale = saleRow.rows[0];

      let returnWarehouseId =
        sale.warehouse_id != null
          ? Number(sale.warehouse_id)
          : null;

      let returnWarehouseLabel =
        sale.warehouse_name?.trim() ||
        sale.warehouse_code?.trim() ||
        (returnWarehouseId ? `#${returnWarehouseId}` : 'غير معروف');

      // إذا كانت الفاتورة القديمة لا تحمل warehouse_id، نحاول فقط عند إطفاء النظام
      // أن نعيد للمستودع الافتراضي نفسه الذي نعتمده للبيع/الشراء.
      if (!returnWarehouseId && !isMultiWarehouseEnabled) {
        if (configuredDefaultWarehouseId) {
          const defaultWarehouseRes = await client.query<{ id: string; name: string | null; code: string | null }>(
            `SELECT id, name, code
       FROM warehouses
       WHERE id = $1 AND is_active = TRUE
       LIMIT 1`,
            [configuredDefaultWarehouseId]
          );

          if (defaultWarehouseRes.rows[0]) {
            returnWarehouseId = parseInt(defaultWarehouseRes.rows[0].id, 10);
            returnWarehouseLabel =
              defaultWarehouseRes.rows[0].name?.trim() ||
              defaultWarehouseRes.rows[0].code?.trim() ||
              `#${returnWarehouseId}`;
          }
        }

        if (!returnWarehouseId) {
          const mainWarehouseRes = await client.query<{ id: string; name: string | null; code: string | null }>(
            `SELECT id, name, code
       FROM warehouses
       WHERE code = 'MAIN' AND is_active = TRUE
       ORDER BY id ASC
       LIMIT 1`
          );

          if (mainWarehouseRes.rows[0]) {
            returnWarehouseId = parseInt(mainWarehouseRes.rows[0].id, 10);
            returnWarehouseLabel =
              mainWarehouseRes.rows[0].name?.trim() ||
              mainWarehouseRes.rows[0].code?.trim() ||
              `#${returnWarehouseId}`;
          }
        }

        if (!returnWarehouseId) {
          const fallbackWarehouseRes = await client.query<{ id: string; name: string | null; code: string | null }>(
            `SELECT id, name, code
       FROM warehouses
       WHERE is_active = TRUE
       ORDER BY id ASC
       LIMIT 1`
          );

          if (fallbackWarehouseRes.rows[0]) {
            returnWarehouseId = parseInt(fallbackWarehouseRes.rows[0].id, 10);
            returnWarehouseLabel =
              fallbackWarehouseRes.rows[0].name?.trim() ||
              fallbackWarehouseRes.rows[0].code?.trim() ||
              `#${returnWarehouseId}`;
          }
        }
      }

      if (isMultiWarehouseEnabled && !returnWarehouseId) {
        throw Object.assign(
          new Error(
            'هذه الفاتورة غير مرتبطة بمستودع محدد، لذلك لا يمكن تنفيذ مرتجع البيع عليها بأمان أثناء تفعيل المستودعات المتعددة'
          ),
          { statusCode: 409 }
        );
      }

      if (input.return_method === 'debt_discount' && !sale.customer_id) {
        throw Object.assign(new Error('لا يمكن الخصم من الدين لأن الفاتورة بدون عميل'), { statusCode: 400 });
      }

      const saleItemsRow = await client.query<{
        id: number;
        product_id: number;
        quantity: string;
        unit_price: string;
        product_name: string;
      }>(
        `SELECT
           si.id,
           si.product_id,
           si.quantity,
           si.unit_price,
           p.name AS product_name
         FROM sale_items si
         JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = $1
         FOR UPDATE OF si`,
        [input.sale_id]
      );

      const saleItemsMap = new Map(
        saleItemsRow.rows.map((row) => [row.id, row])
      );

      const returnedQtyRow = await client.query<{
        sale_item_id: number;
        returned_quantity: string;
      }>(
        `SELECT
           sri.sale_item_id,
           COALESCE(SUM(sri.quantity), 0) AS returned_quantity
         FROM sales_return_items sri
         JOIN sales_returns sr ON sr.id = sri.return_id
         WHERE sr.sale_id = $1
         GROUP BY sri.sale_item_id`,
        [input.sale_id]
      );

      const returnedQtyMap = new Map<number, number>(
        returnedQtyRow.rows.map((row) => [
          row.sale_item_id,
          parseFloat(String(row.returned_quantity || 0)),
        ])
      );

      const normalizedItems = input.items.map((raw) => {
        const saleItemId = Number(raw.sale_item_id);
        const productId = Number(raw.product_id);
        const quantity = Number(raw.quantity);

        if (!saleItemId || Number.isNaN(saleItemId)) {
          throw Object.assign(new Error('أحد بنود المرتجع لا يحتوي على sale_item_id صحيح'), { statusCode: 400 });
        }

        if (!productId || Number.isNaN(productId)) {
          throw Object.assign(new Error('أحد بنود المرتجع لا يحتوي على product_id صحيح'), { statusCode: 400 });
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw Object.assign(new Error('كمية الإرجاع يجب أن تكون أكبر من صفر'), { statusCode: 400 });
        }

        return {
          sale_item_id: saleItemId,
          product_id: productId,
          quantity,
        };
      });

      const requestedQtyMap = new Map<number, number>();
      for (const item of normalizedItems) {
        requestedQtyMap.set(
          item.sale_item_id,
          (requestedQtyMap.get(item.sale_item_id) ?? 0) + item.quantity
        );
      }

      const validatedItems = normalizedItems.map((item) => {
        const saleItem = saleItemsMap.get(item.sale_item_id);

        if (!saleItem) {
          throw Object.assign(new Error('أحد البنود لا يتبع لفاتورة البيع المحددة'), { statusCode: 400 });
        }

        if (Number(saleItem.product_id) !== Number(item.product_id)) {
          throw Object.assign(
            new Error(`الصنف "${saleItem.product_name}" غير مطابق لسطر البيع الأصلي`),
            { statusCode: 400 }
          );
        }

        const soldQty = parseFloat(String(saleItem.quantity || 0));
        const returnedQty = returnedQtyMap.get(item.sale_item_id) ?? 0;
        const remainingQty = Math.max(soldQty - returnedQty, 0);
        const requestedQty = requestedQtyMap.get(item.sale_item_id) ?? 0;

        if (requestedQty > remainingQty + 0.000001) {
          throw Object.assign(
            new Error(
              `لا يمكن إرجاع كمية أكبر من المتبقي للصنف "${saleItem.product_name}". المتاح للإرجاع: ${remainingQty}`
            ),
            { statusCode: 400 }
          );
        }

        return {
          sale_item_id: item.sale_item_id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: parseFloat(String(saleItem.unit_price || 0)),
          product_name: saleItem.product_name,
        };
      });

      const returnNumber = await generateInvoiceNumber(client, 'RET');

      let totalAmount = 0;
      for (const item of validatedItems) {
        totalAmount += item.quantity * item.unit_price;
      }

      const returnRow = await client.query<{ id: number }>(
        `INSERT INTO sales_returns
           (return_number, sale_id, customer_id, user_id, shift_id,
            return_method, total_amount, reason, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          returnNumber,
          input.sale_id,
          sale.customer_id ?? null,
          userId,
          input.shift_id ?? null,
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
          `INSERT INTO sales_return_items
             (return_id, sale_item_id, product_id, quantity, unit_price, total_price)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [returnId, item.sale_item_id, item.product_id, item.quantity, item.unit_price, lineTotal]
        );

        const movement = await recordStockMovement(client, {
          product_id: item.product_id,
          movement_type: 'return_in',
          quantity_change: item.quantity,
          reference_id: returnId,
          reference_type: 'sale_return',
          note:
            returnWarehouseId
              ? `مرتجع ${returnNumber} إلى ${returnWarehouseLabel}`
              : `مرتجع ${returnNumber}`,
          created_by: userId,
        });

        if (movement.low_stock_event) {
          lowStockEvents.push(movement.low_stock_event);
        }

        if (returnWarehouseId) {
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
            ON CONFLICT (product_id, warehouse_id)
            DO UPDATE SET
              quantity = product_warehouse_stock.quantity + EXCLUDED.quantity,
              updated_at = NOW()
            `,
            [item.product_id, returnWarehouseId, item.quantity]
          );
        }
      }

      const customerId = sale.customer_id;

      if (customerId) {
        if (input.return_method === 'debt_discount') {
          await client.query(
            `UPDATE customers
             SET balance = balance - $1, updated_at = NOW()
             WHERE id = $2`,
            [totalAmount, customerId]
          );

          const custRow = await client.query<{ balance: string }>(
            'SELECT balance FROM customers WHERE id = $1',
            [customerId]
          );

          const balanceAfter = parseFloat(custRow.rows[0]?.balance ?? '0');

          await client.query(
            `INSERT INTO customer_account_transactions
               (customer_id, transaction_type, reference_id, reference_type,
                debit_amount, credit_amount, balance_after, currency_code,
                exchange_rate, note, created_by)
             VALUES ($1,'return',$2,'sale_return',0,$3,$4,'USD',1,$5,$6)`,
            [
              customerId,
              returnId,
              totalAmount,
              balanceAfter,
              `مرتجع ${returnNumber} — خصم من الدين`,
              userId,
            ]
          );
        } else if (input.return_method === 'cash_refund') {
          const custRow = await client.query<{ balance: string }>(
            'SELECT balance FROM customers WHERE id = $1',
            [customerId]
          );

          const balanceAfter = parseFloat(custRow.rows[0]?.balance ?? '0');

          await client.query(
            `INSERT INTO customer_account_transactions
               (customer_id, transaction_type, reference_id, reference_type,
                debit_amount, credit_amount, balance_after, currency_code,
                exchange_rate, note, created_by)
             VALUES ($1,'return',$2,'sale_return',0,0,$3,'USD',1,$4,$5)`,
            [
              customerId,
              returnId,
              balanceAfter,
              `مرتجع ${returnNumber} — رد نقدي`,
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
    sale_id?: number;
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

    if (params.sale_id) {
      conditions.push(`r.sale_id = $${idx++}`);
      values.push(params.sale_id);
    }
    if (params.warehouse_id) {
      conditions.push(`s.warehouse_id = $${idx++}`);
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
       FROM sales_returns r
       LEFT JOIN sales s ON s.id = r.sale_id
       ${where}`,
      values
    );
    const total = parseInt(countRes.rows[0].total, 10);

    const rows = await pool.query(
      `SELECT r.id, r.return_number, r.sale_id, r.return_method,
              r.total_amount, r.reason, r.notes, r.created_at,
              r.customer_id,
              s.invoice_number AS sale_invoice,
              s.warehouse_id,
              w.name AS warehouse_name,
              w.code AS warehouse_code,
              c.name AS customer_name,
              u.full_name AS created_by
       FROM sales_returns r
       LEFT JOIN sales s ON s.id = r.sale_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       LEFT JOIN customers c ON c.id = r.customer_id
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
      `SELECT r.id, r.return_number, r.sale_id, r.return_method,
              r.total_amount, r.reason, r.notes, r.created_at,
              s.invoice_number AS sale_invoice,
              c.name AS customer_name,
              u.full_name AS created_by
       FROM sales_returns r
       LEFT JOIN sales s ON s.id = r.sale_id
       LEFT JOIN customers c ON c.id = r.customer_id
       LEFT JOIN users u ON u.id = r.user_id
       WHERE r.id = $1`,
      [id]
    );
    if (!returnRow.rows[0]) return null;

    const itemsRow = await pool.query(
      `SELECT
          ri.id,
          ri.sale_item_id,
          ri.product_id,
          ri.quantity,
          ri.unit_price,
          ri.total_price,
          p.name AS product_name,
          p.barcode,
          p.unit
       FROM sales_return_items ri
       JOIN products p ON p.id = ri.product_id
       WHERE ri.return_id = $1
       ORDER BY ri.id`,
      [id]
    );

    return { ...returnRow.rows[0], items: itemsRow.rows };
  }

  async getSaleForReturn(saleId: number) {
    const settingsRes = await pool.query<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'enable_multi_warehouse' LIMIT 1`
    );
    const isMultiWarehouseEnabled = settingsRes.rows[0]?.value === 'true';

    const saleRow = await pool.query(
      `SELECT s.id, s.invoice_number, s.customer_id, s.total_amount, s.paid_amount,
              s.sale_type, s.created_at,
              s.warehouse_id,
              w.name AS warehouse_name,
              w.code AS warehouse_code,
              c.name AS customer_name
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.id = $1`,
      [saleId]
    );

    if (!saleRow.rows[0]) return null;

    const itemsRow = await pool.query(
      `SELECT
         si.id,
         si.product_id,
         si.quantity,
         COALESCE(rr.returned_quantity, 0) AS returned_quantity,
         GREATEST(si.quantity - COALESCE(rr.returned_quantity, 0), 0) AS remaining_quantity,
         si.unit_price,
         si.total_price,
         si.price_type,
         p.name AS product_name,
         p.barcode,
         p.unit
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN (
         SELECT
           sri.sale_item_id,
           SUM(sri.quantity) AS returned_quantity
         FROM sales_return_items sri
         JOIN sales_returns sr ON sr.id = sri.return_id
         WHERE sr.sale_id = $1
         GROUP BY sri.sale_item_id
       ) rr ON rr.sale_item_id = si.id
       WHERE si.sale_id = $1
       ORDER BY si.id`,
      [saleId]
    );

    return {
      ...saleRow.rows[0],
      is_multi_warehouse_enabled: isMultiWarehouseEnabled,
      items: itemsRow.rows,
    };
  }
}