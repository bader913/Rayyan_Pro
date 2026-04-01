import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool, withTransaction } from '../../shared/db/pool.js';
import { requireRole, ROLES } from '../../shared/middleware/requireRole.js';
import type { PoolClient } from 'pg';

// ─── Password Verification ────────────────────────────────────────────────────
const verifySchema = z.object({
  password: z.string().min(1, 'كلمة المرور مطلوبة'),
});

async function verifyCurrentUser(request: { user: { id: number } }, password: string) {
  const client = await pool.connect();
  try {
    const res = await client.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [request.user.id]
    );

    if (!res.rows[0]) {
      throw Object.assign(new Error('المستخدم غير موجود'), { statusCode: 404 });
    }

    const ok = await bcrypt.compare(password, res.rows[0].password_hash);
    if (!ok) {
      throw Object.assign(new Error('كلمة المرور غير صحيحة'), { statusCode: 401 });
    }
  } finally {
    client.release();
  }
}

// ─── Default Settings ─────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: Record<string, string> = {
  shop_name: 'ريان برو',
  shop_phone: '',
  shop_address: '',
  receipt_footer: 'شكراً لزيارتكم',
  currency: 'USD',
  usd_to_syp: '1',
  usd_to_try: '1',
  usd_to_sar: '1',
  usd_to_aed: '1',
  low_stock_threshold: '5',
  enable_shifts: 'false',
  enable_multi_warehouse: 'false',
  show_usd: 'true',
  theme_color: '#059669',
  theme_mode: 'dark',

  // Customer Orders defaults
  customer_orders_enabled: 'true',
  customer_orders_web_enabled: 'true',
  customer_orders_telegram_enabled: 'false',
  customer_orders_telegram_link: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function tableExists(client: PoolClient, table: string): Promise<boolean> {
  const res = await client.query<{ regclass_name: string | null }>(
    'SELECT to_regclass($1) AS regclass_name',
    [`public.${table}`]
  );
  return !!res.rows[0]?.regclass_name;
}

async function selectAllIfExists(
  client: PoolClient,
  table: string,
  orderBy = 'id'
): Promise<Record<string, unknown>[]> {
  const exists = await tableExists(client, table);
  if (!exists) return [];

  const res = await client.query(
    `SELECT * FROM "${table}" ORDER BY ${orderBy}`
  );
  return res.rows as Record<string, unknown>[];
}

// dynamic INSERT preserving IDs
async function insertRows(client: PoolClient, table: string, rows: Record<string, unknown>[]) {
  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = Object.values(row);
    const ph = vals.map((_, i) => `$${i + 1}`).join(', ');

    await client.query(
      `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')})
       VALUES (${ph})
       ON CONFLICT DO NOTHING`,
      vals
    );
  }
}

async function insertRowsIfTableExists(
  client: PoolClient,
  table: string,
  rows: Record<string, unknown>[]
) {
  const exists = await tableExists(client, table);
  if (!exists) return;
  await insertRows(client, table, rows);
}

// Reset sequence for a table's id column after bulk insert
async function resetSeq(client: PoolClient, table: string) {
  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('${table}', 'id'),
      COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1,
      false
    )
  `);
}

async function resetSeqIfTableExists(client: PoolClient, table: string) {
  const exists = await tableExists(client, table);
  if (!exists) return;
  await resetSeq(client, table);
}

// ─── Clear EVERYTHING except users/settings/terminals defaults logic ─────────
async function clearCommercialData(client: PoolClient) {
  // أولًا: الجداول التابعة جدًا لتفادي مشاكل FK
  if (await tableExists(client, 'sales_return_items')) {
    await client.query('DELETE FROM sales_return_items');
  }

  if (await tableExists(client, 'sales_returns')) {
    await client.query('DELETE FROM sales_returns');
  }

  if (await tableExists(client, 'purchase_return_items')) {
    await client.query('DELETE FROM purchase_return_items');
  }

  if (await tableExists(client, 'stock_count_session_items')) {
    await client.query('DELETE FROM stock_count_session_items');
  }

  if (await tableExists(client, 'stock_count_sessions')) {
    await client.query('DELETE FROM stock_count_sessions');
  }

  if (await tableExists(client, 'stock_transfer_items')) {
    await client.query('DELETE FROM stock_transfer_items');
  }

  if (await tableExists(client, 'stock_transfers')) {
    await client.query('DELETE FROM stock_transfers');
  }

  if (await tableExists(client, 'customer_order_items')) {
    await client.query('DELETE FROM customer_order_items');
  }

  if (await tableExists(client, 'customer_orders')) {
    await client.query('DELETE FROM customer_orders');
  }

  if (await tableExists(client, 'telegram_customer_order_sessions')) {
    await client.query('DELETE FROM telegram_customer_order_sessions');
  }

  if (await tableExists(client, 'product_warehouse_stock')) {
    await client.query('DELETE FROM product_warehouse_stock');
  }

  if (await tableExists(client, 'purchase_returns')) {
    await client.query('DELETE FROM purchase_returns');
  }

  if (await tableExists(client, 'customer_bonus_transactions')) {
    await client.query('DELETE FROM customer_bonus_transactions');
  }

  // العمليات الأساسية
  if (await tableExists(client, 'sale_items')) {
    await client.query('DELETE FROM sale_items');
  }

  if (await tableExists(client, 'sales')) {
    await client.query('DELETE FROM sales');
  }

  if (await tableExists(client, 'purchase_items')) {
    await client.query('DELETE FROM purchase_items');
  }

  if (await tableExists(client, 'purchases')) {
    await client.query('DELETE FROM purchases');
  }

  if (await tableExists(client, 'customer_account_transactions')) {
    await client.query('DELETE FROM customer_account_transactions');
  }

  if (await tableExists(client, 'supplier_account_transactions')) {
    await client.query('DELETE FROM supplier_account_transactions');
  }

  if (await tableExists(client, 'product_stock_movements')) {
    await client.query('DELETE FROM product_stock_movements');
  }

  if (await tableExists(client, 'audit_logs')) {
    await client.query('DELETE FROM audit_logs');
  }

  if (await tableExists(client, 'expenses')) {
    await client.query('DELETE FROM expenses');
  }

  // الورديات غالبًا مرتبطة بالمستخدم/الترمينال
  if (await tableExists(client, 'shifts')) {
    await client.query('DELETE FROM shifts');
  }

  // البيانات الرئيسية التجارية
  if (await tableExists(client, 'products')) {
    await client.query('DELETE FROM products');
  }

  if (await tableExists(client, 'categories')) {
    await client.query('DELETE FROM categories');
  }

  if (await tableExists(client, 'customers')) {
    await client.query('DELETE FROM customers');
  }

  if (await tableExists(client, 'suppliers')) {
    await client.query('DELETE FROM suppliers');
  }

  // تصفير تسلسل أرقام الفواتير إن وجد
  if (await tableExists(client, 'invoice_sequences')) {
    await client.query('UPDATE invoice_sequences SET last_number = 0');
  }
}

async function clearImportScopeData(client: PoolClient) {
  await clearCommercialData(client);

  // أثناء الاستعادة فقط نبدّل الترمينالات أيضًا لتطابق النسخة
  if (await tableExists(client, 'pos_terminals')) {
    await client.query('DELETE FROM pos_terminals');
  }

  // وفي الاستعادة فقط نعيد المستودعات نفسها لتطابق النسخة الاحتياطية
  if (await tableExists(client, 'warehouses')) {
    await client.query('DELETE FROM warehouses');
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────
export async function adminRoutes(fastify: FastifyInstance) {
  // ── POST /api/admin/backup ─────────────────────────────────────────────────
  fastify.post(
    '/api/admin/backup',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const body = verifySchema.parse(request.body);
      await verifyCurrentUser(request as never, body.password);

      const client = await pool.connect();
      try {
        const [
          settings,
          categories,
          suppliers,
          products,
          warehouses,
          productWarehouseStock,
          stockCountSessions,
          stockCountSessionItems,
          stockTransfers,
          stockTransferItems,
          customers,
          customerOrders,
          customerOrderItems,
          telegramCustomerOrderSessions,
          expenses,
          terminals,
          shifts,
          sales,
          saleItems,
          purchases,
          purchaseItems,
          salesReturns,
          salesReturnItems,
          purchaseReturns,
          purchaseReturnItems,
          customerBonusTransactions,
          customerAccountTransactions,
          supplierAccountTransactions,
          stockMoves,
          sequences,
        ] = await Promise.all([
          selectAllIfExists(client, 'settings', 'key'),
          selectAllIfExists(client, 'categories'),
          selectAllIfExists(client, 'suppliers'),
          selectAllIfExists(client, 'products'),
          selectAllIfExists(client, 'warehouses'),
          selectAllIfExists(client, 'product_warehouse_stock'),
          selectAllIfExists(client, 'stock_count_sessions'),
          selectAllIfExists(client, 'stock_count_session_items'),
          selectAllIfExists(client, 'stock_transfers'),
          selectAllIfExists(client, 'stock_transfer_items'),
          selectAllIfExists(client, 'customers'),
          selectAllIfExists(client, 'customer_orders'),
          selectAllIfExists(client, 'customer_order_items'),
          selectAllIfExists(client, 'telegram_customer_order_sessions'),
          selectAllIfExists(client, 'expenses'),
          selectAllIfExists(client, 'pos_terminals'),
          selectAllIfExists(client, 'shifts'),
          selectAllIfExists(client, 'sales'),
          selectAllIfExists(client, 'sale_items'),
          selectAllIfExists(client, 'purchases'),
          selectAllIfExists(client, 'purchase_items'),
          selectAllIfExists(client, 'sales_returns'),
          selectAllIfExists(client, 'sales_return_items'),
          selectAllIfExists(client, 'purchase_returns'),
          selectAllIfExists(client, 'purchase_return_items'),
          selectAllIfExists(client, 'customer_bonus_transactions'),
          selectAllIfExists(client, 'customer_account_transactions'),
          selectAllIfExists(client, 'supplier_account_transactions'),
          selectAllIfExists(client, 'product_stock_movements'),
          selectAllIfExists(client, 'invoice_sequences', 'prefix'),
        ]);

        const backup = {
          version: '1.3',
          created_at: new Date().toISOString(),
          data: {
            settings,
            categories,
            suppliers,
            products,
            warehouses,
            product_warehouse_stock: productWarehouseStock,
            stock_count_sessions: stockCountSessions,
            stock_count_session_items: stockCountSessionItems,
            stock_transfers: stockTransfers,
            stock_transfer_items: stockTransferItems,
            customers,
            customer_orders: customerOrders,
            customer_order_items: customerOrderItems,
            telegram_customer_order_sessions: telegramCustomerOrderSessions,
            pos_terminals: terminals,
            shifts,
            sales,
            sale_items: saleItems,
            purchases,
            purchase_items: purchaseItems,
            sales_returns: salesReturns,
            sales_return_items: salesReturnItems,
            purchase_returns: purchaseReturns,
            purchase_return_items: purchaseReturnItems,
            customer_bonus_transactions: customerBonusTransactions,
            customer_account_transactions: customerAccountTransactions,
            supplier_account_transactions: supplierAccountTransactions,
            product_stock_movements: stockMoves,
            invoice_sequences: sequences,
            expenses,
          },
        };

        const json = JSON.stringify(backup, null, 2);
        const date = new Date().toISOString().slice(0, 10);
        const filename = `rayyan-backup-${date}.json`;

        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);
        return reply.send(json);
      } finally {
        client.release();
      }
    }
  );

  // ── POST /api/admin/import — استيراد نسخة احتياطية ──────────────────────
  fastify.post(
    '/api/admin/import',
    {
      onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)],
      bodyLimit: 52_428_800, // 50 MB
    },
        async (request, reply) => {
      try {
        const { password, backup } = request.body as {
          password: string;
          backup: Record<string, unknown>;
        };

        if (!password) {
          throw Object.assign(new Error('كلمة المرور مطلوبة'), { statusCode: 400 });
        }

        if (!backup || !backup.data) {
          throw Object.assign(new Error('ملف النسخة غير صحيح'), { statusCode: 400 });
        }

        await verifyCurrentUser(request as never, password);

        const d = backup.data as Record<string, Record<string, unknown>[]>;

        await withTransaction(async (client) => {
          // 1 — مسح البيانات الحالية الواقعة ضمن نطاق النسخة
          await clearImportScopeData(client);

          // 2 — استيراد البيانات الرئيسية بالترتيب الصحيح
          await insertRowsIfTableExists(client, 'categories', d.categories ?? []);
          await insertRowsIfTableExists(client, 'suppliers', d.suppliers ?? []);
          await insertRowsIfTableExists(client, 'customers', d.customers ?? []);
          await insertRowsIfTableExists(client, 'pos_terminals', d.pos_terminals ?? []);
          await insertRowsIfTableExists(client, 'warehouses', d.warehouses ?? []);
          await insertRowsIfTableExists(client, 'products', d.products ?? []);
          await insertRowsIfTableExists(client, 'product_warehouse_stock', d.product_warehouse_stock ?? []);
          await insertRowsIfTableExists(client, 'stock_count_sessions', d.stock_count_sessions ?? []);
          await insertRowsIfTableExists(client, 'stock_count_session_items', d.stock_count_session_items ?? []);
          await insertRowsIfTableExists(client, 'shifts', d.shifts ?? []);

                  // 3 — طلبات الزبائن أولًا لكن بدون converted_to_sale_id مؤقتًا
          const customerOrdersRaw = (d.customer_orders ?? []) as Record<string, unknown>[];

          const customerOrdersWithoutConvertedSale = customerOrdersRaw.map((row) => ({
            ...row,
            converted_to_sale_id: null,
          }));

          await insertRowsIfTableExists(
            client,
            'customer_orders',
            customerOrdersWithoutConvertedSale
          );

          await insertRowsIfTableExists(client, 'customer_order_items', d.customer_order_items ?? []);
          await insertRowsIfTableExists(
            client,
            'telegram_customer_order_sessions',
            d.telegram_customer_order_sessions ?? []
          );

          // 4 — استيراد العمليات الأساسية بعد وجود الطلبات
          await insertRowsIfTableExists(client, 'sales', d.sales ?? []);
          await insertRowsIfTableExists(client, 'sale_items', d.sale_items ?? []);
          await insertRowsIfTableExists(client, 'purchases', d.purchases ?? []);
          await insertRowsIfTableExists(client, 'purchase_items', d.purchase_items ?? []);

          // 4.5 — إعادة ربط الطلبات المحوّلة بالمبيعات بعد استيراد sales
          if (await tableExists(client, 'customer_orders')) {
            for (const row of customerOrdersRaw) {
              const orderId = Number(row.id ?? 0) || 0;
              const convertedToSaleId =
                row.converted_to_sale_id === null || row.converted_to_sale_id === undefined
                  ? null
                  : Number(row.converted_to_sale_id);

              if (!orderId || !convertedToSaleId) continue;

              await client.query(
                `
                UPDATE customer_orders
                SET
                  converted_to_sale_id = $2,
                  updated_at = NOW()
                WHERE id = $1
                `,
                [orderId, convertedToSaleId]
              );
            }
          }

          // 5 — استيراد المرتجعات
          await insertRowsIfTableExists(client, 'sales_returns', d.sales_returns ?? []);
          await insertRowsIfTableExists(client, 'sales_return_items', d.sales_return_items ?? []);
          await insertRowsIfTableExists(client, 'purchase_returns', d.purchase_returns ?? []);
          await insertRowsIfTableExists(client, 'purchase_return_items', d.purchase_return_items ?? []);

          // 6 — استيراد الحركات المحاسبية والبونص
          await insertRowsIfTableExists(client, 'customer_bonus_transactions', d.customer_bonus_transactions ?? []);
          await insertRowsIfTableExists(client, 'customer_account_transactions', d.customer_account_transactions ?? []);
          await insertRowsIfTableExists(client, 'supplier_account_transactions', d.supplier_account_transactions ?? []);

          // 7 — بقية البيانات التشغيلية
          await insertRowsIfTableExists(client, 'stock_transfers', d.stock_transfers ?? []);
          await insertRowsIfTableExists(client, 'stock_transfer_items', d.stock_transfer_items ?? []);
          await insertRowsIfTableExists(client, 'expenses', d.expenses ?? []);
          await insertRowsIfTableExists(client, 'product_stock_movements', d.product_stock_movements ?? []);

          // 8 — الإعدادات (upsert)
          if (await tableExists(client, 'settings')) {
            for (const row of (d.settings ?? []) as { key: string; value: string }[]) {
              await client.query(
                `INSERT INTO settings (key, value, updated_at)
                 VALUES ($1, $2, NOW())
                 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
                [row.key, row.value]
              );
            }
          }

          // 9 — تسلسلات الفواتير (upsert)
          if (await tableExists(client, 'invoice_sequences')) {
            for (const row of (d.invoice_sequences ?? []) as { prefix: string; last_number: number }[]) {
              await client.query(
                `INSERT INTO invoice_sequences (prefix, last_number)
                 VALUES ($1, $2)
                 ON CONFLICT (prefix) DO UPDATE SET last_number = $2`,
                [row.prefix, row.last_number]
              );
            }
          }

          // 10 — إعادة ضبط sequences
          const seqTables = [
            'categories',
            'suppliers',
            'customers',
            'pos_terminals',
            'warehouses',
            'products',
            'product_warehouse_stock',
            'stock_count_sessions',
            'stock_count_session_items',
            'shifts',
            'customer_orders',
            'customer_order_items',
            'telegram_customer_order_sessions',
            'sales',
            'sale_items',
            'purchases',
            'purchase_items',
            'sales_returns',
            'sales_return_items',
            'purchase_returns',
            'purchase_return_items',
            'stock_transfers',
            'stock_transfer_items',
            'customer_bonus_transactions',
            'customer_account_transactions',
            'supplier_account_transactions',
            'product_stock_movements',
            'expenses',
          ];

          for (const t of seqTables) {
            await resetSeqIfTableExists(client, t);
          }
        });

        return reply.status(200).send({
          success: true,
          message: 'تمت استعادة النسخة الاحتياطية بنجاح',
          counts: {
            categories: (d.categories ?? []).length,
            products: (d.products ?? []).length,
            warehouses: (d.warehouses ?? []).length,
            stock_count_sessions: (d.stock_count_sessions ?? []).length,
            stock_transfers: (d.stock_transfers ?? []).length,
            customers: (d.customers ?? []).length,
            customer_orders: (d.customer_orders ?? []).length,
            customer_order_items: (d.customer_order_items ?? []).length,
            telegram_customer_order_sessions: (d.telegram_customer_order_sessions ?? []).length,
            sales: (d.sales ?? []).length,
            purchases: (d.purchases ?? []).length,
            purchase_returns: (d.purchase_returns ?? []).length,
            customer_bonus_transactions: (d.customer_bonus_transactions ?? []).length,
          },
        });
      } catch (error: any) {
        console.error('ADMIN IMPORT FAILED:', error);
        return reply.status(error?.statusCode || 500).send({
          success: false,
          message: error?.message || 'فشل استيراد النسخة الاحتياطية',
          detail: error?.detail || null,
        });
      }
    }
  );

  // ── POST /api/admin/clear ──────────────────────────────────────────────────
  fastify.post(
    '/api/admin/clear',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const body = verifySchema.parse(request.body);
      await verifyCurrentUser(request as never, body.password);

      await withTransaction(async (client) => {
        await clearCommercialData(client);

        // في التصفير الكامل: نحذف كل المستودعات القديمة ثم نعيد MAIN فقط
        if (await tableExists(client, 'warehouses')) {
          await client.query('DELETE FROM warehouses');

          await client.query(
            `
            INSERT INTO warehouses (
              code,
              name,
              is_active,
              created_at,
              updated_at
            )
            VALUES ('MAIN', 'المستودع الرئيسي', TRUE, NOW(), NOW())
            `
          );
        }
      });

      return reply.status(200).send({
        success: true,
        message: 'تم مسح البيانات التجارية بنجاح مع إعادة تهيئة المستودع الرئيسي الافتراضي',
      });
    }
  );

  // ── POST /api/admin/restore-defaults ──────────────────────────────────────
  fastify.post(
    '/api/admin/restore-defaults',
    { onRequest: [fastify.authenticate, requireRole(ROLES.ADMIN_ONLY)] },
    async (request, reply) => {
      const body = verifySchema.parse(request.body);
      await verifyCurrentUser(request as never, body.password);

      const client = await pool.connect();
      try {
        for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
          await client.query(
            `INSERT INTO settings (key, value, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
            [key, value]
          );
        }
      } finally {
        client.release();
      }

      return reply.status(200).send({
        success: true,
        message: 'تمت استعادة الإعدادات الافتراضية',
      });
    }
  );
}