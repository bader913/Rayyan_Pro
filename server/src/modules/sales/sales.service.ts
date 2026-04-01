import { pool, withTransaction } from '../../shared/db/pool.js';
import { recordStockMovement } from '../../shared/services/stockMovements.service.js';
import { generateInvoiceNumber } from '../../shared/utils/invoiceNumber.js';
import {
  sendLowStockTelegramAlert,
  type LowStockTransitionEvent,
} from '../notifications/lowStockAlerts.service.js';
import {
  detectCustomerCreditLimitTransition,
  sendCustomerCreditLimitTelegramAlert,
  type CustomerCreditLimitTransitionEvent,
} from '../notifications/customerCreditLimitAlerts.service.js';

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface SaleItemInput {
  product_id: number;
  quantity: number;
  unit_price: number;
  price_type: 'retail' | 'wholesale' | 'custom';
  item_discount: number;
}

export interface CreateSaleInput {
  shift_id: number | null;
  pos_terminal_id: number | null;
  customer_id: number | null;
  warehouse_id?: number | null;
  source_order_id?: number | null;
  sale_type: 'retail' | 'wholesale';
  items: SaleItemInput[];
  sale_discount: number;
  payment_method: 'cash' | 'card' | 'credit' | 'mixed';
  paid_amount: number;
  use_customer_bonus?: boolean;
  notes?: string;
}

// ─── Pricing Helper ───────────────────────────────────────────────────────────

export function resolvePrice(
  product: {
    retail_price: string;
    wholesale_price: string | null;
    wholesale_min_qty: string;
  },
  qty: number,
  saleType: 'retail' | 'wholesale',
  customerType?: string
): {
  price: number;
  type: 'retail' | 'wholesale';
} {
  const isWholesaleContext = saleType === 'wholesale' || customerType === 'wholesale';
  const wPrice = product.wholesale_price ? parseFloat(product.wholesale_price) : null;
  const wMinQty = parseFloat(product.wholesale_min_qty);

  if (isWholesaleContext && wPrice && qty >= wMinQty) {
    return { price: wPrice, type: 'wholesale' };
  }

  return { price: parseFloat(product.retail_price), type: 'retail' };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SalesService {
  async createSale(input: CreateSaleInput, userId: number) {
    if (input.items.length === 0) {
      throw Object.assign(new Error('السلة فارغة'), { statusCode: 400 });
    }

    let result: {
      saleId: number;
      invoiceNumber: string;
      subtotal: number;
      total_amount: number;
      paid_amount: number;
      due_amount: number;
    };

    const lowStockEvents: LowStockTransitionEvent[] = [];
    const customerCreditEvents: CustomerCreditLimitTransitionEvent[] = [];

    let lockedSourceOrder: {
      id: number;
      status: 'new' | 'reviewed' | 'converted' | 'cancelled';
      converted_to_sale_id: number | null;
    } | null = null;

    await withTransaction(async (client) => {
      const settingsRes = await client.query<{ key: string; value: string }>(
        `SELECT key, value
         FROM settings
         WHERE key IN ('enable_multi_warehouse', 'default_sales_warehouse_id')`
      );

      const settings = Object.fromEntries(
        settingsRes.rows.map((row) => [row.key, row.value ?? ''])
      ) as Record<string, string>;

      const isMultiWarehouseEnabled = settings.enable_multi_warehouse === 'true';

      const configuredDefaultWarehouseId = (() => {
        const raw = String(settings.default_sales_warehouse_id ?? '').trim();
        const parsed = parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      })();

      let targetWarehouseId: number | null = null;
      let targetWarehouseLabel = 'المستودع الرئيسي';

      const getWarehouseById = async (warehouseId: number) => {
        const warehouseRes = await client.query<{
          id: string;
          name: string;
          code: string | null;
          is_active: boolean;
        }>(
          `SELECT id, name, code, is_active
           FROM warehouses
           WHERE id = $1
           LIMIT 1`,
          [warehouseId]
        );

        return warehouseRes.rows[0] ?? null;
      };

      const getMainWarehouse = async () => {
        const res = await client.query<{
          id: string;
          name: string;
          code: string | null;
          is_active: boolean;
        }>(
          `SELECT id, name, code, is_active
           FROM warehouses
           WHERE code = 'MAIN' AND is_active = TRUE
           ORDER BY id ASC
           LIMIT 1`
        );

        return res.rows[0] ?? null;
      };

      const getFirstActiveWarehouse = async () => {
        const res = await client.query<{
          id: string;
          name: string;
          code: string | null;
          is_active: boolean;
        }>(
          `SELECT id, name, code, is_active
           FROM warehouses
           WHERE is_active = TRUE
           ORDER BY id ASC
           LIMIT 1`
        );

        return res.rows[0] ?? null;
      };

      const formatWarehouseLabel = (warehouse: {
        id: string;
        name: string;
        code: string | null;
      }) => {
        return warehouse.name
          ? `${warehouse.name}${warehouse.code ? ` (${warehouse.code})` : ''}`
          : warehouse.code || `#${warehouse.id}`;
      };

      const resolveSalesWarehouse = async () => {
        // 1) إذا كانت المستودعات المتعددة مفعلة والمستخدم اختار مستودعًا صراحةً
        if (isMultiWarehouseEnabled && input.warehouse_id) {
          const selectedWarehouse = await getWarehouseById(input.warehouse_id);

          if (!selectedWarehouse) {
            throw Object.assign(new Error('المستودع المحدد غير موجود'), { statusCode: 404 });
          }

          if (!selectedWarehouse.is_active) {
            throw Object.assign(new Error('المستودع المحدد غير نشط'), { statusCode: 409 });
          }

          return selectedWarehouse;
        }

        // 2) إن وجد إعداد مستودع افتراضي للبيع، نستخدمه دائمًا
        if (configuredDefaultWarehouseId) {
          const configuredWarehouse = await getWarehouseById(configuredDefaultWarehouseId);

          if (!configuredWarehouse) {
            throw Object.assign(
              new Error('المستودع الافتراضي للبيع غير موجود في الإعدادات'),
              { statusCode: 409 }
            );
          }

          if (!configuredWarehouse.is_active) {
            throw Object.assign(
              new Error('المستودع الافتراضي للبيع غير نشط'),
              { statusCode: 409 }
            );
          }

          return configuredWarehouse;
        }

        // 3) وإلا نحاول MAIN
        const mainWarehouse = await getMainWarehouse();
        if (mainWarehouse) return mainWarehouse;

        // 4) وإلا أول مستودع نشط
        const firstActiveWarehouse = await getFirstActiveWarehouse();
        if (firstActiveWarehouse) return firstActiveWarehouse;

        throw Object.assign(
          new Error('لا يوجد مستودع نشط صالح لإتمام عملية البيع'),
          { statusCode: 409 }
        );
      };

      const resolvedWarehouse = await resolveSalesWarehouse();
      targetWarehouseId = parseInt(resolvedWarehouse.id, 10);
      targetWarehouseLabel = formatWarehouseLabel(resolvedWarehouse);

      if (input.shift_id !== null && input.shift_id !== undefined) {
        const shiftRow = await client.query<{ status: string; pos_terminal_id: string }>(
          'SELECT status, pos_terminal_id FROM shifts WHERE id = $1 FOR UPDATE',
          [input.shift_id]
        );

        if (!shiftRow.rows[0]) {
          throw Object.assign(new Error('الوردية غير موجودة'), { statusCode: 404 });
        }

        if (shiftRow.rows[0].status !== 'open') {
          throw Object.assign(new Error('الوردية مغلقة — لا يمكن إتمام البيع'), { statusCode: 409 });
        }
      }
            if (input.source_order_id) {
        const sourceOrderRes = await client.query<{
          id: number;
          status: 'new' | 'reviewed' | 'converted' | 'cancelled';
          converted_to_sale_id: number | null;
        }>(
          `
          SELECT id, status, converted_to_sale_id
          FROM customer_orders
          WHERE id = $1
          FOR UPDATE
          `,
          [input.source_order_id]
        );

        lockedSourceOrder = sourceOrderRes.rows[0] ?? null;

        if (!lockedSourceOrder) {
          throw Object.assign(new Error('الطلب الأصلي غير موجود'), { statusCode: 404 });
        }

        if (lockedSourceOrder.status === 'cancelled') {
          throw Object.assign(new Error('هذا الطلب ملغي ولا يمكن تنفيذه'), { statusCode: 409 });
        }

        if (
          lockedSourceOrder.status === 'converted' ||
          lockedSourceOrder.converted_to_sale_id
        ) {
          throw Object.assign(new Error('تم تنفيذ هذا الطلب سابقًا بالفعل'), { statusCode: 409 });
        }
      }

      let customerType: string | undefined;
      let customerSnapshot:
        | {
          name: string;
          customer_type: string;
          balance: string;
          credit_limit: string;
          bonus_balance: string;
        }
        | undefined;

      if (input.customer_id) {
        const cust = await client.query<{
          name: string;
          customer_type: string;
          balance: string;
          credit_limit: string;
          bonus_balance: string;
        }>(
          'SELECT name, customer_type, balance, credit_limit, bonus_balance FROM customers WHERE id = $1 FOR UPDATE',
          [input.customer_id]
        );

        customerSnapshot = cust.rows[0];
        customerType = customerSnapshot?.customer_type;
      }

      const requestedQtyByProduct = new Map<number, number>();
      for (const item of input.items) {
        requestedQtyByProduct.set(
          item.product_id,
          (requestedQtyByProduct.get(item.product_id) ?? 0) + Number(item.quantity || 0)
        );
      }

      const validatedProducts = new Set<number>();

      const processedItems: Array<SaleItemInput & {
        total_price: number;
        product_name: string;
      }> = [];

      for (const item of input.items) {
        if (item.quantity <= 0) {
          throw Object.assign(new Error('الكمية يجب أن تكون أكبر من صفر'), { statusCode: 400 });
        }

        const prodRow = await client.query<{
          id: string;
          name: string;
          stock_quantity: string;
          is_active: boolean;
          retail_price: string;
          wholesale_price: string | null;
          wholesale_min_qty: string;
        }>(
          `SELECT id, name, stock_quantity, is_active,
                  retail_price, wholesale_price, wholesale_min_qty
           FROM products
           WHERE id = $1
           FOR UPDATE`,
          [item.product_id]
        );

        if (!prodRow.rows[0]) {
          throw Object.assign(new Error(`المنتج رقم ${item.product_id} غير موجود`), { statusCode: 404 });
        }

        const p = prodRow.rows[0];

        if (!p.is_active) {
          throw Object.assign(new Error(`المنتج "${p.name}" غير نشط`), { statusCode: 400 });
        }

        const stock = parseFloat(p.stock_quantity);
        const requestedQty = requestedQtyByProduct.get(item.product_id) ?? item.quantity;

        if (!validatedProducts.has(item.product_id)) {
          if (stock + 0.000001 < requestedQty) {
            throw Object.assign(
              new Error(`مخزون "${p.name}" غير كافٍ. المتوفر: ${stock.toFixed(3)}, المطلوب: ${requestedQty}`),
              { statusCode: 400 }
            );
          }

          const warehouseStockRes = await client.query<{ quantity: string }>(
            `SELECT quantity
             FROM product_warehouse_stock
             WHERE product_id = $1 AND warehouse_id = $2
             FOR UPDATE`,
            [item.product_id, targetWarehouseId]
          );

          const warehouseQty = parseFloat(String(warehouseStockRes.rows[0]?.quantity ?? 0));

          if (warehouseQty + 0.000001 < requestedQty) {
            throw Object.assign(
              new Error(
                `مخزون "${p.name}" غير كافٍ في المستودع "${targetWarehouseLabel}". المتوفر: ${warehouseQty.toFixed(3)}, المطلوب: ${requestedQty}`
              ),
              { statusCode: 409 }
            );
          }

          validatedProducts.add(item.product_id);
        }

        const total_price = item.quantity * item.unit_price - item.item_discount;
        processedItems.push({ ...item, total_price, product_name: p.name });
      }

      const subtotal = processedItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const items_discount_total = processedItems.reduce((s, i) => s + i.item_discount, 0);
      const base_total = subtotal - items_discount_total - input.sale_discount;

      if (base_total < 0) {
        throw Object.assign(new Error('إجمالي الفاتورة لا يمكن أن يكون سالباً'), { statusCode: 400 });
      }

      let bonusEnabled = false;
      let bonusRate = 0;
      let bonusUsedAmount = 0;
      let bonusEarnedAmount = 0;

      if (input.customer_id) {
        const bonusSettingsResult = await client.query<{ key: string; value: string }>(
          `SELECT key, value
           FROM settings
           WHERE key IN ('customer_bonus_enabled', 'customer_bonus_rate')`
        );

        const bonusSettings = Object.fromEntries(
          bonusSettingsResult.rows.map((row) => [row.key, row.value ?? ''])
        ) as Record<string, string>;

        bonusEnabled = bonusSettings.customer_bonus_enabled === 'true';
        bonusRate = parseFloat(bonusSettings.customer_bonus_rate ?? '0') || 0;

        const customerBonusBalance = parseFloat(customerSnapshot?.bonus_balance ?? '0') || 0;

        if (bonusEnabled && input.use_customer_bonus && customerBonusBalance > 0 && base_total > 0) {
          bonusUsedAmount = Math.min(customerBonusBalance, base_total);
        }
      }

      const total_amount = base_total - bonusUsedAmount;

      if (input.customer_id && bonusEnabled && bonusRate > 0 && total_amount > 0) {
        bonusEarnedAmount = Number(((total_amount * bonusRate) / 100).toFixed(4));
      }

      const paid_amount = input.payment_method === 'credit' ? 0 : input.paid_amount;
      const due_amount = total_amount - paid_amount;

      if (input.payment_method === 'credit' && !input.customer_id) {
        throw Object.assign(new Error('البيع بالآجل يتطلب تحديد عميل'), { statusCode: 400 });
      }

      const invoiceNumber = await generateInvoiceNumber(client, 'INV');

      const saleInsert = await client.query<{ id: string }>(
        `INSERT INTO sales
           (invoice_number, customer_id, user_id, shift_id, pos_terminal_id, warehouse_id, source_order_id,
            sale_type, subtotal, discount, total_amount, paid_amount, payment_method,
            bonus_used_amount, bonus_earned_amount, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          invoiceNumber,
          input.customer_id,
          userId,
          input.shift_id,
          input.pos_terminal_id,
          targetWarehouseId,
          input.source_order_id ?? null,
          input.sale_type,
          subtotal,
          items_discount_total + input.sale_discount,
          total_amount,
          paid_amount,
          input.payment_method,
          bonusUsedAmount,
          bonusEarnedAmount,
          input.notes ?? null,
        ]
      );

      const saleId = parseInt(saleInsert.rows[0].id, 10);

      for (const item of processedItems) {
        await client.query(
          `INSERT INTO sale_items
             (sale_id, product_id, quantity, unit_price, discount, total_price, price_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [saleId, item.product_id, item.quantity, item.unit_price, item.item_discount, item.total_price, item.price_type]
        );

        const movement = await recordStockMovement(client, {
          product_id: item.product_id,
          movement_type: 'sale',
          quantity_change: -item.quantity,
          reference_id: saleId,
          reference_type: 'sale',
          note: `فاتورة ${invoiceNumber} من ${targetWarehouseLabel}`,
          created_by: userId,
        });

        if (movement.low_stock_event) {
          lowStockEvents.push(movement.low_stock_event);
        }

        const warehouseUpdate = await client.query(
          `UPDATE product_warehouse_stock
           SET quantity = quantity - $1, updated_at = NOW()
           WHERE product_id = $2 AND warehouse_id = $3
           RETURNING quantity`,
          [item.quantity, item.product_id, targetWarehouseId]
        );

        if (!warehouseUpdate.rows[0]) {
          throw Object.assign(
            new Error(`تعذر تحديث رصيد المستودع للصنف "${item.product_name}"`),
            { statusCode: 409 }
          );
        }
      }

      if (input.customer_id) {
        const balanceBefore = parseFloat(customerSnapshot?.balance ?? '0');
        const saleBalanceAfter = balanceBefore + total_amount;
        const finalBalance = saleBalanceAfter - paid_amount;

        const bonusSettingsResult = await client.query<{ key: string; value: string }>(
          `SELECT key, value
           FROM settings
           WHERE key IN ('customer_bonus_enabled', 'customer_bonus_rate')`
        );

        const bonusSettings = Object.fromEntries(
          bonusSettingsResult.rows.map((row) => [row.key, row.value ?? ''])
        ) as Record<string, string>;

        const bonusEnabled = bonusSettings.customer_bonus_enabled === 'true';
        const bonusRate = parseFloat(bonusSettings.customer_bonus_rate ?? '0') || 0;

        await client.query(
          'UPDATE customers SET balance = $1, updated_at = NOW() WHERE id = $2',
          [finalBalance, input.customer_id]
        );

        if (total_amount > 0) {
          await client.query(
            `INSERT INTO customer_account_transactions
               (customer_id, transaction_type, reference_id, reference_type,
                debit_amount, credit_amount, balance_after, note, created_by)
             VALUES ($1, 'sale', $2, 'sale', $3, 0, $4, $5, $6)`,
            [
              input.customer_id,
              saleId,
              total_amount,
              saleBalanceAfter,
              `بيع فاتورة ${invoiceNumber}`,
              userId,
            ]
          );
        }

        if (paid_amount > 0) {
          await client.query(
            `INSERT INTO customer_account_transactions
               (customer_id, transaction_type, reference_id, reference_type,
                debit_amount, credit_amount, balance_after, note, created_by)
             VALUES ($1, 'payment', $2, 'sale', 0, $3, $4, $5, $6)`,
            [
              input.customer_id,
              saleId,
              paid_amount,
              finalBalance,
              paid_amount > total_amount
                ? `دفعة زائدة - فاتورة ${invoiceNumber}`
                : `دفعة على فاتورة ${invoiceNumber}`,
              userId,
            ]
          );
        }

        const creditEvent = await detectCustomerCreditLimitTransition(client, {
          customerId: input.customer_id,
          customerName: customerSnapshot?.name || `العميل #${input.customer_id}`,
          balanceBefore,
          balanceAfter: finalBalance,
          creditLimit: parseFloat(customerSnapshot?.credit_limit ?? '0'),
          saleId,
          invoiceNumber,
          userId,
        });

        if (creditEvent) {
          customerCreditEvents.push(creditEvent);
        }

        if (bonusEnabled && bonusUsedAmount > 0) {
          const bonusUseUpdate = await client.query<{ bonus_balance: string }>(
            `UPDATE customers
             SET bonus_balance = bonus_balance - $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING bonus_balance`,
            [bonusUsedAmount, input.customer_id]
          );

          await client.query(
            `INSERT INTO customer_bonus_transactions
               (customer_id, transaction_type, amount, balance_after, source_type, source_id, note, created_by)
             VALUES ($1, 'use', $2, $3, 'sale', $4, $5, $6)`,
            [
              input.customer_id,
              bonusUsedAmount,
              bonusUseUpdate.rows[0].bonus_balance,
              saleId,
              `استخدام بونص في فاتورة ${invoiceNumber}`,
              userId,
            ]
          );
        }

        if (bonusEnabled && bonusEarnedAmount > 0) {
          const bonusEarnUpdate = await client.query<{ bonus_balance: string }>(
            `UPDATE customers
             SET bonus_balance = bonus_balance + $1,
                 total_bonus_earned = total_bonus_earned + $1,
                 updated_at = NOW()
             WHERE id = $2
             RETURNING bonus_balance`,
            [bonusEarnedAmount, input.customer_id]
          );

          await client.query(
            `INSERT INTO customer_bonus_transactions
               (customer_id, transaction_type, amount, balance_after, source_type, source_id, note, created_by)
             VALUES ($1, 'earn', $2, $3, 'sale', $4, $5, $6)`,
            [
              input.customer_id,
              bonusEarnedAmount,
              bonusEarnUpdate.rows[0].bonus_balance,
              saleId,
              `بونص مكتسب من فاتورة ${invoiceNumber} بنسبة ${bonusRate}%`,
              userId,
            ]
          );
        }


      }
            if (lockedSourceOrder) {
        await client.query(
          `
          UPDATE customer_orders
          SET
            status = 'converted',
            converted_to_sale_id = $1,
            converted_at = NOW(),
            reviewed_at = CASE
              WHEN reviewed_at IS NULL THEN NOW()
              ELSE reviewed_at
            END,
            updated_at = NOW()
          WHERE id = $2
          `,
          [saleId, lockedSourceOrder.id]
        );
      }

      result = { saleId, invoiceNumber, subtotal, total_amount, paid_amount, due_amount };
    });

    if (lowStockEvents.length > 0) {
      await Promise.allSettled(
        lowStockEvents.map((event) => sendLowStockTelegramAlert(event))
      );
    }

    if (customerCreditEvents.length > 0) {
      await Promise.allSettled(
        customerCreditEvents.map((event) => sendCustomerCreditLimitTelegramAlert(event))
      );
    }

    return this.getSaleById(result!.saleId);
  }

  async getSaleById(id: number) {
    const saleResult = await pool.query(
      `SELECT s.*,
              c.name AS customer_name,
              c.phone AS customer_phone,
              c.customer_type,
              u.full_name AS cashier_name,
              t.name AS terminal_name,
              t.code AS terminal_code,
              w.name AS warehouse_name,
              w.code AS warehouse_code
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN pos_terminals t ON t.id = s.pos_terminal_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       WHERE s.id = $1`,
      [id]
    );

    if (!saleResult.rows[0]) return null;

    const itemsResult = await pool.query(
      `SELECT si.*, p.name AS product_name, p.unit, p.is_weighted
       FROM sale_items si
       JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = $1
       ORDER BY si.id ASC`,
      [id]
    );

    return { ...saleResult.rows[0], items: itemsResult.rows };
  }

  async listSales(filters: {
    shift_id?: number;
    customer_id?: number;
    warehouse_id?: number;
    date_from?: string;
    date_to?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.shift_id) {
      conditions.push(`s.shift_id = $${idx++}`);
      values.push(filters.shift_id);
    }
    if (filters.customer_id) {
      conditions.push(`s.customer_id = $${idx++}`);
      values.push(filters.customer_id);
    }
        if (filters.warehouse_id) {
      conditions.push(`s.warehouse_id = $${idx++}`);
      values.push(filters.warehouse_id);
    }
    if (filters.q && filters.q.trim()) {
      conditions.push(`(s.invoice_number ILIKE $${idx} OR c.name ILIKE $${idx})`);
      values.push(`%${filters.q.trim()}%`);
      idx++;
    }
    if (filters.date_from) {
      conditions.push(`s.created_at >= $${idx++}`);
      values.push(filters.date_from);
    }
    if (filters.date_to) {
      conditions.push(`s.created_at < ($${idx++}::date + interval '1 day')`);
      values.push(filters.date_to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = ((filters.page ?? 1) - 1) * limit;

    const count = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::bigint
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       ${where}`,
      values
    );
    const total = parseInt(count.rows[0].count, 10);

    const sales = await pool.query(
      `SELECT s.id, s.invoice_number, s.customer_id, s.warehouse_id, s.total_amount, s.paid_amount, s.payment_method,
              s.sale_type, s.created_at,
              c.name AS customer_name,
              u.full_name AS cashier_name,
              w.name AS warehouse_name,
              w.code AS warehouse_code
       FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id
       JOIN users u ON u.id = s.user_id
       LEFT JOIN warehouses w ON w.id = s.warehouse_id
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    );

    const salesRows = sales.rows as Array<Record<string, unknown>>;
    const saleIds = salesRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id) && id > 0);

    const itemsPreviewMap = new Map<number, string>();

    if (saleIds.length > 0) {
      const previewsRes = await pool.query<{ sale_id: string; items_preview: string }>(
        `
        WITH ranked_items AS (
          SELECT
            si.sale_id,
            p.name AS product_name,
            ROW_NUMBER() OVER (PARTITION BY si.sale_id ORDER BY si.id ASC) AS rn,
            COUNT(*) OVER (PARTITION BY si.sale_id) AS total_items
          FROM sale_items si
          JOIN products p ON p.id = si.product_id
          WHERE si.sale_id = ANY($1::bigint[])
        )
        SELECT
          sale_id,
          CONCAT(
            STRING_AGG(product_name, '، ' ORDER BY rn) FILTER (WHERE rn <= 4),
            CASE
              WHEN MAX(total_items) > 4 THEN ' +' || (MAX(total_items) - 4)::text
              ELSE ''
            END
          ) AS items_preview
        FROM ranked_items
        GROUP BY sale_id
        `,
        [saleIds]
      );

      for (const row of previewsRes.rows) {
        itemsPreviewMap.set(Number(row.sale_id), String(row.items_preview || ''));
      }
    }

    return {
      sales: salesRows.map((row) => ({
        ...row,
        items_preview: itemsPreviewMap.get(Number(row.id)) ?? '',
      })),
      pagination: { total, page: filters.page ?? 1, limit, pages: Math.ceil(total / limit) },
    };
  }
}