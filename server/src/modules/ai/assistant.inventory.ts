import { dbAll, dbGet } from '../../shared/db/pool.js';
import type {
  AssistantReply,
  NumericRow,
  ProductListRow,
  ProductLookupRow,
  ProductStockRow,
} from './assistant.types.js';
import {
  cleanSearchPhrase,
  escapeSql,
  formatNumber,
  hasAny,
  stripStandaloneTerms,
} from './assistant.utils.js';

async function tryDbGet<T>(queries: string[]): Promise<T | null> {
  for (const sql of queries) {
    try {
      const row = await dbGet<T>(sql);
      if (row) return row;
    } catch {
      // try next query
    }
  }
  return null;
}

async function tryDbAll<T>(queries: string[]): Promise<T[]> {
  for (const sql of queries) {
    try {
      const rows = await dbAll<T>(sql);
      if (rows) return rows;
    } catch {
      // try next query
    }
  }
  return [];
}

export async function countLowStockProducts() {
  const row = await tryDbGet<NumericRow>([
    `
      SELECT COUNT(*) AS value
      FROM products
      WHERE COALESCE(stock_quantity, 0) > 0
        AND COALESCE(min_stock_level, 0) > 0
        AND COALESCE(stock_quantity, 0) <= COALESCE(min_stock_level, 0)
    `,
  ]);

  return Number(row?.value || 0);
}

export async function countOutOfStockProducts() {
  const row = await tryDbGet<NumericRow>([
    `
      SELECT COUNT(*) AS value
      FROM products
      WHERE COALESCE(stock_quantity, 0) <= 0
    `,
  ]);

  return Number(row?.value || 0);
}

export async function getLowStockExampleRows(limit = 5): Promise<ProductStockRow[]> {
  return tryDbAll<ProductStockRow>([
    `
      SELECT
        name,
        stock_quantity,
        min_stock_level,
        unit
      FROM products
      WHERE COALESCE(stock_quantity, 0) > 0
        AND COALESCE(min_stock_level, 0) > 0
        AND COALESCE(stock_quantity, 0) <= COALESCE(min_stock_level, 0)
      ORDER BY COALESCE(stock_quantity, 0) ASC, name ASC
      LIMIT ${Math.max(1, Math.floor(limit))}
    `,
  ]);
}

export async function getOutOfStockExampleRows(limit = 5): Promise<ProductStockRow[]> {
  return tryDbAll<ProductStockRow>([
    `
      SELECT
        name,
        stock_quantity,
        min_stock_level,
        unit
      FROM products
      WHERE COALESCE(stock_quantity, 0) <= 0
      ORDER BY name ASC
      LIMIT ${Math.max(1, Math.floor(limit))}
    `,
  ]);
}

export async function buildLowStockReply(): Promise<AssistantReply> {
  const rows = await getLowStockExampleRows(15);

  if (!rows.length) {
    return {
      intent: 'low_stock',
      mode: 'fallback',
      text: 'لا توجد منتجات منخفضة المخزون حاليًا.',
    };
  }

  const lines = rows.map((item, index) => {
    const qty = Number(item.stock_quantity || 0);
    const min = Number(item.min_stock_level || 0);
    const unit = item.unit ? ` ${item.unit}` : '';

    return `${index + 1}. ${item.name} — المتوفر ${formatNumber(qty)}${unit} / الحد الأدنى ${formatNumber(min)}`;
  });

  return {
    intent: 'low_stock',
    mode: 'fallback',
    text: [`وجدت ${formatNumber(rows.length)} منتجًا منخفض المخزون:`, ...lines].join('\n'),
  };
}

export async function buildOutOfStockReply(): Promise<AssistantReply> {
  const rows = await getOutOfStockExampleRows(15);

  if (!rows.length) {
    return {
      intent: 'out_of_stock',
      mode: 'fallback',
      text: 'لا توجد منتجات نافدة من المخزون حاليًا.',
    };
  }

  const lines = rows.map((item, index) => {
    const min = Number(item.min_stock_level || 0);
    const unit = item.unit ? ` ${item.unit}` : '';

    return `${index + 1}. ${item.name} — المتوفر 0${unit}${min > 0 ? ` / الحد الأدنى ${formatNumber(min)}` : ''}`;
  });

  return {
    intent: 'out_of_stock',
    mode: 'fallback',
    text: [`وجدت ${formatNumber(rows.length)} منتجًا نافدًا من المخزون:`, ...lines].join('\n'),
  };
}

export async function buildAllProductsReply(): Promise<AssistantReply> {
  const rows = await tryDbAll<ProductListRow>([
    `
      SELECT
        name,
        barcode,
        stock_quantity,
        unit,
        is_active
      FROM products
      ORDER BY name ASC
      LIMIT 200
    `,
  ]);

  const totalRow = await tryDbGet<NumericRow>([
    `SELECT COUNT(*) AS value FROM products`,
  ]);

  const total = Number(totalRow?.value || 0);

  if (!rows.length) {
    return {
      intent: 'all_products',
      mode: 'fallback',
      text: 'لا توجد منتجات مسجلة حاليًا.',
    };
  }

  const lines = rows.map((item, index) => {
    const qty = Number(item.stock_quantity || 0);
    const unit = item.unit ? ` ${item.unit}` : '';
    const barcode = item.barcode ? ` | باركود: ${item.barcode}` : '';
    const active = item.is_active === false ? ' | مؤرشف' : '';

    return `${index + 1}. ${item.name} — ${formatNumber(qty)}${unit}${barcode}${active}`;
  });

  const header =
    total > rows.length
      ? `هذه أول ${rows.length} منتج من أصل ${total}:`
      : `قائمة المنتجات (${total}):`;

  return {
    intent: 'all_products',
    mode: 'fallback',
    text: [header, ...lines].join('\n'),
  };
}

export async function buildSlowMovingReply(): Promise<AssistantReply> {
  const rows = await tryDbAll<{
    name: string;
    stock_quantity: string | number;
    min_stock_level: string | number | null;
    unit: string | null;
    last_sale_at: string | null;
    days_since_last_sale: string | number | null;
  }>([
    `
      WITH last_sales AS (
        SELECT
          si.product_id,
          MAX(s.created_at) AS last_sale_at
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        GROUP BY si.product_id
      )
      SELECT
        p.name,
        p.stock_quantity,
        p.min_stock_level,
        p.unit,
        last_sales.last_sale_at,
        CASE
          WHEN last_sales.last_sale_at IS NULL THEN NULL
          ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - last_sales.last_sale_at)) / 86400)
        END AS days_since_last_sale
      FROM products p
      LEFT JOIN last_sales ON last_sales.product_id = p.id
      WHERE p.is_active = true
        AND COALESCE(p.stock_quantity, 0) > 0
        AND (
          last_sales.last_sale_at IS NULL
          OR last_sales.last_sale_at < NOW() - INTERVAL '30 days'
        )
      ORDER BY last_sales.last_sale_at ASC NULLS FIRST, COALESCE(p.stock_quantity, 0) DESC
      LIMIT 10
    `,
  ]);

  if (!rows.length) {
    return {
      intent: 'slow_moving',
      mode: 'fallback',
      text: 'لا توجد أصناف راكدة حاليًا حسب الشروط الحالية.',
    };
  }

  const lines = rows.map((row, index) => {
    const qty = Number(row.stock_quantity || 0);
    const min = Number(row.min_stock_level || 0);
    const unit = row.unit ? ` ${row.unit}` : '';
    const lastSaleText =
      row.days_since_last_sale == null
        ? 'لا يوجد بيع سابق'
        : `آخر بيع منذ ${formatNumber(Number(row.days_since_last_sale || 0))} يوم`;

    return `${index + 1}. ${row.name} — المتوفر ${formatNumber(qty)}${unit} / الحد ${formatNumber(min)} / ${lastSaleText}`;
  });

  return {
    intent: 'slow_moving',
    mode: 'fallback',
    text: ['الأصناف الراكدة أو البطيئة الحركة:', ...lines].join('\n'),
  };
}

export async function buildReorderSuggestionsReply(): Promise<AssistantReply> {
  const rows = await tryDbAll<{
    name: string;
    stock_quantity: string | number;
    min_stock_level: string | number | null;
    net_sold_30: string | number;
    days_left: string | number | null;
  }>([
    `
      WITH sold AS (
        SELECT
          si.product_id,
          COALESCE(SUM(si.quantity), 0) AS sold_qty
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        WHERE s.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY si.product_id
      ),
      returned AS (
        SELECT
          sri.product_id,
          COALESCE(SUM(sri.quantity), 0) AS returned_qty
        FROM sales_return_items sri
        JOIN sales_returns sr ON sr.id = sri.return_id
        WHERE sr.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY sri.product_id
      ),
      metrics AS (
        SELECT
          p.name,
          p.stock_quantity,
          p.min_stock_level,
          GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) AS net_sold_30,
          CASE
            WHEN GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) > 0
            THEN ROUND((
              p.stock_quantity /
              NULLIF(
                GREATEST(COALESCE(sold.sold_qty, 0) - COALESCE(returned.returned_qty, 0), 0) / 30.0,
                0
              )
            )::numeric, 1)
            ELSE NULL
          END AS days_left
        FROM products p
        LEFT JOIN sold ON sold.product_id = p.id
        LEFT JOIN returned ON returned.product_id = p.id
        WHERE p.is_active = true
      )
      SELECT
        name,
        stock_quantity,
        min_stock_level,
        net_sold_30,
        days_left
      FROM metrics
      WHERE COALESCE(stock_quantity, 0) <= COALESCE(min_stock_level, 0)
        AND COALESCE(net_sold_30, 0) > 0
      ORDER BY COALESCE(days_left, 999999) ASC, net_sold_30 DESC, stock_quantity ASC
      LIMIT 10
    `,
  ]);

  if (!rows.length) {
    return {
      intent: 'reorder_suggestions',
      mode: 'fallback',
      text: 'لا توجد اقتراحات شراء عاجلة حاليًا.',
    };
  }

  const lines = rows.map((row, index) => {
    const qty = Number(row.stock_quantity || 0);
    const min = Number(row.min_stock_level || 0);
    const sold = Number(row.net_sold_30 || 0);
    const daysLeft =
      row.days_left == null ? 'غير محسوب' : `${formatNumber(Number(row.days_left || 0))} يوم`;

    return `${index + 1}. ${row.name} — المتوفر ${formatNumber(qty)} / الحد ${formatNumber(min)} / مبيع 30 يوم ${formatNumber(sold)} / يكفي ${daysLeft}`;
  });

  return {
    intent: 'reorder_suggestions',
    mode: 'fallback',
    text: ['اقتراحات شراء حالية:', ...lines].join('\n'),
  };
}

function extractProductQuery(message: string, normalized: string, kind: 'price' | 'stock'): string {
  const source = String(message || '').trim();

  const pricePatterns = [
    /كم\s+سعر\s+(.+)$/i,
    /سعر\s+(.+)$/i,
    /بكم\s+(.+)$/i,
    /قديش\s+سعر\s+(.+)$/i,
  ];

  const stockPatterns = [
    /كم(?:ية)?\s+(.+)$/i,
    /رصيد\s+(.+)$/i,
    /مخزون\s+(.+)$/i,
    /المتوفر\s+من\s+(.+)$/i,
    /متوفر\s+من\s+(.+)$/i,
    /قديش\s+باقي\s+من\s+(.+)$/i,
  ];

  const patterns = kind === 'price' ? pricePatterns : stockPatterns;

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const candidate = cleanSearchPhrase(match?.[1] || '');
    if (candidate.length >= 2) return candidate;
  }

  const normalizedCandidate = cleanSearchPhrase(
    stripStandaloneTerms(normalized, [
      'كم',
      'سعر',
      'كم سعر',
      'بكم',
      'قديش',
      'مخزون',
      'رصيد',
      'المتوفر',
      'متوفر',
      'كمية',
      'قديش باقي',
      'من',
      'المنتج',
      'الصنف',
      'بضاعه',
      'بضاعة',
    ])
  );

  return normalizedCandidate;
}

async function findProductByQuery(query: string): Promise<ProductLookupRow | null> {
  const cleaned = cleanSearchPhrase(query);
  if (cleaned.length < 2) return null;

  const safe = escapeSql(cleaned);

  const barcodeRow = await tryDbGet<ProductLookupRow>([
    `
      SELECT
        id,
        name,
        barcode,
        stock_quantity,
        min_stock_level,
        unit,
        retail_price,
        wholesale_price,
        wholesale_min_qty,
        purchase_price,
        is_active
      FROM products
      WHERE barcode = '${safe}'
      ORDER BY is_active DESC, id DESC
      LIMIT 1
    `,
  ]);

  if (barcodeRow) return barcodeRow;

  const exactRow = await tryDbGet<ProductLookupRow>([
    `
      SELECT
        id,
        name,
        barcode,
        stock_quantity,
        min_stock_level,
        unit,
        retail_price,
        wholesale_price,
        wholesale_min_qty,
        purchase_price,
        is_active
      FROM products
      WHERE name ILIKE '%${safe}%'
      ORDER BY
        CASE
          WHEN LOWER(name) = LOWER('${safe}') THEN 0
          WHEN name ILIKE '${safe}%' THEN 1
          ELSE 2
        END,
        is_active DESC,
        id DESC
      LIMIT 1
    `,
  ]);

  if (exactRow) return exactRow;

  const tokens = cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
    .slice(0, 5);

  if (!tokens.length) return null;

  const conditions = tokens
    .map((token) => `name ILIKE '%${escapeSql(token)}%'`)
    .join(' AND ');

  return tryDbGet<ProductLookupRow>([
    `
      SELECT
        id,
        name,
        barcode,
        stock_quantity,
        min_stock_level,
        unit,
        retail_price,
        wholesale_price,
        wholesale_min_qty,
        purchase_price,
        is_active
      FROM products
      WHERE ${conditions}
      ORDER BY is_active DESC, id DESC
      LIMIT 1
    `,
  ]);
}

export async function buildProductPriceReply(
  message: string,
  normalized: string
): Promise<AssistantReply> {
  const query = extractProductQuery(message, normalized, 'price');

  if (!query) {
    return {
      intent: 'product_price',
      mode: 'fallback',
      text: 'اذكر اسم المنتج أو الباركود بعد كلمة السعر، مثل: سعر السكر أو كم سعر المنتج 12345',
    };
  }

  const product = await findProductByQuery(query);

  if (!product) {
    return {
      intent: 'product_price',
      mode: 'fallback',
      text: `لم أجد منتجًا مطابقًا لعبارة: ${query}`,
    };
  }

  const lines = [
    `تفاصيل السعر للمنتج: ${product.name}`,
    `• سعر المفرق: ${formatNumber(Number(product.retail_price || 0))} USD`,
  ];

  if (product.wholesale_price != null) {
    lines.push(
      `• سعر الجملة: ${formatNumber(Number(product.wholesale_price || 0))} USD` +
        (product.wholesale_min_qty != null
          ? ` (من ${formatNumber(Number(product.wholesale_min_qty || 0))} ${product.unit || ''})`
          : '')
    );
  }

  if (hasAny(normalized, 'شراء', 'تكلفه', 'تكلفة', 'راس المال', 'رأس المال')) {
    lines.push(`• سعر الشراء الداخلي: ${formatNumber(Number(product.purchase_price || 0))} USD`);
  }

  lines.push(
    `• المخزون الحالي: ${formatNumber(Number(product.stock_quantity || 0))}${product.unit ? ` ${product.unit}` : ''}`
  );

  if (product.is_active === false) {
    lines.push('• ملاحظة: هذا المنتج مؤرشف حاليًا.');
  }

  return {
    intent: 'product_price',
    mode: 'fallback',
    text: lines.join('\n'),
  };
}

export async function buildProductStockReply(
  message: string,
  normalized: string
): Promise<AssistantReply> {
  const query = extractProductQuery(message, normalized, 'stock');

  if (!query) {
    return {
      intent: 'product_stock',
      mode: 'fallback',
      text: 'اذكر اسم المنتج أو الباركود بعد سؤال المخزون، مثل: مخزون السكر أو كمية المنتج 12345',
    };
  }

  const product = await findProductByQuery(query);

  if (!product) {
    return {
      intent: 'product_stock',
      mode: 'fallback',
      text: `لم أجد منتجًا مطابقًا لعبارة: ${query}`,
    };
  }

  const qty = Number(product.stock_quantity || 0);
  const min = Number(product.min_stock_level || 0);
  const unit = product.unit ? ` ${product.unit}` : '';
  const status = qty <= 0 ? 'نافد' : min > 0 && qty <= min ? 'منخفض' : 'جيد';

  return {
    intent: 'product_stock',
    mode: 'fallback',
    text: [
      `رصيد المنتج: ${product.name}`,
      `• المتوفر الآن: ${formatNumber(qty)}${unit}`,
      `• الحد الأدنى: ${formatNumber(min)}${unit}`,
      `• الحالة: ${status}`,
      product.is_active === false ? '• ملاحظة: هذا المنتج مؤرشف حاليًا.' : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}