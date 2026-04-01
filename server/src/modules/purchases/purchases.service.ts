import { pool, withTransaction } from '../../shared/db/pool.js';
import { recordStockMovement } from '../../shared/services/stockMovements.service.js';
import { generateInvoiceNumber } from '../../shared/utils/invoiceNumber.js';
import {
  sendLowStockTelegramAlert,
  type LowStockTransitionEvent,
} from '../notifications/lowStockAlerts.service.js';

export interface PurchaseItemInput {
  product_id: number;
  quantity: number;
  unit_price: number;
}

export interface CreatePurchaseInput {
  supplier_id: number | null;
  warehouse_id?: number | null;
  items: PurchaseItemInput[];
  paid_amount: number;
  purchase_currency: string;
  exchange_rate: number;
  notes?: string;
}

export interface UpdatePurchasePaidInput {
  additional_payment: number;
  notes?: string;
}

export class PurchasesService {

  async createPurchase(input: CreatePurchaseInput, userId: number) {
    if (input.items.length === 0) {
      throw Object.assign(new Error('لا توجد بنود في الفاتورة'), { statusCode: 400 });
    }

    let result: {
      purchaseId: number;
      invoiceNumber: string;
      totalAmount: number;
      paidAmount: number;
      dueAmount: number;
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

      let targetWarehouseId: number | null = null;

      // عند تشغيل المستودعات المتعددة: إذا اختار المستخدم مستودعًا نلتزم به
      if (isMultiWarehouseEnabled && input.warehouse_id) {
        const warehouseRes = await client.query<{ id: string; is_active: boolean }>(
          `SELECT id, is_active FROM warehouses WHERE id = $1 LIMIT 1`,
          [input.warehouse_id]
        );

        if (!warehouseRes.rows[0]) {
          throw Object.assign(new Error('المستودع المحدد غير موجود'), { statusCode: 404 });
        }

        if (!warehouseRes.rows[0].is_active) {
          throw Object.assign(new Error('المستودع المحدد غير نشط'), { statusCode: 409 });
        }

        targetWarehouseId = parseInt(warehouseRes.rows[0].id, 10);
      } else {
        // سواء كان الزر مطفأ، أو كان شغالًا ولم يحدد المستخدم مستودعًا:
        // نختار المستودع الافتراضي بنفس منطق البيع
        if (configuredDefaultWarehouseId) {
          const defaultWarehouseRes = await client.query<{ id: string; is_active: boolean }>(
            `SELECT id, is_active FROM warehouses WHERE id = $1 LIMIT 1`,
            [configuredDefaultWarehouseId]
          );

          if (defaultWarehouseRes.rows[0]?.is_active) {
            targetWarehouseId = parseInt(defaultWarehouseRes.rows[0].id, 10);
          }
        }

        if (!targetWarehouseId) {
          const mainWarehouseRes = await client.query<{ id: string }>(
            `SELECT id
       FROM warehouses
       WHERE code = 'MAIN' AND is_active = TRUE
       ORDER BY id ASC
       LIMIT 1`
          );

          if (mainWarehouseRes.rows[0]) {
            targetWarehouseId = parseInt(mainWarehouseRes.rows[0].id, 10);
          }
        }

        if (!targetWarehouseId) {
          const fallbackWarehouseRes = await client.query<{ id: string }>(
            `SELECT id
       FROM warehouses
       WHERE is_active = TRUE
       ORDER BY id ASC
       LIMIT 1`
          );

          if (fallbackWarehouseRes.rows[0]) {
            targetWarehouseId = parseInt(fallbackWarehouseRes.rows[0].id, 10);
          }
        }

        if (!targetWarehouseId) {
          throw Object.assign(
            new Error('لا يوجد مستودع نشط لاستلام فاتورة الشراء'),
            { statusCode: 409 }
          );
        }
      }
      // 1. توليد رقم الفاتورة
      const invoiceNumber = await generateInvoiceNumber(client, 'PUR');

      // 2. احتساب المجموع
      let totalAmount = 0;
      for (const item of input.items) {
        totalAmount += item.quantity * item.unit_price;
      }

      const paidAmount = input.paid_amount;
      const dueAmount = totalAmount - paidAmount;

      // 3. إنشاء رأس الفاتورة
      const purchaseRow = await client.query<{ id: number }>(
        `INSERT INTO purchases
           (invoice_number, supplier_id, user_id, warehouse_id, total_amount, paid_amount,
            purchase_currency, exchange_rate, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          invoiceNumber,
          input.supplier_id,
          userId,
          targetWarehouseId,
          totalAmount,
          paidAmount,
          input.purchase_currency,
          input.exchange_rate,
          input.notes ?? null,
        ]
      );
      const purchaseId = purchaseRow.rows[0].id;

      // 4. إدراج البنود + تسجيل حركات المخزون
      for (const item of input.items) {
        const lineTotal = item.quantity * item.unit_price;

        await client.query(
          `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_price, total_price)
           VALUES ($1,$2,$3,$4,$5)`,
          [purchaseId, item.product_id, item.quantity, item.unit_price, lineTotal]
        );

        // تحديث سعر الشراء في المنتج
        await client.query(
          `UPDATE products SET purchase_price = $1, updated_at = NOW() WHERE id = $2`,
          [item.unit_price, item.product_id]
        );

        // تسجيل حركة مخزون (زيادة)
        const movement = await recordStockMovement(client, {
          product_id: item.product_id,
          movement_type: 'purchase',
          quantity_change: item.quantity,
          reference_id: purchaseId,
          reference_type: 'purchase',
          note: `فاتورة شراء ${invoiceNumber}`,
          created_by: userId,
        });

        if (movement.low_stock_event) {
          lowStockEvents.push(movement.low_stock_event);
        }

        if (targetWarehouseId) {
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
            [item.product_id, targetWarehouseId, item.quantity]
          );
        }
      }

      // 5. تحديث رصيد المورد (إذا وجد)
      if (input.supplier_id) {
        // المورد يصبح دائناً بالمبلغ المتبقي (دين على المتجر)
        await client.query(
          `UPDATE suppliers SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
          [dueAmount, input.supplier_id]
        );

        // تسجيل حركة حساب المورد
        const supplierRow = await client.query<{ balance: string }>(
          'SELECT balance FROM suppliers WHERE id = $1',
          [input.supplier_id]
        );
        const balanceAfter = parseFloat(supplierRow.rows[0]?.balance ?? '0');

        await client.query(
          `INSERT INTO supplier_account_transactions
     (supplier_id, transaction_type, reference_id, reference_type,
      debit_amount, credit_amount, balance_after, currency_code,
      exchange_rate, amount_original, note, created_by)
   VALUES ($1,$2,$3,'purchase',$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            input.supplier_id,
            dueAmount >= 0 ? 'purchase' : 'payment',
            purchaseId,
            dueAmount >= 0 ? dueAmount : 0,
            dueAmount < 0 ? Math.abs(dueAmount) : 0,
            balanceAfter,
            input.purchase_currency,
            input.exchange_rate,
            dueAmount >= 0 ? totalAmount : Math.abs(dueAmount),
            dueAmount >= 0
              ? `فاتورة شراء ${invoiceNumber}`
              : `دفعة زائدة على فاتورة شراء ${invoiceNumber}`,
            userId,
          ]
        );
      }

      result = { purchaseId, invoiceNumber, totalAmount, paidAmount, dueAmount };
    });

    if (lowStockEvents.length > 0) {
      await Promise.allSettled(
        lowStockEvents.map((event) => sendLowStockTelegramAlert(event))
      );
    }

    return result!;
  }

    async listPurchases(params: {
    supplier_id?: number;
    warehouse_id?: number;
    date_from?:   string;
    date_to?:     string;
    search?:      string;
    page?:        number;
    limit?:       number;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (params.supplier_id) {
      conditions.push(`p.supplier_id = $${idx++}`);
      values.push(params.supplier_id);
    }
        if (params.warehouse_id) {
      conditions.push(`p.warehouse_id = $${idx++}`);
      values.push(params.warehouse_id);
    }
    if (params.date_from) {
      conditions.push(`p.created_at >= $${idx++}`);
      values.push(params.date_from);
    }
    if (params.date_to) {
      conditions.push(`p.created_at < ($${idx++}::date + interval '1 day')`);
      values.push(params.date_to);
    }
    if (params.search?.trim()) {
      conditions.push(`(p.invoice_number ILIKE $${idx} OR s.name ILIKE $${idx})`);
      values.push(`%${params.search.trim()}%`);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id ${where}`,
      values
    );
    const total = parseInt(countRes.rows[0].total, 10);

    const rows = await pool.query(
      `SELECT p.id, p.invoice_number, p.total_amount, p.paid_amount,
              (p.total_amount - p.paid_amount) AS due_amount,
              p.purchase_currency, p.exchange_rate, p.notes, p.created_at,
              p.supplier_id,
              s.name AS supplier_name,
              u.full_name AS created_by
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN users u ON u.id = p.user_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return { purchases: rows.rows, total, page, limit };
  }

  async getPurchaseById(id: number) {
    const purchaseRow = await pool.query(
      `SELECT p.id, p.invoice_number, p.total_amount, p.paid_amount,
              (p.total_amount - p.paid_amount) AS due_amount,
              p.purchase_currency, p.exchange_rate, p.notes, p.created_at,
              s.id AS supplier_id, s.name AS supplier_name,
              u.full_name AS created_by
       FROM purchases p
       LEFT JOIN suppliers s ON s.id = p.supplier_id
       LEFT JOIN users u ON u.id = p.user_id
       WHERE p.id = $1`,
      [id]
    );
    if (!purchaseRow.rows[0]) return null;

    const itemsRow = await pool.query(
      `SELECT pi.id, pi.product_id, pi.quantity, pi.unit_price, pi.total_price,
              pr.name AS product_name, pr.barcode, pr.unit
       FROM purchase_items pi
       JOIN products pr ON pr.id = pi.product_id
       WHERE pi.purchase_id = $1
       ORDER BY pi.id`,
      [id]
    );

    return { ...purchaseRow.rows[0], items: itemsRow.rows };
  }

  async addPayment(purchaseId: number, amount: number, userId: number) {
    await withTransaction(async (client) => {
      const row = await client.query<{ total_amount: string; paid_amount: string; supplier_id: string }>(
        'SELECT total_amount, paid_amount, supplier_id FROM purchases WHERE id = $1 FOR UPDATE',
        [purchaseId]
      );
      if (!row.rows[0]) {
        throw Object.assign(new Error('الفاتورة غير موجودة'), { statusCode: 404 });
      }

      const total = parseFloat(row.rows[0].total_amount);
      const already = parseFloat(row.rows[0].paid_amount);
      const due = total - already;

      if (amount <= 0) {
        throw Object.assign(new Error('المبلغ يجب أن يكون أكبر من صفر'), { statusCode: 400 });
      }
      if (amount > due) {
        throw Object.assign(new Error('المبلغ المدفوع يتجاوز المبلغ المتبقي'), { statusCode: 400 });
      }

      const newPaid = already + amount;
      await client.query(
        'UPDATE purchases SET paid_amount = $1, updated_at = NOW() WHERE id = $2',
        [newPaid, purchaseId]
      );

      const supplierId = row.rows[0].supplier_id;
      if (supplierId) {
        await client.query(
          `UPDATE suppliers SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
          [amount, supplierId]
        );

        const supplierRow = await client.query<{ balance: string }>(
          'SELECT balance FROM suppliers WHERE id = $1',
          [supplierId]
        );
        const balanceAfter = parseFloat(supplierRow.rows[0]?.balance ?? '0');

        await client.query(
          `INSERT INTO supplier_account_transactions
             (supplier_id, transaction_type, reference_id, reference_type,
              debit_amount, credit_amount, balance_after, currency_code,
              exchange_rate, note, created_by)
           VALUES ($1,'payment',$2,'purchase',0,$3,$4,'USD',1,$5,$6)`,
          [
            supplierId,
            purchaseId,
            amount,
            balanceAfter,
            `دفعة على فاتورة الشراء #${purchaseId}`,
            userId,
          ]
        );
      }
    });
  }
}
