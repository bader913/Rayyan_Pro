import { pool, dbGet, dbRun, withTransaction } from '../../shared/db/pool.js';
import { recordStockMovement } from '../../shared/services/stockMovements.service.js';
import {
  sendLowStockTelegramAlert,
  type LowStockTransitionEvent,
} from '../notifications/lowStockAlerts.service.js';

export interface ProductRow {
  id: string;
  barcode: string | null;
  name: string;
  category_id: string | null;
  category_name: string | null;
  unit: string;
  is_weighted: boolean;
  purchase_price: string;
  retail_price: string;
  wholesale_price: string | null;
  wholesale_min_qty: string;
  stock_quantity: string;
  min_stock_level: string;
  expiry_date: string | null;
  image_url: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductFilters {
  q?: string;
  category_id?: string;
  supplier_id?: string;
  warehouse_id?: string | number;
  is_active?: 'true' | 'false' | 'all';
  low_stock?: boolean;
  page?: number;
  limit?: number;
}

const buildProductSelect = (stockExpression: string) => `
  SELECT
    p.id, p.barcode, p.name, p.category_id,
    c.name AS category_name,
    p.unit, p.is_weighted,
    p.purchase_price, p.retail_price,
    p.wholesale_price, p.wholesale_min_qty,
    ${stockExpression} AS stock_quantity,
    p.min_stock_level,
    p.expiry_date, p.image_url,
    p.supplier_id, s.name AS supplier_name,
    p.notes, p.is_active, p.created_by,
    p.created_at, p.updated_at
`;

export class ProductsService {
  // ─── List with filters + pagination ───────────────────────────────────────
  async listProducts(filters: ProductFilters) {
    const {
      q,
      category_id,
      supplier_id,
      warehouse_id,
      is_active = 'true',
      low_stock = false,
      page = 1,
      limit = 20,
    } = filters;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    let warehouseJoin = '';
    let stockExpression = 'p.stock_quantity';

    if (warehouse_id) {
      warehouseJoin = `LEFT JOIN product_warehouse_stock pws
        ON pws.product_id = p.id
       AND pws.warehouse_id = $${idx++}`;
      values.push(warehouse_id);
      stockExpression = 'COALESCE(pws.quantity, 0)';
    }

    if (is_active !== 'all') {
      conditions.push(`p.is_active = $${idx++}`);
      values.push(is_active === 'true');
    }

    if (q && q.trim()) {
      conditions.push(`(p.name ILIKE $${idx} OR p.barcode ILIKE $${idx})`);
      values.push(`%${q.trim()}%`);
      idx++;
    }

    if (category_id) {
      conditions.push(`p.category_id = $${idx++}`);
      values.push(category_id);
    }

    if (supplier_id) {
      conditions.push(`p.supplier_id = $${idx++}`);
      values.push(supplier_id);
    }

    if (low_stock) {
      conditions.push(`${stockExpression} <= p.min_stock_level`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const fromClause = `
      FROM products p
      ${warehouseJoin}
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN suppliers s  ON s.id = p.supplier_id
    `;

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::bigint AS count ${fromClause} ${where}`,
      values
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    const actualLimit = Math.min(Math.max(1, limit), 100);
    const offset = (Math.max(1, page) - 1) * actualLimit;
    const pages = Math.ceil(total / actualLimit);

    const result = await pool.query<ProductRow>(
      `${buildProductSelect(stockExpression)} ${fromClause} ${where} ORDER BY p.name ASC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, actualLimit, offset]
    );

    return {
      products: result.rows,
      pagination: { total, page: Math.max(1, page), limit: actualLimit, pages },
    };
  }

  // ─── Get by ID ─────────────────────────────────────────────────────────────
  async getProductById(id: number): Promise<ProductRow | null> {
    const result = await pool.query<ProductRow>(
      `${buildProductSelect('p.stock_quantity')}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s  ON s.id = p.supplier_id
       WHERE p.id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  // ─── Get by barcode (returns array — barcode not unique) ───────────────────
  async getProductsByBarcode(barcode: string): Promise<ProductRow[]> {
    const result = await pool.query<ProductRow>(
      `${buildProductSelect('p.stock_quantity')}
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN suppliers s  ON s.id = p.supplier_id
       WHERE p.barcode = $1 AND p.is_active = TRUE
       ORDER BY p.name ASC`,
      [barcode]
    );
    return result.rows;
  }

  // ─── Create ────────────────────────────────────────────────────────────────
  async createProduct(data: {
    barcode?: string | null;
    name: string;
    category_id?: number | null;
    unit: string;
    is_weighted?: boolean;
    purchase_price: number;
    retail_price: number;
    wholesale_price?: number | null;
    wholesale_min_qty?: number;
    initial_stock?: number;
    initial_warehouse_id?: number | null;
    min_stock_level?: number;
    expiry_date?: string | null;
    image_url?: string | null;
    supplier_id?: number | null;
    notes?: string | null;
    created_by: number;
  }): Promise<ProductRow> {
    // جلب المنتج بعد commit الـ transaction (خارج الـ callback)
    let productId: number;

    await withTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO products (
           barcode, name, category_id, unit, is_weighted,
           purchase_price, retail_price, wholesale_price, wholesale_min_qty,
           stock_quantity, min_stock_level, expiry_date, image_url,
           supplier_id, notes, created_by
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
         ) RETURNING id`,
        [
          data.barcode || null,
          data.name,
          data.category_id ?? null,
          data.unit,
          data.is_weighted ?? false,
          data.purchase_price,
          data.retail_price,
          data.wholesale_price ?? null,
          data.wholesale_min_qty ?? 1,
          0, // stock starts at 0, then adjusted below
          data.min_stock_level ?? 5,
          data.expiry_date ?? null,
          data.image_url ?? null,
          data.supplier_id ?? null,
          data.notes ?? null,
          data.created_by,
        ]
      );

      productId = parseInt(result.rows[0].id, 10);

      // Record initial stock if > 0
      if ((data.initial_stock ?? 0) > 0) {
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

        let initialWarehouseId: number | null = null;

        if (isMultiWarehouseEnabled && data.initial_warehouse_id) {
          const warehouseRes = await client.query<{ id: string; is_active: boolean }>(
            `SELECT id, is_active FROM warehouses WHERE id = $1 FOR UPDATE`,
            [data.initial_warehouse_id]
          );

          if (!warehouseRes.rows[0]) {
            throw Object.assign(new Error('المستودع الافتتاحي غير موجود'), { statusCode: 404 });
          }

          if (!warehouseRes.rows[0].is_active) {
            throw Object.assign(new Error('المستودع الافتتاحي غير نشط'), { statusCode: 409 });
          }

          initialWarehouseId = parseInt(warehouseRes.rows[0].id, 10);
        } else {
          if (configuredDefaultWarehouseId) {
            const defaultWarehouseRes = await client.query<{ id: string; is_active: boolean }>(
              `SELECT id, is_active FROM warehouses WHERE id = $1 FOR UPDATE`,
              [configuredDefaultWarehouseId]
            );

            if (defaultWarehouseRes.rows[0]?.is_active) {
              initialWarehouseId = parseInt(defaultWarehouseRes.rows[0].id, 10);
            }
          }

          if (!initialWarehouseId) {
            const mainWarehouseRes = await client.query<{ id: string }>(
              `SELECT id FROM warehouses WHERE code = 'MAIN' AND is_active = TRUE ORDER BY id ASC LIMIT 1`
            );

            if (mainWarehouseRes.rows[0]) {
              initialWarehouseId = parseInt(mainWarehouseRes.rows[0].id, 10);
            }
          }

          if (!initialWarehouseId) {
            const fallbackWarehouseRes = await client.query<{ id: string }>(
              `SELECT id FROM warehouses WHERE is_active = TRUE ORDER BY id ASC LIMIT 1`
            );

            if (!fallbackWarehouseRes.rows[0]) {
              throw Object.assign(new Error('لا يوجد مستودع نشط لتسجيل الرصيد الافتتاحي'), {
                statusCode: 409,
              });
            }

            initialWarehouseId = parseInt(fallbackWarehouseRes.rows[0].id, 10);
          }
        }

        await recordStockMovement(client, {
          product_id: productId,
          movement_type: 'initial',
          quantity_change: data.initial_stock!,
          note: 'رصيد افتتاحي',
          created_by: data.created_by,
          suppress_low_stock_detection: true,
        });

        if (initialWarehouseId) {
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
            [productId, initialWarehouseId, data.initial_stock!]
          );
        }
      }
    });

    // يُجلب بعد COMMIT ليرى stock_quantity المحدّثة
    return (await this.getProductById(productId!))!;
  }

  // ─── Update ────────────────────────────────────────────────────────────────
  async updateProduct(id: number, data: {
    barcode?: string | null;
    name?: string;
    category_id?: number | null;
    unit?: string;
    is_weighted?: boolean;
    purchase_price?: number;
    retail_price?: number;
    wholesale_price?: number | null;
    wholesale_min_qty?: number;
    min_stock_level?: number;
    expiry_date?: string | null;
    image_url?: string | null;
    supplier_id?: number | null;
    notes?: string | null;
  }): Promise<ProductRow> {
    const existing = await dbGet('SELECT id FROM products WHERE id = $1', [id]);
    if (!existing) {
      throw Object.assign(new Error('المنتج غير موجود'), { statusCode: 404 });
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const set = (col: string, val: unknown) => {
      fields.push(`${col} = $${idx++}`);
      values.push(val);
    };

    if (data.name       !== undefined) set('name',             data.name);
    if (data.barcode    !== undefined) set('barcode',          data.barcode || null);
    if (data.category_id !== undefined) set('category_id',    data.category_id ?? null);
    if (data.unit       !== undefined) set('unit',             data.unit);
    if (data.is_weighted !== undefined) set('is_weighted',     data.is_weighted);
    if (data.purchase_price !== undefined) set('purchase_price', data.purchase_price);
    if (data.retail_price !== undefined)  set('retail_price',  data.retail_price);
    if (data.wholesale_price !== undefined) set('wholesale_price', data.wholesale_price ?? null);
    if (data.wholesale_min_qty !== undefined) set('wholesale_min_qty', data.wholesale_min_qty);
    if (data.min_stock_level !== undefined) set('min_stock_level', data.min_stock_level);
    if (data.expiry_date !== undefined) set('expiry_date',     data.expiry_date ?? null);
    if (data.image_url   !== undefined) set('image_url',       data.image_url ?? null);
    if (data.supplier_id !== undefined) set('supplier_id',     data.supplier_id ?? null);
    if (data.notes       !== undefined) set('notes',           data.notes ?? null);

    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      values.push(id);
      await dbRun(`UPDATE products SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    }

    return (await this.getProductById(id))!;
  }

  // ─── Toggle active (archive/restore) ──────────────────────────────────────
  async toggleActive(id: number): Promise<ProductRow> {
    const existing = await dbGet<{ is_active: boolean }>(
      'SELECT is_active FROM products WHERE id = $1', [id]
    );
    if (!existing) {
      throw Object.assign(new Error('المنتج غير موجود'), { statusCode: 404 });
    }

    await dbRun(
      'UPDATE products SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [!existing.is_active, id]
    );

    return (await this.getProductById(id))!;
  }

  // ─── Stock adjustment (manual) ────────────────────────────────────────────
  async adjustStock(
    id: number,
    options: { new_quantity: number; warehouse_id?: number | null; note?: string; created_by: number }
  ): Promise<ProductRow> {
    const lowStockEvents: LowStockTransitionEvent[] = [];

    await withTransaction(async (client) => {
      if (options.new_quantity < 0) {
        throw Object.assign(new Error('الكمية الجديدة لا يمكن أن تكون سالبة'), { statusCode: 400 });
      }

      const product = await client.query<{ stock_quantity: string }>(
        'SELECT stock_quantity FROM products WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (!product.rows[0]) {
        throw Object.assign(new Error('المنتج غير موجود'), { statusCode: 404 });
      }

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

      let current = 0;
      let selectedWarehouseId: number | null = null;

      if (isMultiWarehouseEnabled) {
        if (!options.warehouse_id) {
          throw Object.assign(new Error('يجب تحديد المستودع عند تفعيل نظام المستودعات المتعددة'), {
            statusCode: 400,
          });
        }

        const warehouseRes = await client.query<{ id: string; is_active: boolean }>(
          `SELECT id, is_active FROM warehouses WHERE id = $1 FOR UPDATE`,
          [options.warehouse_id]
        );

        if (!warehouseRes.rows[0]) {
          throw Object.assign(new Error('المستودع المحدد غير موجود'), { statusCode: 404 });
        }

        if (!warehouseRes.rows[0].is_active) {
          throw Object.assign(new Error('المستودع المحدد غير نشط'), { statusCode: 409 });
        }

        selectedWarehouseId = parseInt(warehouseRes.rows[0].id, 10);
      } else {
        if (configuredDefaultWarehouseId) {
          const defaultWarehouseRes = await client.query<{ id: string; is_active: boolean }>(
            `SELECT id, is_active FROM warehouses WHERE id = $1 FOR UPDATE`,
            [configuredDefaultWarehouseId]
          );

          if (defaultWarehouseRes.rows[0]?.is_active) {
            selectedWarehouseId = parseInt(defaultWarehouseRes.rows[0].id, 10);
          }
        }

        if (!selectedWarehouseId) {
          const mainWarehouseRes = await client.query<{ id: string }>(
            `SELECT id FROM warehouses WHERE code = 'MAIN' AND is_active = TRUE ORDER BY id ASC LIMIT 1`
          );

          if (mainWarehouseRes.rows[0]) {
            selectedWarehouseId = parseInt(mainWarehouseRes.rows[0].id, 10);
          }
        }

        if (!selectedWarehouseId) {
          const fallbackWarehouseRes = await client.query<{ id: string }>(
            `SELECT id FROM warehouses WHERE is_active = TRUE ORDER BY id ASC LIMIT 1`
          );

          if (!fallbackWarehouseRes.rows[0]) {
            throw Object.assign(new Error('لا يوجد مستودع نشط لتعديل المخزون'), {
              statusCode: 409,
            });
          }

          selectedWarehouseId = parseInt(fallbackWarehouseRes.rows[0].id, 10);
        }
      }

      const warehouseStockRes = await client.query<{ quantity: string }>(
        `
        SELECT quantity
        FROM product_warehouse_stock
        WHERE product_id = $1 AND warehouse_id = $2
        FOR UPDATE
        `,
        [id, selectedWarehouseId]
      );

      current = parseFloat(warehouseStockRes.rows[0]?.quantity ?? '0');

      const diff = options.new_quantity - current;

      if (diff === 0) {
        return;
      }

      const movement = await recordStockMovement(client, {
        product_id: id,
        movement_type: diff > 0 ? 'adjustment_in' : 'adjustment_out',
        quantity_change: diff,
        reference_type: 'adjustment',
        note: options.note ?? 'تعديل يدوي',
        created_by: options.created_by,
      });

      if (movement.low_stock_event) {
        lowStockEvents.push(movement.low_stock_event);
      }

      if (selectedWarehouseId) {
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
            quantity = EXCLUDED.quantity,
            updated_at = NOW()
          `,
          [id, selectedWarehouseId, options.new_quantity]
        );
      }
    });

    if (lowStockEvents.length > 0) {
      await Promise.allSettled(
        lowStockEvents.map((event) => sendLowStockTelegramAlert(event))
      );
    }

    // يُجلب بعد COMMIT ليرى stock_quantity المحدّثة
    return (await this.getProductById(id))!;
  }
}
