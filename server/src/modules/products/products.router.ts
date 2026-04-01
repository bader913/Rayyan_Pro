import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { ProductsService } from './products.service.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import { pool, dbAll } from '../../shared/db/pool.js';
import { auditLog } from '../../shared/utils/auditLog.js';
import { recordStockMovement } from '../../shared/services/stockMovements.service.js';

const createProductSchema = z.object({
  barcode:          z.string().max(100).nullable().optional(),
  name:             z.string().min(2, 'اسم المنتج حرفان على الأقل').max(300),
  category_id:      z.number().int().positive().nullable().optional(),
  unit:             z.string().min(1).max(20).default('قطعة'),
  is_weighted:      z.boolean().default(false),
  purchase_price:   z.number().min(0, 'سعر الشراء لا يمكن أن يكون سالباً'),
  retail_price:     z.number().min(0, 'سعر البيع لا يمكن أن يكون سالباً'),
  wholesale_price:  z.number().min(0).nullable().optional(),
  wholesale_min_qty:z.number().min(0).default(1),
  initial_stock:    z.number().min(0).default(0),
  initial_warehouse_id: z.number().int().positive().nullable().optional(),
  min_stock_level:  z.number().min(0).default(5),
  expiry_date:      z.string().nullable().optional(),
  image_url:        z.string().url().nullable().optional(),
  supplier_id:      z.number().int().positive().nullable().optional(),
  notes:            z.string().max(1000).nullable().optional(),
});

const updateProductSchema = createProductSchema
  .omit({ initial_stock: true })
  .partial();

const adjustStockSchema = z.object({
  new_quantity: z.number().min(0, 'الكمية لا يمكن أن تكون سالبة'),
  warehouse_id: z.number().int().positive().nullable().optional(),
  note:         z.string().max(500).optional(),
});

//excel fix
const normalizeDigits = (value: string) =>
  value
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0));

const normalizeLookup = (value: unknown) =>
  normalizeDigits(String(value ?? '')).trim().toLowerCase();

const normalizeNumericString = (value: unknown) =>
  normalizeDigits(String(value ?? ''))
    .replace(/[,\u066C]/g, '')
    .replace(/\u066B/g, '.')
    .trim();

const parseNumberCell = (value: unknown, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = normalizeNumericString(value);
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseOptionalNumberCell = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = normalizeNumericString(value);
  if (!raw) return null;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasMeaningfulCellValue = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return normalizeDigits(value).trim() !== '';
  return true;
};

const formatYmd = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const isValidDateParts = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
};

const parseExcelExpiryDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatYmd(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed && isValidDateParts(parsed.y, parsed.m, parsed.d)) {
      return formatYmd(parsed.y, parsed.m, parsed.d);
    }
    return null;
  }

  const raw = normalizeDigits(String(value)).trim();
  if (!raw) return null;

  const cleaned = raw.replace(/\./g, '/').replace(/\s+/g, '');

  let m = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (isValidDateParts(year, month, day)) {
      return formatYmd(year, month, day);
    }
    return null;
  }

  m = cleaned.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let year = Number(m[3]);

    if (year < 100) {
      year += 2000;
    }

    let day: number;
    let month: number;

    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      // عند الغموض نعتمد DD/MM/YYYY لأنه الأنسب لواجهة الاستخدام العربية
      day = a;
      month = b;
    }

    if (isValidDateParts(year, month, day)) {
      return formatYmd(year, month, day);
    }
    return null;
  }

  const native = new Date(raw);
  if (!Number.isNaN(native.getTime())) {
    return formatYmd(native.getFullYear(), native.getMonth() + 1, native.getDate());
  }

  return null;
};

async function resolveOrCreateCategoryId(
  catMap: Map<string, number>,
  rawName: unknown
): Promise<number | null> {
  const name = String(rawName ?? '').trim();
  if (!name) return null;

  const key = normalizeLookup(name);
  const cached = catMap.get(key);
  if (cached) return cached;

  const existing = await pool.query<{ id: number }>(
    `SELECT id
     FROM categories
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [name]
  );

  if (existing.rows[0]) {
    const id = Number(existing.rows[0].id);
    catMap.set(key, id);
    return id;
  }

  try {
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO categories (name) VALUES ($1) RETURNING id`,
      [name]
    );

    const id = Number(inserted.rows[0].id);
    catMap.set(key, id);
    return id;
  } catch {
    const duplicate = await pool.query<{ id: number }>(
      `SELECT id
       FROM categories
       WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
       LIMIT 1`,
      [name]
    );

    if (duplicate.rows[0]) {
      const id = Number(duplicate.rows[0].id);
      catMap.set(key, id);
      return id;
    }

    throw new Error(`تعذر إنشاء الفئة: ${name}`);
  }
}

async function resolveExistingSupplierId(
  supMap: Map<string, number>,
  rawName: unknown
): Promise<number | null> {
  const name = String(rawName ?? '').trim();
  if (!name) return null;

  const key = normalizeLookup(name);
  const cached = supMap.get(key);
  if (cached) return cached;

  const existing = await pool.query<{ id: number }>(
    `SELECT id
     FROM suppliers
     WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))
     LIMIT 1`,
    [name]
  );

  if (!existing.rows[0]) {
    return null;
  }

  const id = Number(existing.rows[0].id);
  supMap.set(key, id);
  return id;
}

export async function productsRoutes(fastify: FastifyInstance) {
  const svc = new ProductsService();

  // ─── List products (all roles) ──────────────────────────────────────────
  fastify.get(
    '/api/products',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const q = request.query as Record<string, string>;
      const result = await svc.listProducts({
        q: q.q,
        category_id: q.category_id,
        supplier_id: q.supplier_id,
        warehouse_id: q.warehouse_id ? parseInt(q.warehouse_id, 10) : undefined,
        is_active: (q.is_active ?? 'true') as 'true' | 'false' | 'all',
        low_stock: q.low_stock === 'true',
        page: q.page ? parseInt(q.page, 10) : 1,
        limit: q.limit ? parseInt(q.limit, 10) : 20,
      });
      return { success: true, ...result };
    }
  );

  // ─── Get by barcode — returns array (barcode NOT unique) ─────────────────
  // NOTE: این route باید قبل از /:id باشد
  fastify.get(
    '/api/products/barcode/:barcode',
    { onRequest: [fastify.authenticate] },
    async (request) => {
      const { barcode } = request.params as { barcode: string };
      const products = await svc.getProductsByBarcode(barcode);
      return { success: true, products };
    }
  );

  // ─── Export Excel template ───────────────────────────────────────────────
  fastify.get(
    '/api/products/export-template',
    { onRequest: [fastify.authenticate] },
    async (_request, reply) => {
      const categories = await dbAll<{ name: string }>('SELECT name FROM categories ORDER BY name ASC');
      const suppliers  = await dbAll<{ name: string }>('SELECT name FROM suppliers  ORDER BY name ASC');

      const catNames = categories.map((c) => c.name).join(' | ');
      const supNames = suppliers.map((s) => s.name).join(' | ');

      const header = [
        'اسم المنتج *',
        'الباركود',
        'الفئة',
        'المورد',
        'وحدة القياس',
        'سعر الشراء USD *',
        'سعر البيع تجزئة USD *',
        'سعر البيع جملة USD',
        'حد الجملة (كمية)',
        'الكمية المبدئية',
        'الحد الأدنى للمخزون',
        'تاريخ الانتهاء (YYYY-MM-DD أو DD/MM/YYYY أو MM/DD/YYYY)',
        'ملاحظات',
      ];

      const guide = [
        'مثال: زيت زيتون',
        'مثال: 6281234567890',
        catNames || 'مثال: مواد غذائية (سيُنشأ تلقائيًا إن لم يكن موجودًا)',
        supNames || 'أضف موردين أولاً',
        'قطعة | كغ | لتر | علبة | كرتون | حزمة | متر | دزينة',
        '5.50',
        '8.00',
        '7.00',
        '10',
        '100',
        '5',
        '2025-12-31',
        'أي ملاحظات اضافية',
      ];

      const ws = XLSX.utils.aoa_to_sheet([header, guide]);

      // Column widths
      ws['!cols'] = [
        { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
        { wch: 18 }, { wch: 20 }, { wch: 22 }, { wch: 22 },
        { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 24 }, { wch: 20 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'المنتجات');

      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      reply.header('Content-Disposition', 'attachment; filename="products_template.xlsx"');
      return reply.send(buf);
    }
  );

  // ─── Import products from Excel ──────────────────────────────────────────
    fastify.post(
    '/api/products/import',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ success: false, message: 'لم يتم إرسال ملف' });
      }

      const buf = await data.toBuffer();
      const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];

      if (rows.length < 2) {
        return reply.status(400).send({ success: false, message: 'الملف فارغ أو لا يحتوي على بيانات' });
      }

      const cats = await dbAll<{ id: number; name: string }>('SELECT id, name FROM categories');
      const sups = await dbAll<{ id: number; name: string }>('SELECT id, name FROM suppliers');

      const catMap = new Map(cats.map((c) => [normalizeLookup(c.name), Number(c.id)]));
      const supMap = new Map(sups.map((s) => [normalizeLookup(s.name), Number(s.id)]));

      let created = 0;
      const errors: string[] = [];

      const settingsRes = await pool.query<{ key: string; value: string }>(
        `SELECT key, value
         FROM settings
         WHERE key IN ('enable_multi_warehouse', 'default_sales_warehouse_id')`
      );

      const settingsMap = new Map(settingsRes.rows.map((row) => [row.key, row.value]));
      const isMultiWarehouseEnabled = settingsMap.get('enable_multi_warehouse') === 'true';

      const rawDefaultWarehouseId = String(settingsMap.get('default_sales_warehouse_id') ?? '').trim();
      const configuredDefaultWarehouseId = parseInt(rawDefaultWarehouseId, 10);

      let defaultWarehouseId: number | null = null;

      if (Number.isFinite(configuredDefaultWarehouseId) && configuredDefaultWarehouseId > 0) {
        const configuredWarehouse = await pool.query<{ id: number }>(
          `SELECT id
           FROM warehouses
           WHERE id = $1 AND is_active = TRUE
           LIMIT 1`,
          [configuredDefaultWarehouseId]
        );

        if (configuredWarehouse.rows[0]?.id) {
          defaultWarehouseId = Number(configuredWarehouse.rows[0].id);
        }
      }

      if (!defaultWarehouseId) {
        const mainWarehouse = await pool.query<{ id: number }>(
          `SELECT id
           FROM warehouses
           WHERE code = 'MAIN' AND is_active = TRUE
           ORDER BY id ASC
           LIMIT 1`
        );

        if (mainWarehouse.rows[0]?.id) {
          defaultWarehouseId = Number(mainWarehouse.rows[0].id);
        }
      }

      if (!defaultWarehouseId) {
        const fallbackWarehouse = await pool.query<{ id: number }>(
          `SELECT id
           FROM warehouses
           WHERE is_active = TRUE
           ORDER BY id ASC
           LIMIT 1`
        );

        if (fallbackWarehouse.rows[0]?.id) {
          defaultWarehouseId = Number(fallbackWarehouse.rows[0].id);
        }
      }

      const dataRows = rows.slice(2);

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 3;

        const name = String(row[0] ?? '').trim();
        const barcode = String(row[1] ?? '').trim() || null;
        const catName = String(row[2] ?? '').trim();
        const supName = String(row[3] ?? '').trim();
        const unit = String(row[4] ?? '').trim() || 'قطعة';

        const purchasePrice = parseNumberCell(row[5], 0);
        const retailPrice = parseNumberCell(row[6], 0);
        const wholesalePrice = parseOptionalNumberCell(row[7]);
        const wholesaleMinQ = parseNumberCell(row[8], 1);
        const initialStock = parseNumberCell(row[9], 0);
        const minStockLevel = parseNumberCell(row[10], 5);

        const expiryDate = parseExcelExpiryDate(row[11]);
        const notes = String(row[12] ?? '').trim() || null;

        if (!name) {
          continue;
        }

        if (name.length < 2) {
          errors.push(`السطر ${rowNum}: اسم المنتج مطلوب (حرفان على الأقل)`);
          continue;
        }

        if (purchasePrice < 0 || retailPrice < 0) {
          errors.push(`السطر ${rowNum} (${name}): الأسعار لا يمكن أن تكون سالبة`);
          continue;
        }

        if (hasMeaningfulCellValue(row[11]) && !expiryDate) {
          errors.push(
            `السطر ${rowNum} (${name}): تاريخ الصلاحية غير صالح. الصيغ المدعومة: YYYY-MM-DD أو DD/MM/YYYY أو MM/DD/YYYY أو تاريخ Excel`
          );
          continue;
        }

        let categoryId: number | null = null;
        let supplierId: number | null = null;

        try {
          categoryId = await resolveOrCreateCategoryId(catMap, catName);
          supplierId = await resolveExistingSupplierId(supMap, supName);
        } catch (err) {
          errors.push(`السطر ${rowNum} (${name}): ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
          continue;
        }

        try {
          const client = await pool.connect();

          try {
            await client.query('BEGIN');

            const res = await client.query<{ id: number }>(
              `INSERT INTO products
                (barcode, name, category_id, supplier_id, unit, is_weighted,
                 purchase_price, retail_price, wholesale_price, wholesale_min_qty,
                 stock_quantity, min_stock_level, expiry_date, notes, is_active, created_by)
               VALUES ($1,$2,$3,$4,$5,false,$6,$7,$8,$9,$10,$11,$12,$13,true,$14)
               RETURNING id`,
              [
                barcode,
                name,
                categoryId,
                supplierId,
                unit,
                purchasePrice,
                retailPrice,
                wholesalePrice && wholesalePrice > 0 ? wholesalePrice : null,
                wholesaleMinQ,
                0,
                minStockLevel,
                expiryDate ?? null,
                notes,
                request.user.id,
              ]
            );

            const productId = res.rows[0].id;

            if (initialStock > 0) {
              await recordStockMovement(client, {
                product_id: productId,
                movement_type: 'initial',
                quantity_change: initialStock,
                note: 'استيراد من Excel',
                created_by: request.user.id,
                suppress_low_stock_detection: true,
              });

              if (!defaultWarehouseId) {
                throw Object.assign(
                  new Error('لا يوجد مستودع نشط لتوزيع الكمية الافتتاحية المستوردة'),
                  { statusCode: 409 }
                );
              }

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
                [productId, defaultWarehouseId, initialStock]
              );
            }

            await client.query('COMMIT');
            created++;
          } catch (err) {
            await client.query('ROLLBACK');
            errors.push(`السطر ${rowNum} (${name}): ${err instanceof Error ? err.message : 'خطأ غير معروف'}`);
          } finally {
            client.release();
          }
        } catch {
          errors.push(`السطر ${rowNum} (${name}): فشل الاتصال بقاعدة البيانات`);
        }
      }

      return {
        success: true,
        created,
        errors,
        message: `تم استيراد ${created} منتج${created !== 1 ? 'اً' : ''}${errors.length ? ` مع ${errors.length} خطأ` : ' بنجاح'}`,
      };
    }
  );

    // ─── Warehouse stock distribution ───────────────────────────────────────
  fastify.get(
    '/api/products/:id/warehouse-stock',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const productId = parseInt(id, 10);

      if (!productId || Number.isNaN(productId)) {
        return reply.status(400).send({ success: false, message: 'معرف المنتج غير صالح' });
      }

      const product = await svc.getProductById(productId);
      if (!product) {
        return reply.status(404).send({ success: false, message: 'المنتج غير موجود' });
      }

      const result = await pool.query<{
        id: string | number;
        name: string;
        code: string | null;
        is_active: boolean;
        quantity: string;
      }>(
        `
        SELECT
          w.id,
          w.name,
          w.code,
          w.is_active,
          COALESCE(pws.quantity, 0) AS quantity
        FROM warehouses w
        LEFT JOIN product_warehouse_stock pws
          ON pws.warehouse_id = w.id
         AND pws.product_id = $1
        ORDER BY
          CASE WHEN w.code = 'MAIN' THEN 0 ELSE 1 END,
          w.is_active DESC,
          w.name ASC
        `,
        [productId]
      );

      const warehouses = result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
        code: row.code ?? null,
        is_active: !!row.is_active,
        quantity: String(row.quantity ?? '0'),
      }));

      return {
        success: true,
        product: {
          id: product.id,
          name: product.name,
          unit: product.unit,
          stock_quantity: product.stock_quantity,
        },
        warehouses,
      };
    }
  );

  // ─── Get single product ──────────────────────────────────────────────────
  fastify.get(
    '/api/products/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const product = await svc.getProductById(parseInt(id, 10));
      if (!product) return reply.status(404).send({ success: false, message: 'المنتج غير موجود' });
      return { success: true, product };
    }
  );

  // ─── Create product ──────────────────────────────────────────────────────
  fastify.post(
    '/api/products',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request, reply) => {
      const data = createProductSchema.parse(request.body);
      const product = await svc.createProduct({
        ...data,
        created_by: request.user.id,
      });
      auditLog({
        userId:     request.user.id,
        action:     'create',
        entityType: 'product',
        entityId:   Number(product.id),
        newData:    { name: product.name, barcode: product.barcode },
        ipAddress:  request.ip,
      }).catch(() => {});
      return reply.status(201).send({ success: true, product });
    }
  );

  // ─── Update product ──────────────────────────────────────────────────────
  fastify.put(
    '/api/products/:id',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const data = updateProductSchema.parse(request.body);
      const product = await svc.updateProduct(parseInt(id, 10), data);
      return { success: true, product };
    }
  );

  // ─── Toggle active (archive/restore) ────────────────────────────────────
  fastify.patch(
    '/api/products/:id/active',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const product = await svc.toggleActive(parseInt(id, 10));
      auditLog({
        userId:     request.user.id,
        action:     product.is_active ? 'activate' : 'deactivate',
        entityType: 'product',
        entityId:   parseInt(id, 10),
        newData:    { is_active: product.is_active, name: product.name },
        ipAddress:  request.ip,
      }).catch(() => {});
      return { success: true, product };
    }
  );

  // ─── Manual stock adjustment ─────────────────────────────────────────────
  fastify.patch(
    '/api/products/:id/stock',
    { onRequest: [fastify.authenticate, requireRole(ROLES.STOCK_TEAM)] },
    async (request) => {
      const { id } = request.params as { id: string };
      const { new_quantity, warehouse_id, note } = adjustStockSchema.parse(request.body);

      const product = await svc.adjustStock(parseInt(id, 10), {
        new_quantity,
        warehouse_id: warehouse_id ?? null,
        note,
        created_by: request.user.id,
      });

      return { success: true, product };
    }
  );

  // ─── Stock movement history ──────────────────────────────────────────────
  fastify.get(
    '/api/products/:id/movements',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_MANAGER)] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const product = await svc.getProductById(parseInt(id, 10));
      if (!product) return reply.status(404).send({ success: false, message: 'المنتج غير موجود' });

      const movements = await pool.query(
        `SELECT m.*, u.full_name AS created_by_name
         FROM product_stock_movements m
         LEFT JOIN users u ON u.id = m.created_by
         WHERE m.product_id = $1
         ORDER BY m.created_at DESC
         LIMIT 100`,
        [id]
      );

      return { success: true, movements: movements.rows };
    }
  );
}
