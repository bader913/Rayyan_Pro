import { pool, withTransaction } from '../../shared/db/pool.js';
import { generateInvoiceNumber } from '../../shared/utils/invoiceNumber.js';
import {
  getRatesFromSettings,
  getRateFromUSD,
  type CurrencyCode,
  type ExchangeRates,
} from '../../shared/utils/currency.js';

const SUPPORTED_CURRENCIES: CurrencyCode[] = ['USD', 'SYP', 'TRY', 'SAR', 'AED'];

type OrderStatus = 'new' | 'reviewed' | 'converted' | 'cancelled';
type OrderPaymentMethod = 'cash_on_delivery' | 'sham_cash';

export interface PublicCatalogProduct {
  id: number;
  name: string;
  unit: string;
  retail_price: string;
  image_url: string | null;
  available_quantity: string;
}

export interface PublicCreateOrderInput {
  customer_name: string;
  recipient_name?: string | null;
  phone?: string | null;
  notes?: string | null;
  payment_method: OrderPaymentMethod;
  currency_code: CurrencyCode;
  items: Array<{
    product_id: number;
    quantity: number;
  }>;
}

export interface ListCustomerOrdersFilters {
  q?: string;
  status?: OrderStatus | 'all';
  source?: 'all' | 'web' | 'telegram';
  page?: number;
  limit?: number;
}

type CustomerOrderListRow = {
  id: number;
  order_number: string;
  source: string;
  status: OrderStatus;
  customer_name: string;
  recipient_name: string | null;
  phone: string | null;
  payment_method: OrderPaymentMethod;
  currency_code: CurrencyCode;
  exchange_rate: string;
  subtotal_usd: string;
  total_usd: string;
  warehouse_id: number | null;
  warehouse_name: string | null;
  converted_to_sale_id: number | null;
  items_count: string;
  created_at: string;
  reviewed_at: string | null;
  converted_at: string | null;
};

type CustomerOrderRow = {
  id: number;
  order_number: string;
  source: string;
  status: OrderStatus;
  customer_name: string;
  recipient_name: string | null;
  phone: string | null;
  notes: string | null;
  payment_method: OrderPaymentMethod;
  currency_code: CurrencyCode;
  exchange_rate: string;
  subtotal_usd: string;
  total_usd: string;
  customer_id: number | null;
  warehouse_id: number | null;
  warehouse_name: string | null;
  converted_to_sale_id: number | null;
  cancel_reason: string | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  converted_at: string | null;
};

type CustomerOrderItemRow = {
  id: number;
  order_id: number;
  product_id: number;
  product_name_snapshot: string;
  unit_snapshot: string;
  image_url_snapshot: string | null;
  quantity: string;
  unit_price_usd: string;
  line_total_usd: string;
  created_at: string;
};
type CancelTelegramNotification = {
  chatId: string;
  message: string;
  notes: string | null;
  notifiedAtIso: string;
};

type ResolvedWarehouse = {
  id: number;
  name: string;
  code: string | null;
};
type TelegramParsedOrderInput = {
  customer_name: string;
  recipient_name: string | null;
  phone: string | null;
  notes: string | null;
  payment_method: OrderPaymentMethod;
  currency_code: CurrencyCode;
  items: Array<{
    product_name: string;
    quantity: number;
  }>;
  telegram_update_id: number;
  telegram_chat_id: string;
  telegram_username: string | null;
};

export class CustomerOrdersService {
  private async getSettingsMap(client: import('pg').PoolClient): Promise<Record<string, string>> {
    const settingsRes = await client.query<{ key: string; value: string }>(
      `
      SELECT key, value
      FROM settings
            WHERE key IN (
        'currency',
        'usd_to_syp',
        'usd_to_try',
        'usd_to_sar',
        'usd_to_aed',
        'default_sales_warehouse_id',
        'customer_orders_enabled',
        'customer_orders_web_enabled',
        'customer_orders_telegram_enabled',
        'customer_orders_telegram_link',
        'telegram_bot_token'
      )
      `
    );

    return Object.fromEntries(settingsRes.rows.map((row) => [row.key, row.value ?? '']));
  }

    private extractInternalTag(notes: string | null | undefined, tag: string) {
    const source = String(notes ?? '');
    const match = source.match(new RegExp(`^\\[${tag}:([^\\]]*)\\]$`, 'm'));
    return match?.[1]?.trim() || null;
  }

  private stripInternalNotes(notes: string | null | undefined) {
    const cleaned = String(notes ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0 &&
          !/^\[(?:TG_[A-Z0-9_]+|DELIVERY_[A-Z0-9_]+|DELIVERED_[A-Z0-9_]+):.*\]$/.test(line)
      )
      .join('\n')
      .trim();

    return cleaned || null;
  }

  private appendInternalTags(
    notes: string | null | undefined,
    tags: Record<string, string | number | null | undefined>
  ) {
    const currentLines = String(notes ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter(
        (line) =>
          !Object.keys(tags).some((tag) => new RegExp(`^\\[${tag}:.*\\]$`).test(line))
      );

    const nextLines = [
      ...currentLines,
      ...Object.entries(tags)
        .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
        .map(([tag, value]) => `[${tag}:${String(value).trim()}]`),
    ];

    return nextLines.join('\n');
  }

  private formatTelegramDateTime(date: Date) {
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private async sendTelegramBotText(
    client: import('pg').PoolClient,
    chatId: string,
    text: string
  ) {
    const settings = await this.getSettingsMap(client);
    const token = String(settings.telegram_bot_token ?? '').trim();

    if (!token) {
      throw Object.assign(new Error('توكن بوت تيليغرام غير مضبوط في الإعدادات'), {
        statusCode: 409,
      });
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });

    const data: any = await res.json().catch(() => null);

    if (!res.ok || !data?.ok) {
      throw Object.assign(
        new Error(data?.description || 'تعذر إرسال رسالة تيليغرام'),
        { statusCode: 502 }
      );
    }
  }
    private async ensurePublicWebOrdersEnabled(client: import('pg').PoolClient) {
    const settings = await this.getSettingsMap(client);

    const ordersEnabled =
      String(settings.customer_orders_enabled ?? 'true').trim().toLowerCase() === 'true';

    const webEnabled =
      String(settings.customer_orders_web_enabled ?? 'true').trim().toLowerCase() === 'true';

    if (!ordersEnabled || !webEnabled) {
      throw Object.assign(new Error('قناة الطلب عبر الويب غير مفعلة حاليًا'), {
        statusCode: 403,
      });
    }
  }

  private async resolveOrdersWarehouse(client: import('pg').PoolClient): Promise<ResolvedWarehouse> {
    const settings = await this.getSettingsMap(client);

    const configuredDefaultWarehouseId = (() => {
      const raw = String(settings.default_sales_warehouse_id ?? '').trim();
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    })();

    if (configuredDefaultWarehouseId) {
      const configuredWarehouse = await client.query<{
        id: number;
        name: string;
        code: string | null;
        is_active: boolean;
      }>(
        `
        SELECT id, name, code, is_active
        FROM warehouses
        WHERE id = $1
        LIMIT 1
        `,
        [configuredDefaultWarehouseId]
      );

      if (configuredWarehouse.rows[0]?.is_active) {
        return {
          id: configuredWarehouse.rows[0].id,
          name: configuredWarehouse.rows[0].name,
          code: configuredWarehouse.rows[0].code,
        };
      }
    }

    const mainWarehouse = await client.query<{
      id: number;
      name: string;
      code: string | null;
    }>(
      `
      SELECT id, name, code
      FROM warehouses
      WHERE code = 'MAIN' AND is_active = TRUE
      ORDER BY id ASC
      LIMIT 1
      `
    );

    if (mainWarehouse.rows[0]) {
      return mainWarehouse.rows[0];
    }

    const fallbackWarehouse = await client.query<{
      id: number;
      name: string;
      code: string | null;
    }>(
      `
      SELECT id, name, code
      FROM warehouses
      WHERE is_active = TRUE
      ORDER BY id ASC
      LIMIT 1
      `
    );

    if (fallbackWarehouse.rows[0]) {
      return fallbackWarehouse.rows[0];
    }

    throw Object.assign(new Error('لا يوجد مستودع نشط صالح لطلبات الأوردر'), {
      statusCode: 409,
    });
  }

  private async getCurrencyMeta(client: import('pg').PoolClient): Promise<{
    default_currency: CurrencyCode;
    rates: ExchangeRates;
  }> {
    const settings = await this.getSettingsMap(client);
    const rates = getRatesFromSettings(settings);
    const rawCurrency = String(settings.currency ?? 'USD').trim().toUpperCase() as CurrencyCode;
    const default_currency = SUPPORTED_CURRENCIES.includes(rawCurrency) ? rawCurrency : 'USD';

    return { default_currency, rates };
  }

  async getPublicCatalog() {
    const client = await pool.connect();

    try {
      await this.ensurePublicWebOrdersEnabled(client);

      const settings = await this.getSettingsMap(client);
      const warehouse = await this.resolveOrdersWarehouse(client);
      const currency = await this.getCurrencyMeta(client);

      const channels = {
        orders_enabled:
          String(settings.customer_orders_enabled ?? 'true').trim().toLowerCase() === 'true',
        web_enabled:
          String(settings.customer_orders_web_enabled ?? 'true').trim().toLowerCase() === 'true',
        telegram_enabled:
          String(settings.customer_orders_telegram_enabled ?? 'false').trim().toLowerCase() === 'true',
        telegram_link: String(settings.customer_orders_telegram_link ?? '').trim() || null,
      };

      const result = await client.query<PublicCatalogProduct>(
        `
        SELECT
          p.id,
          p.name,
          p.unit,
          p.retail_price,
          p.image_url,
          COALESCE(pws.quantity, 0) AS available_quantity
        FROM products p
        JOIN product_warehouse_stock pws
          ON pws.product_id = p.id
         AND pws.warehouse_id = $1
        WHERE
          p.is_active = TRUE
          AND COALESCE(pws.quantity, 0) > 0
        ORDER BY p.name ASC
        `,
        [warehouse.id]
      );

      return {
        warehouse,
        currency,
        channels,
        products: result.rows,
      };
    } finally {
      client.release();
    }
  }

  async createPublicOrder(input: PublicCreateOrderInput) {
    if (input.items.length === 0) {
      throw Object.assign(new Error('السلة فارغة'), { statusCode: 400 });
    }

    if (!SUPPORTED_CURRENCIES.includes(input.currency_code)) {
      throw Object.assign(new Error('العملة المختارة غير مدعومة'), { statusCode: 400 });
    }

    let orderId = 0;

    await withTransaction(async (client) => {
      await this.ensurePublicWebOrdersEnabled(client);

      const warehouse = await this.resolveOrdersWarehouse(client);
      const currencyMeta = await this.getCurrencyMeta(client);
      const exchangeRate = getRateFromUSD(input.currency_code, currencyMeta.rates);

      const requestedQtyByProduct = new Map<number, number>();

      for (const item of input.items) {
        if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
          throw Object.assign(new Error('الكمية يجب أن تكون أكبر من صفر'), { statusCode: 400 });
        }

        requestedQtyByProduct.set(
          item.product_id,
          (requestedQtyByProduct.get(item.product_id) ?? 0) + Number(item.quantity)
        );
      }

      const productIds = Array.from(requestedQtyByProduct.keys());

      const productsRes = await client.query<{
        id: number;
        name: string;
        unit: string;
        image_url: string | null;
        retail_price: string;
        available_quantity: string;
      }>(
        `
        SELECT
          p.id,
          p.name,
          p.unit,
          p.image_url,
          p.retail_price,
          COALESCE(pws.quantity, 0) AS available_quantity
        FROM products p
        JOIN product_warehouse_stock pws
          ON pws.product_id = p.id
         AND pws.warehouse_id = $1
        WHERE
          p.id = ANY($2::bigint[])
          AND p.is_active = TRUE
        `,
        [warehouse.id, productIds]
      );

      const productsMap = new Map(productsRes.rows.map((row) => [row.id, row]));

      for (const [productId, requestedQty] of requestedQtyByProduct.entries()) {
        const product = productsMap.get(productId);

        if (!product) {
          throw Object.assign(new Error(`المنتج رقم ${productId} غير موجود أو غير متاح للطلب`), {
            statusCode: 404,
          });
        }

        const availableQty = parseFloat(String(product.available_quantity ?? 0));

        if (availableQty + 0.000001 < requestedQty) {
          throw Object.assign(
            new Error(`الكمية المطلوبة غير متوفرة للمنتج "${product.name}"`),
            { statusCode: 409 }
          );
        }
      }

      const normalizedItems = Array.from(requestedQtyByProduct.entries()).map(([productId, quantity]) => {
        const product = productsMap.get(productId)!;
        const unitPriceUsd = parseFloat(product.retail_price);
        const lineTotalUsd = quantity * unitPriceUsd;

        return {
          product_id: productId,
          product_name_snapshot: product.name,
          unit_snapshot: product.unit,
          image_url_snapshot: product.image_url,
          quantity,
          unit_price_usd: unitPriceUsd,
          line_total_usd: lineTotalUsd,
        };
      });

           orderId = await this.createOrderFromResolvedProducts(client, {
        source: 'web',
        warehouse,
        currency_code: input.currency_code,
        payment_method: input.payment_method,
        customer_name: input.customer_name,
        recipient_name: input.recipient_name ?? null,
        phone: input.phone ?? null,
        notes: input.notes ?? null,
        normalizedItems,
      });
    });

    return this.getOrderById(orderId);
  }
    private async createOrderFromResolvedProducts(
    client: import('pg').PoolClient,
    params: {
      source: 'web' | 'telegram';
      warehouse: ResolvedWarehouse;
      currency_code: CurrencyCode;
      payment_method: OrderPaymentMethod;
      customer_name: string;
      recipient_name?: string | null;
      phone?: string | null;
      notes?: string | null;
      normalizedItems: Array<{
        product_id: number;
        product_name_snapshot: string;
        unit_snapshot: string;
        image_url_snapshot: string | null;
        quantity: number;
        unit_price_usd: number;
        line_total_usd: number;
      }>;
    }
  ) {
    const currencyMeta = await this.getCurrencyMeta(client);
    const exchangeRate = getRateFromUSD(params.currency_code, currencyMeta.rates);

    const subtotalUsd = params.normalizedItems.reduce((sum, item) => sum + item.line_total_usd, 0);
    const totalUsd = subtotalUsd;

    const orderNumber = await generateInvoiceNumber(client, 'ORD');

    const insertOrderRes = await client.query<{ id: number }>(
      `
      INSERT INTO customer_orders (
        order_number,
        source,
        status,
        customer_name,
        recipient_name,
        phone,
        notes,
        payment_method,
        currency_code,
        exchange_rate,
        subtotal_usd,
        total_usd,
        warehouse_id
      )
      VALUES (
        $1, $2, 'new',
        $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12
      )
      RETURNING id
      `,
      [
        orderNumber,
        params.source,
        params.customer_name.trim(),
        params.recipient_name?.trim() || null,
        params.phone?.trim() || null,
        params.notes?.trim() || null,
        params.payment_method,
        params.currency_code,
        exchangeRate,
        subtotalUsd,
        totalUsd,
        params.warehouse.id,
      ]
    );

    const orderId = insertOrderRes.rows[0].id;

    for (const item of params.normalizedItems) {
      await client.query(
        `
        INSERT INTO customer_order_items (
          order_id,
          product_id,
          product_name_snapshot,
          unit_snapshot,
          image_url_snapshot,
          quantity,
          unit_price_usd,
          line_total_usd
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          orderId,
          item.product_id,
          item.product_name_snapshot,
          item.unit_snapshot,
          item.image_url_snapshot,
          item.quantity,
          item.unit_price_usd,
          item.line_total_usd,
        ]
      );
    }

    return orderId;
  }

  async createTelegramOrderFromParsed(input: TelegramParsedOrderInput) {
    if (input.items.length === 0) {
      throw Object.assign(new Error('لا توجد أصناف صالحة في رسالة تيليغرام'), { statusCode: 400 });
    }

    if (!SUPPORTED_CURRENCIES.includes(input.currency_code)) {
      throw Object.assign(new Error('العملة غير مدعومة في طلب تيليغرام'), { statusCode: 400 });
    }

    let orderId = 0;

    await withTransaction(async (client) => {
      const duplicateRes = await client.query<{ id: number }>(
        `
        SELECT id
        FROM customer_orders
        WHERE source = 'telegram'
          AND notes ILIKE $1
        ORDER BY id DESC
        LIMIT 1
        `,
        [`%[TG_UPDATE_ID:${input.telegram_update_id}]%`]
      );

      if (duplicateRes.rows[0]?.id) {
        orderId = duplicateRes.rows[0].id;
        return;
      }

      const warehouse = await this.resolveOrdersWarehouse(client);

      const requestedQtyByName = new Map<string, number>();

      for (const item of input.items) {
        const name = String(item.product_name ?? '').trim();
        const quantity = Number(item.quantity ?? 0);

        if (!name) continue;
        if (!Number.isFinite(quantity) || quantity <= 0) continue;

        requestedQtyByName.set(name, (requestedQtyByName.get(name) ?? 0) + quantity);
      }

      const normalizedItems: Array<{
        product_id: number;
        product_name_snapshot: string;
        unit_snapshot: string;
        image_url_snapshot: string | null;
        quantity: number;
        unit_price_usd: number;
        line_total_usd: number;
      }> = [];

      for (const [productName, quantity] of requestedQtyByName.entries()) {
        const exactRes = await client.query<{
          id: number;
          name: string;
          unit: string;
          image_url: string | null;
          retail_price: string;
          available_quantity: string;
        }>(
          `
          SELECT
            p.id,
            p.name,
            p.unit,
            p.image_url,
            p.retail_price,
            COALESCE(pws.quantity, 0) AS available_quantity
          FROM products p
          JOIN product_warehouse_stock pws
            ON pws.product_id = p.id
           AND pws.warehouse_id = $1
          WHERE
            p.is_active = TRUE
            AND LOWER(TRIM(p.name)) = LOWER(TRIM($2))
          LIMIT 1
          `,
          [warehouse.id, productName]
        );

        const fallbackRes =
          exactRes.rows[0]
            ? exactRes
            : await client.query<{
                id: number;
                name: string;
                unit: string;
                image_url: string | null;
                retail_price: string;
                available_quantity: string;
              }>(
                `
                SELECT
                  p.id,
                  p.name,
                  p.unit,
                  p.image_url,
                  p.retail_price,
                  COALESCE(pws.quantity, 0) AS available_quantity
                FROM products p
                JOIN product_warehouse_stock pws
                  ON pws.product_id = p.id
                 AND pws.warehouse_id = $1
                WHERE
                  p.is_active = TRUE
                  AND p.name ILIKE $2
                ORDER BY p.name ASC
                LIMIT 1
                `,
                [warehouse.id, productName]
              );

        const product = fallbackRes.rows[0];

        if (!product) {
          throw Object.assign(new Error(`المنتج "${productName}" غير موجود أو غير متاح`), {
            statusCode: 404,
          });
        }

        const availableQty = parseFloat(String(product.available_quantity ?? 0));
        if (availableQty + 0.000001 < quantity) {
          throw Object.assign(
            new Error(`الكمية المطلوبة غير متوفرة للمنتج "${product.name}"`),
            { statusCode: 409 }
          );
        }

        const unitPriceUsd = parseFloat(String(product.retail_price ?? 0));
        normalizedItems.push({
          product_id: product.id,
          product_name_snapshot: product.name,
          unit_snapshot: product.unit,
          image_url_snapshot: product.image_url,
          quantity,
          unit_price_usd: unitPriceUsd,
          line_total_usd: quantity * unitPriceUsd,
        });
      }

      const metaNotes = [
        input.notes?.trim() || '',
        `[TG_UPDATE_ID:${input.telegram_update_id}]`,
        `[TG_CHAT_ID:${input.telegram_chat_id}]`,
        input.telegram_username ? `[TG_USERNAME:${input.telegram_username}]` : '',
      ]
        .filter(Boolean)
        .join('\n');

      orderId = await this.createOrderFromResolvedProducts(client, {
        source: 'telegram',
        warehouse,
        currency_code: input.currency_code,
        payment_method: input.payment_method,
        customer_name: input.customer_name,
        recipient_name: input.recipient_name,
        phone: input.phone,
        notes: metaNotes,
        normalizedItems,
      });
    });

    return this.getOrderById(orderId);
  }
    async getTelegramOrderCategories() {
    const client = await pool.connect();

    try {
      const warehouse = await this.resolveOrdersWarehouse(client);

      const result = await client.query<{
        id: number;
        name: string;
        products_count: string;
      }>(
        `
        SELECT
          c.id,
          c.name,
          COUNT(DISTINCT p.id)::text AS products_count
        FROM categories c
        JOIN products p
          ON p.category_id = c.id
         AND p.is_active = TRUE
        JOIN product_warehouse_stock pws
          ON pws.product_id = p.id
         AND pws.warehouse_id = $1
        WHERE COALESCE(pws.quantity, 0) > 0
        GROUP BY c.id, c.name
        ORDER BY c.name ASC
        `,
        [warehouse.id]
      );

      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        products_count: Number(row.products_count || 0),
      }));
    } finally {
      client.release();
    }
  }

  async getTelegramOrderProductsByCategory(params: {
    category_id: number;
    page?: number;
    limit?: number;
  }) {
    const client = await pool.connect();

    try {
      const warehouse = await this.resolveOrdersWarehouse(client);
      const actualLimit = Math.min(Math.max(1, params.limit ?? 8), 12);
      const page = Math.max(1, params.page ?? 1);
      const offset = (page - 1) * actualLimit;

      const countRes = await client.query<{ count: string }>(
        `
        SELECT COUNT(*)::bigint AS count
        FROM products p
        JOIN product_warehouse_stock pws
          ON pws.product_id = p.id
         AND pws.warehouse_id = $1
        WHERE
          p.category_id = $2
          AND p.is_active = TRUE
          AND COALESCE(pws.quantity, 0) > 0
        `,
        [warehouse.id, params.category_id]
      );

      const total = Number(countRes.rows[0]?.count || 0);

      const result = await client.query<{
        id: number;
        name: string;
        unit: string;
        retail_price: string;
        available_quantity: string;
      }>(
        `
        SELECT
          p.id,
          p.name,
          p.unit,
          p.retail_price,
          COALESCE(pws.quantity, 0) AS available_quantity
        FROM products p
        JOIN product_warehouse_stock pws
          ON pws.product_id = p.id
         AND pws.warehouse_id = $1
        WHERE
          p.category_id = $2
          AND p.is_active = TRUE
          AND COALESCE(pws.quantity, 0) > 0
        ORDER BY p.name ASC
        LIMIT $3 OFFSET $4
        `,
        [warehouse.id, params.category_id, actualLimit, offset]
      );

      return {
        items: result.rows,
        pagination: {
          total,
          page,
          limit: actualLimit,
          pages: Math.max(1, Math.ceil(total / actualLimit)),
        },
      };
    } finally {
      client.release();
    }
  }

  async getTelegramOrderProductById(productId: number) {
    const client = await pool.connect();

    try {
      const warehouse = await this.resolveOrdersWarehouse(client);

      const result = await client.query<{
        id: number;
        name: string;
        unit: string;
        retail_price: string;
        available_quantity: string;
        category_id: number | null;
      }>(
        `
        SELECT
          p.id,
          p.name,
          p.unit,
          p.retail_price,
          COALESCE(pws.quantity, 0) AS available_quantity,
          p.category_id
        FROM products p
        JOIN product_warehouse_stock pws
          ON pws.product_id = p.id
         AND pws.warehouse_id = $1
        WHERE
          p.id = $2
          AND p.is_active = TRUE
          AND COALESCE(pws.quantity, 0) > 0
        LIMIT 1
        `,
        [warehouse.id, productId]
      );

      return result.rows[0] ?? null;
    } finally {
      client.release();
    }
  }

  async listOrders(filters: ListCustomerOrdersFilters) {
    const {
      q,
      status = 'all',
      source = 'all',
      page = 1,
      limit = 20,
    } = filters;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (status !== 'all') {
      conditions.push(`o.status = $${idx++}`);
      values.push(status);
    }

    if (source === 'web') {
      conditions.push(`o.source IN ('web', 'telegram_web')`);
    } else if (source === 'telegram') {
      conditions.push(`o.source = $${idx++}`);
      values.push('telegram');
    }

    if (q && q.trim()) {
      conditions.push(`
        (
          o.order_number ILIKE $${idx}
          OR o.customer_name ILIKE $${idx}
          OR COALESCE(o.recipient_name, '') ILIKE $${idx}
          OR COALESCE(o.phone, '') ILIKE $${idx}
        )
      `);
      values.push(`%${q.trim()}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await pool.query<{ count: string }>(
      `
      SELECT COUNT(*)::bigint AS count
      FROM customer_orders o
      ${where}
      `,
      values
    );

    const total = parseInt(countRes.rows[0]?.count ?? '0', 10);
    const actualLimit = Math.min(Math.max(1, limit), 100);
    const offset = (Math.max(1, page) - 1) * actualLimit;

    const result = await pool.query<CustomerOrderListRow>(
      `
      SELECT
        o.id,
        o.order_number,
        o.source,
        o.status,
        o.customer_name,
        o.recipient_name,
        o.phone,
        o.payment_method,
        o.currency_code,
        o.exchange_rate,
        o.subtotal_usd,
        o.total_usd,
        o.warehouse_id,
        w.name AS warehouse_name,
        o.converted_to_sale_id,
        COUNT(oi.id)::text AS items_count,
        o.created_at,
        o.reviewed_at,
        o.converted_at
      FROM customer_orders o
      LEFT JOIN customer_order_items oi ON oi.order_id = o.id
      LEFT JOIN warehouses w ON w.id = o.warehouse_id
      ${where}
      GROUP BY o.id, w.name
      ORDER BY o.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}
      `,
      [...values, actualLimit, offset]
    );

    return {
      orders: result.rows,
      pagination: {
        total,
        page: Math.max(1, page),
        limit: actualLimit,
        pages: Math.ceil(total / actualLimit),
      },
    };
  }

    async getOrderById(id: number) {
    const orderRes = await pool.query<CustomerOrderRow>(
      `
      SELECT
        o.id,
        o.order_number,
        o.source,
        o.status,
        o.customer_name,
        o.recipient_name,
        o.phone,
        o.notes,
        o.payment_method,
        o.currency_code,
        o.exchange_rate,
        o.subtotal_usd,
        o.total_usd,
        o.customer_id,
        o.warehouse_id,
        w.name AS warehouse_name,
        o.converted_to_sale_id,
        o.cancel_reason,
        o.created_by,
        o.created_at,
        o.updated_at,
        o.reviewed_at,
        o.converted_at
      FROM customer_orders o
      LEFT JOIN warehouses w ON w.id = o.warehouse_id
      WHERE o.id = $1
      LIMIT 1
      `,
      [id]
    );

    const order = orderRes.rows[0];
    if (!order) return null;

    const itemsRes = await pool.query<CustomerOrderItemRow>(
      `
      SELECT
        id,
        order_id,
        product_id,
        product_name_snapshot,
        unit_snapshot,
        image_url_snapshot,
        quantity,
        unit_price_usd,
        line_total_usd,
        created_at
      FROM customer_order_items
      WHERE order_id = $1
      ORDER BY id ASC
      `,
      [id]
    );

    let convertedSaleInvoiceNumber: string | null = null;

    if (order.converted_to_sale_id) {
      const saleRes = await pool.query<{ invoice_number: string | null }>(
        `
        SELECT invoice_number
        FROM sales
        WHERE id = $1
        LIMIT 1
        `,
        [order.converted_to_sale_id]
      );

      convertedSaleInvoiceNumber = saleRes.rows[0]?.invoice_number ?? null;
    }

    const rawNotes = order.notes;

    return {
      ...order,
      notes: this.stripInternalNotes(rawNotes),
      telegram_chat_id: this.extractInternalTag(rawNotes, 'TG_CHAT_ID'),
      delivered_at: this.extractInternalTag(rawNotes, 'DELIVERED_AT'),
      delivery_notified_at: this.extractInternalTag(rawNotes, 'TG_DELIVERY_NOTIFIED_AT'),
      cancel_notified_at: this.extractInternalTag(rawNotes, 'TG_CANCEL_NOTIFIED_AT'),
      last_manual_message_at: this.extractInternalTag(rawNotes, 'TG_LAST_MANUAL_MESSAGE_AT'),
      converted_sale_invoice_number: convertedSaleInvoiceNumber,
      items: itemsRes.rows,
    };
  }
  async notifyTelegramOrderDelivered(id: number, actorUserId?: number | null) {
    return withTransaction(async (client) => {
      const orderRes = await client.query<{
        id: number;
        order_number: string;
        source: string;
        status: OrderStatus;
        notes: string | null;
        converted_to_sale_id: number | null;
      }>(
        `
        SELECT
          id,
          order_number,
          source,
          status,
          notes,
          converted_to_sale_id
        FROM customer_orders
        WHERE id = $1
        LIMIT 1
        `,
        [id]
      );

      const order = orderRes.rows[0];

      if (!order) {
        throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });
      }

      if (String(order.source || '').trim().toLowerCase() !== 'telegram') {
        throw Object.assign(new Error('إشعار التسليم متاح فقط لطلبات تيليغرام'), {
          statusCode: 409,
        });
      }

      if (order.status !== 'converted' || !order.converted_to_sale_id) {
        throw Object.assign(new Error('لا يمكن إشعار الزبون قبل تحويل الطلب إلى بيع فعلي'), {
          statusCode: 409,
        });
      }

      const chatId = this.extractInternalTag(order.notes, 'TG_CHAT_ID');
      if (!chatId) {
        throw Object.assign(new Error('لا يوجد Chat ID محفوظ لهذا الطلب'), {
          statusCode: 409,
        });
      }

      const alreadyNotifiedAt = this.extractInternalTag(order.notes, 'TG_DELIVERY_NOTIFIED_AT');
      if (alreadyNotifiedAt) {
        throw Object.assign(new Error('تم إرسال إشعار التسليم لهذا الطلب سابقًا'), {
          statusCode: 409,
        });
      }

      const saleRes = await client.query<{ invoice_number: string | null }>(
        `
        SELECT invoice_number
        FROM sales
        WHERE id = $1
        LIMIT 1
        `,
        [order.converted_to_sale_id]
      );

      const invoiceNumber = saleRes.rows[0]?.invoice_number ?? null;
      const now = new Date();
      const nowIso = now.toISOString();

      const message = [
        '✅ تم تسليم طلبك بنجاح',
        `رقم الطلب: ${order.order_number}`,
        invoiceNumber ? `رقم الفاتورة: ${invoiceNumber}` : null,
        `التاريخ والوقت: ${this.formatTelegramDateTime(now)}`,
      ]
        .filter(Boolean)
        .join('\n');

      await this.sendTelegramBotText(client, chatId, message);

      const nextNotes = this.appendInternalTags(order.notes, {
        DELIVERED_AT: nowIso,
        TG_DELIVERY_NOTIFIED_AT: nowIso,
        TG_DELIVERY_NOTIFIED_BY: actorUserId ?? null,
      });

      await client.query(
        `
        UPDATE customer_orders
        SET
          notes = $1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [nextNotes, id]
      );

      return this.getOrderById(id);
    });
  }
    async sendTelegramOrderNote(
    id: number,
    message: string,
    actorUserId?: number | null
  ) {
    const normalizedMessage = String(message ?? '').trim();

    if (!normalizedMessage) {
      throw Object.assign(new Error('نص الرسالة مطلوب'), { statusCode: 400 });
    }

    if (normalizedMessage.length > 100) {
      throw Object.assign(new Error('الرسالة يجب ألا تتجاوز 100 حرف'), {
        statusCode: 400,
      });
    }

    return withTransaction(async (client) => {
      const orderRes = await client.query<{
        id: number;
        order_number: string;
        source: string;
        notes: string | null;
      }>(
        `
        SELECT id, order_number, source, notes
        FROM customer_orders
        WHERE id = $1
        LIMIT 1
        `,
        [id]
      );

      const order = orderRes.rows[0];

      if (!order) {
        throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });
      }

      if (String(order.source || '').trim().toLowerCase() !== 'telegram') {
        throw Object.assign(new Error('المراسلة متاحة فقط لطلبات تيليغرام'), {
          statusCode: 409,
        });
      }

      const chatId = this.extractInternalTag(order.notes, 'TG_CHAT_ID');

      if (!chatId) {
        throw Object.assign(new Error('لا يوجد Chat ID محفوظ لهذا الطلب'), {
          statusCode: 409,
        });
      }

      const nowIso = new Date().toISOString();

      const telegramText = [
        `📩 رسالة بخصوص طلبك ${order.order_number}`,
        normalizedMessage,
      ].join('\n');

      await this.sendTelegramBotText(client, chatId, telegramText);

      const nextNotes = this.appendInternalTags(order.notes, {
        TG_LAST_MANUAL_MESSAGE_AT: nowIso,
        TG_LAST_MANUAL_MESSAGE_BY: actorUserId ?? null,
      });

      await client.query(
        `
        UPDATE customer_orders
        SET
          notes = $1,
          updated_at = NOW()
        WHERE id = $2
        `,
        [nextNotes, id]
      );

      return this.getOrderById(id);
    });
  }
    async updateOrderStatus(
    id: number,
    input: {
      status: 'new' | 'reviewed' | 'cancelled';
      cancel_reason?: string | null;
    }
  ) {
    let cancelTelegramNotification: CancelTelegramNotification | null = null;

    await withTransaction(async (client) => {
      const existing = await client.query<{
        id: number;
        order_number: string;
        source: string;
        status: OrderStatus;
        converted_to_sale_id: number | null;
        reviewed_at: string | null;
        notes: string | null;
      }>(
        `
        SELECT id, order_number, source, status, converted_to_sale_id, reviewed_at, notes
        FROM customer_orders
        WHERE id = $1
        LIMIT 1
        `,
        [id]
      );

      const order = existing.rows[0];

      if (!order) {
        throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });
      }

      if (order.status === 'converted' || order.converted_to_sale_id) {
        throw Object.assign(new Error('تم تحويل هذا الطلب سابقًا ولا يمكن تعديل حالته يدويًا'), {
          statusCode: 409,
        });
      }

      const normalizedCancelReason =
        input.status === 'cancelled'
          ? String(input.cancel_reason ?? '').trim()
          : null;

      if (input.status === 'cancelled' && !normalizedCancelReason) {
        throw Object.assign(new Error('سبب الإلغاء مطلوب عند إلغاء الطلب'), {
          statusCode: 400,
        });
      }

      await client.query(
        `
        UPDATE customer_orders
        SET
          status = $1,
          cancel_reason = $2,
          reviewed_at = CASE
            WHEN $1 = 'reviewed' AND reviewed_at IS NULL THEN NOW()
            ELSE reviewed_at
          END,
          updated_at = NOW()
        WHERE id = $3
        `,
        [
          input.status,
          input.status === 'cancelled' ? normalizedCancelReason : null,
          id,
        ]
      );

      if (input.status === 'cancelled' && String(order.source || '').trim().toLowerCase() === 'telegram') {
        const chatId = this.extractInternalTag(order.notes, 'TG_CHAT_ID');
        const alreadyNotifiedAt = this.extractInternalTag(order.notes, 'TG_CANCEL_NOTIFIED_AT');

        if (chatId && !alreadyNotifiedAt) {
          const now = new Date();
          const notifiedAtIso = now.toISOString();

          cancelTelegramNotification = {
            chatId,
            notes: order.notes,
            notifiedAtIso,
            message: [
              '❌ تم إلغاء طلبك',
              `رقم الطلب: ${order.order_number}`,
              `التاريخ والوقت: ${this.formatTelegramDateTime(now)}`,
              normalizedCancelReason ? `سبب الإلغاء: ${normalizedCancelReason}` : null,
            ]
              .filter(Boolean)
              .join('\n'),
          };
        }
      }
    });

    if (cancelTelegramNotification !== null) {
      const notification: CancelTelegramNotification = cancelTelegramNotification;

      try {
        const client = await pool.connect();
        try {
          await this.sendTelegramBotText(
            client,
            notification.chatId,
            notification.message
          );
        } finally {
          client.release();
        }

        const nextNotes = this.appendInternalTags(notification.notes, {
          TG_CANCEL_NOTIFIED_AT: notification.notifiedAtIso,
        });

        await pool.query(
          `
          UPDATE customer_orders
          SET
            notes = $1,
            updated_at = NOW()
          WHERE id = $2
          `,
          [nextNotes, id]
        );
      } catch (error) {
        console.error('Failed to send Telegram cancel notification:', error);
      }
    }

    return this.getOrderById(id);
  }
}