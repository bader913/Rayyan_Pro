import type pg from 'pg';
import { pool, withTransaction } from '../../shared/db/pool.js';
import { recordStockMovement } from '../../shared/services/stockMovements.service.js';
import {
    sendLowStockTelegramAlert,
    type LowStockTransitionEvent,
} from '../notifications/lowStockAlerts.service.js';

export interface StockCountSessionListItem {
    id: number;
    session_number: string;
    warehouse_id: number;
    warehouse_name: string;
    status: 'draft' | 'posted';
    notes: string | null;
    created_by: number | null;
    posted_by: number | null;
    created_at: string;
    updated_at: string;
    posted_at: string | null;
    items_count: number;
    total_difference_quantity: number;
}

export interface StockCountSessionItem {
    id: number;
    product_id: number;
    product_name: string;
    barcode: string | null;
    unit: string | null;
    system_quantity: number;
    counted_quantity: number;
    difference_quantity: number;
    created_at: string;
    updated_at: string;
}

export interface StockCountSessionDetails extends StockCountSessionListItem {
    items: StockCountSessionItem[];
}

export interface CreateStockCountSessionInput {
    warehouse_id?: number | null;
    notes?: string | null;
}

export interface UpsertStockCountSessionItemInput {
    product_id: number;
    counted_quantity: number;
}

type SessionRow = {
    id: string | number;
    session_number: string;
    warehouse_id: string | number;
    warehouse_name: string;
    status: 'draft' | 'posted';
    notes: string | null;
    created_by: string | number | null;
    posted_by: string | number | null;
    created_at: string | Date;
    updated_at: string | Date;
    posted_at: string | Date | null;
    items_count: string | number | null;
    total_difference_quantity: string | number | null;
};

type SessionItemRow = {
    id: string | number;
    product_id: string | number;
    product_name: string;
    barcode: string | null;
    unit: string | null;
    system_quantity: string | number;
    counted_quantity: string | number;
    difference_quantity: string | number;
    created_at: string | Date;
    updated_at: string | Date;
};

const EPSILON = 0.0001;

function toIso(value: string | Date | null): string | null {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : String(value);
}

function mapSessionRow(row: SessionRow): StockCountSessionListItem {
    return {
        id: Number(row.id),
        session_number: row.session_number,
        warehouse_id: Number(row.warehouse_id),
        warehouse_name: row.warehouse_name,
        status: row.status,
        notes: row.notes ?? null,
        created_by: row.created_by == null ? null : Number(row.created_by),
        posted_by: row.posted_by == null ? null : Number(row.posted_by),
        created_at: toIso(row.created_at)!,
        updated_at: toIso(row.updated_at)!,
        posted_at: toIso(row.posted_at),
        items_count: Number(row.items_count ?? 0),
        total_difference_quantity: parseFloat(String(row.total_difference_quantity ?? 0)),
    };
}

function mapSessionItemRow(row: SessionItemRow): StockCountSessionItem {
    return {
        id: Number(row.id),
        product_id: Number(row.product_id),
        product_name: row.product_name,
        barcode: row.barcode ?? null,
        unit: row.unit ?? null,
        system_quantity: parseFloat(String(row.system_quantity ?? 0)),
        counted_quantity: parseFloat(String(row.counted_quantity ?? 0)),
        difference_quantity: parseFloat(String(row.difference_quantity ?? 0)),
        created_at: toIso(row.created_at)!,
        updated_at: toIso(row.updated_at)!,
    };
}

function nearlyEqual(a: number, b: number): boolean {
    return Math.abs(a - b) <= EPSILON;
}

function buildSessionNumber(): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const rand = String(Math.floor(100000 + Math.random() * 900000));
    return `SC-${yyyy}${mm}${dd}-${rand}`;
}

async function resolveOperationalWarehouse(
    client: pg.PoolClient,
    preferredWarehouseId?: number | null
): Promise<{ warehouseId: number; warehouseName: string }> {
    const settingsRes = await client.query<{ key: string; value: string }>(
        `
    SELECT key, value
    FROM settings
    WHERE key IN ('enable_multi_warehouse', 'default_sales_warehouse_id')
    `
    );

    const settingsMap = new Map<string, string>(
        settingsRes.rows.map((row) => [row.key, row.value])
    );

    const isMultiWarehouseEnabled = settingsMap.get('enable_multi_warehouse') === 'true';

    const rawDefaultWarehouseId = String(
        settingsMap.get('default_sales_warehouse_id') ?? ''
    ).trim();
    const parsedDefaultWarehouseId = parseInt(rawDefaultWarehouseId, 10);
    const configuredDefaultWarehouseId =
        Number.isFinite(parsedDefaultWarehouseId) && parsedDefaultWarehouseId > 0
            ? parsedDefaultWarehouseId
            : null;

    if (isMultiWarehouseEnabled) {
        if (!preferredWarehouseId) {
            throw Object.assign(
                new Error('يجب تحديد المستودع عند تفعيل نظام المستودعات المتعددة'),
                { statusCode: 400 }
            );
        }

        const warehouseRes = await client.query<{
            id: string | number;
            name: string;
            is_active: boolean;
        }>(
            `
      SELECT id, name, is_active
      FROM warehouses
      WHERE id = $1
      FOR UPDATE
      `,
            [preferredWarehouseId]
        );

        if (!warehouseRes.rows[0]) {
            throw Object.assign(new Error('المستودع المحدد غير موجود'), { statusCode: 404 });
        }

        if (!warehouseRes.rows[0].is_active) {
            throw Object.assign(new Error('المستودع المحدد غير نشط'), { statusCode: 409 });
        }

        return {
            warehouseId: Number(warehouseRes.rows[0].id),
            warehouseName: warehouseRes.rows[0].name,
        };
    }

    if (configuredDefaultWarehouseId) {
        const defaultWarehouseRes = await client.query<{
            id: string | number;
            name: string;
            is_active: boolean;
        }>(
            `
      SELECT id, name, is_active
      FROM warehouses
      WHERE id = $1
      FOR UPDATE
      `,
            [configuredDefaultWarehouseId]
        );

        if (defaultWarehouseRes.rows[0]?.is_active) {
            return {
                warehouseId: Number(defaultWarehouseRes.rows[0].id),
                warehouseName: defaultWarehouseRes.rows[0].name,
            };
        }
    }

    const mainWarehouseRes = await client.query<{
        id: string | number;
        name: string;
    }>(
        `
    SELECT id, name
    FROM warehouses
    WHERE code = 'MAIN' AND is_active = TRUE
    ORDER BY id ASC
    LIMIT 1
    `
    );

    if (mainWarehouseRes.rows[0]) {
        return {
            warehouseId: Number(mainWarehouseRes.rows[0].id),
            warehouseName: mainWarehouseRes.rows[0].name,
        };
    }

    const fallbackWarehouseRes = await client.query<{
        id: string | number;
        name: string;
    }>(
        `
    SELECT id, name
    FROM warehouses
    WHERE is_active = TRUE
    ORDER BY id ASC
    LIMIT 1
    `
    );

    if (!fallbackWarehouseRes.rows[0]) {
        throw Object.assign(new Error('لا يوجد مستودع نشط لإنشاء جلسة الجرد'), {
            statusCode: 409,
        });
    }

    return {
        warehouseId: Number(fallbackWarehouseRes.rows[0].id),
        warehouseName: fallbackWarehouseRes.rows[0].name,
    };
}

export async function listStockCountSessions(
    status?: 'draft' | 'posted'
): Promise<StockCountSessionListItem[]> {
    const params: unknown[] = [];
    let whereClause = '';

    if (status) {
        params.push(status);
        whereClause = 'WHERE scs.status = $1';
    }

    const res = await pool.query<SessionRow>(
        `
    SELECT
      scs.id,
      scs.session_number,
      scs.warehouse_id,
      w.name AS warehouse_name,
      scs.status,
      scs.notes,
      scs.created_by,
      scs.posted_by,
      scs.created_at,
      scs.updated_at,
      scs.posted_at,
      COUNT(sci.id) AS items_count,
      COALESCE(SUM(sci.difference_quantity), 0) AS total_difference_quantity
    FROM stock_count_sessions scs
    JOIN warehouses w ON w.id = scs.warehouse_id
    LEFT JOIN stock_count_session_items sci ON sci.session_id = scs.id
    ${whereClause}
    GROUP BY
      scs.id,
      scs.session_number,
      scs.warehouse_id,
      w.name,
      scs.status,
      scs.notes,
      scs.created_by,
      scs.posted_by,
      scs.created_at,
      scs.updated_at,
      scs.posted_at
    ORDER BY scs.created_at DESC, scs.id DESC
    `,
        params
    );

    return res.rows.map(mapSessionRow);
}

export async function getStockCountSessionById(
    id: number
): Promise<StockCountSessionDetails> {
    const headerRes = await pool.query<SessionRow>(
        `
    SELECT
      scs.id,
      scs.session_number,
      scs.warehouse_id,
      w.name AS warehouse_name,
      scs.status,
      scs.notes,
      scs.created_by,
      scs.posted_by,
      scs.created_at,
      scs.updated_at,
      scs.posted_at,
      COUNT(sci.id) AS items_count,
      COALESCE(SUM(sci.difference_quantity), 0) AS total_difference_quantity
    FROM stock_count_sessions scs
    JOIN warehouses w ON w.id = scs.warehouse_id
    LEFT JOIN stock_count_session_items sci ON sci.session_id = scs.id
    WHERE scs.id = $1
    GROUP BY
      scs.id,
      scs.session_number,
      scs.warehouse_id,
      w.name,
      scs.status,
      scs.notes,
      scs.created_by,
      scs.posted_by,
      scs.created_at,
      scs.updated_at,
      scs.posted_at
    `,
        [id]
    );

    if (!headerRes.rows[0]) {
        throw Object.assign(new Error('جلسة الجرد غير موجودة'), { statusCode: 404 });
    }

    const itemsRes = await pool.query<SessionItemRow>(
        `
    SELECT
      sci.id,
      sci.product_id,
      p.name AS product_name,
      p.barcode,
      p.unit,
      sci.system_quantity,
      sci.counted_quantity,
      sci.difference_quantity,
      sci.created_at,
      sci.updated_at
    FROM stock_count_session_items sci
    JOIN products p ON p.id = sci.product_id
    WHERE sci.session_id = $1
    ORDER BY p.name ASC, sci.id ASC
    `,
        [id]
    );

    return {
        ...mapSessionRow(headerRes.rows[0]),
        items: itemsRes.rows.map(mapSessionItemRow),
    };
}

export async function createStockCountSession(
    input: CreateStockCountSessionInput,
    userId: number
): Promise<StockCountSessionDetails> {
    const notes = String(input.notes ?? '').trim() || null;

    const sessionId = await withTransaction(async (client) => {
        const resolved = await resolveOperationalWarehouse(
            client,
            input.warehouse_id ?? null
        );

        const existingDraftRes = await client.query<{ id: string | number }>(
            `
      SELECT id
      FROM stock_count_sessions
      WHERE warehouse_id = $1 AND status = 'draft'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE
      `,
            [resolved.warehouseId]
        );

        if (existingDraftRes.rows[0]) {
            return Number(existingDraftRes.rows[0].id);
        }

        const insertRes = await client.query<{ id: string | number }>(
            `
      INSERT INTO stock_count_sessions (
        session_number,
        warehouse_id,
        status,
        notes,
        created_by,
        created_at,
        updated_at
      )
      VALUES ($1, $2, 'draft', $3, $4, NOW(), NOW())
      RETURNING id
      `,
            [buildSessionNumber(), resolved.warehouseId, notes, userId]
        );

        return Number(insertRes.rows[0].id);
    });

    return await getStockCountSessionById(sessionId);
}

export async function upsertStockCountSessionItem(
    sessionId: number,
    input: UpsertStockCountSessionItemInput
): Promise<StockCountSessionDetails> {
    const productId = Number(input.product_id);
    const countedQuantity = Number(input.counted_quantity);

    if (!productId || Number.isNaN(productId)) {
        throw Object.assign(new Error('المنتج غير صالح'), { statusCode: 400 });
    }

    if (Number.isNaN(countedQuantity) || countedQuantity < 0) {
        throw Object.assign(new Error('الكمية المعدودة يجب أن تكون صفرًا أو أكبر'), {
            statusCode: 400,
        });
    }

    await withTransaction(async (client) => {
        const sessionRes = await client.query<{
            id: string | number;
            status: 'draft' | 'posted';
            warehouse_id: string | number;
        }>(
            `
      SELECT id, status, warehouse_id
      FROM stock_count_sessions
      WHERE id = $1
      FOR UPDATE
      `,
            [sessionId]
        );

        if (!sessionRes.rows[0]) {
            throw Object.assign(new Error('جلسة الجرد غير موجودة'), { statusCode: 404 });
        }

        if (sessionRes.rows[0].status !== 'draft') {
            throw Object.assign(new Error('لا يمكن تعديل جلسة جرد معتمدة'), {
                statusCode: 409,
            });
        }

        const warehouseId = Number(sessionRes.rows[0].warehouse_id);

        const productRes = await client.query<{ id: string | number }>(
            `
      SELECT id
      FROM products
      WHERE id = $1
      LIMIT 1
      `,
            [productId]
        );

        if (!productRes.rows[0]) {
            throw Object.assign(new Error('المنتج غير موجود'), { statusCode: 404 });
        }

        const existingItemRes = await client.query<{ system_quantity: string }>(
            `
      SELECT system_quantity
      FROM stock_count_session_items
      WHERE session_id = $1 AND product_id = $2
      LIMIT 1
      `,
            [sessionId, productId]
        );

        let systemQuantity = 0;

        if (existingItemRes.rows[0]) {
            systemQuantity = parseFloat(String(existingItemRes.rows[0].system_quantity ?? '0'));
        } else {
            const stockRes = await client.query<{ quantity: string }>(
                `
        SELECT quantity
        FROM product_warehouse_stock
        WHERE product_id = $1 AND warehouse_id = $2
        LIMIT 1
        `,
                [productId, warehouseId]
            );

            systemQuantity = parseFloat(String(stockRes.rows[0]?.quantity ?? '0'));
        }

        await client.query(
            `
      INSERT INTO stock_count_session_items (
        session_id,
        product_id,
        system_quantity,
        counted_quantity,
        difference_quantity,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (session_id, product_id)
      DO UPDATE SET
        counted_quantity = EXCLUDED.counted_quantity,
        difference_quantity = EXCLUDED.counted_quantity - stock_count_session_items.system_quantity,
        updated_at = NOW()
      `,
            [
                sessionId,
                productId,
                systemQuantity,
                countedQuantity,
                countedQuantity - systemQuantity,
            ]
        );

        await client.query(
            `
      UPDATE stock_count_sessions
      SET updated_at = NOW()
      WHERE id = $1
      `,
            [sessionId]
        );
    });

    return await getStockCountSessionById(sessionId);
}

export async function removeStockCountSessionItem(
    sessionId: number,
    productId: number
): Promise<StockCountSessionDetails> {
    await withTransaction(async (client) => {
        const sessionRes = await client.query<{
            id: string | number;
            status: 'draft' | 'posted';
        }>(
            `
      SELECT id, status
      FROM stock_count_sessions
      WHERE id = $1
      FOR UPDATE
      `,
            [sessionId]
        );

        if (!sessionRes.rows[0]) {
            throw Object.assign(new Error('جلسة الجرد غير موجودة'), { statusCode: 404 });
        }

        if (sessionRes.rows[0].status !== 'draft') {
            throw Object.assign(new Error('لا يمكن تعديل جلسة جرد معتمدة'), {
                statusCode: 409,
            });
        }

        const deleteRes = await client.query(
            `
      DELETE FROM stock_count_session_items
      WHERE session_id = $1 AND product_id = $2
      `,
            [sessionId, productId]
        );

        if (!deleteRes.rowCount || deleteRes.rowCount === 0) {
            throw Object.assign(new Error('بند الجرد غير موجود داخل الجلسة'), {
                statusCode: 404,
            });
        }

        await client.query(
            `
      UPDATE stock_count_sessions
      SET updated_at = NOW()
      WHERE id = $1
      `,
            [sessionId]
        );
    });

    return await getStockCountSessionById(sessionId);
}

export async function postStockCountSession(
    sessionId: number,
    userId: number
): Promise<StockCountSessionDetails> {
    const lowStockEvents: LowStockTransitionEvent[] = [];

    await withTransaction(async (client) => {
        const sessionRes = await client.query<{
            id: string | number;
            session_number: string;
            warehouse_id: string | number;
            warehouse_name: string;
            status: 'draft' | 'posted';
        }>(
            `
      SELECT
        scs.id,
        scs.session_number,
        scs.warehouse_id,
        w.name AS warehouse_name,
        scs.status
      FROM stock_count_sessions scs
      JOIN warehouses w ON w.id = scs.warehouse_id
      WHERE scs.id = $1
      FOR UPDATE
      `,
            [sessionId]
        );

        if (!sessionRes.rows[0]) {
            throw Object.assign(new Error('جلسة الجرد غير موجودة'), { statusCode: 404 });
        }

        const session = sessionRes.rows[0];

        if (session.status !== 'draft') {
            throw Object.assign(new Error('جلسة الجرد معتمدة مسبقًا'), { statusCode: 409 });
        }

        const warehouseId = Number(session.warehouse_id);

        const warehouseRes = await client.query<{
            id: string | number;
            is_active: boolean;
        }>(
            `
      SELECT id, is_active
      FROM warehouses
      WHERE id = $1
      FOR UPDATE
      `,
            [warehouseId]
        );

        if (!warehouseRes.rows[0]) {
            throw Object.assign(new Error('المستودع المرتبط بجلسة الجرد لم يعد موجودًا'), {
                statusCode: 404,
            });
        }

        if (!warehouseRes.rows[0].is_active) {
            throw Object.assign(new Error('لا يمكن اعتماد الجرد على مستودع غير نشط'), {
                statusCode: 409,
            });
        }

        const itemsRes = await client.query<{
            id: string | number;
            product_id: string | number;
            product_name: string;
            system_quantity: string | number;
            counted_quantity: string | number;
            difference_quantity: string | number;
        }>(
            `
      SELECT
        sci.id,
        sci.product_id,
        p.name AS product_name,
        sci.system_quantity,
        sci.counted_quantity,
        sci.difference_quantity
      FROM stock_count_session_items sci
      JOIN products p ON p.id = sci.product_id
      WHERE sci.session_id = $1
      ORDER BY sci.id ASC
      `,
            [sessionId]
        );

        if (itemsRes.rows.length === 0) {
            throw Object.assign(new Error('لا يمكن اعتماد جلسة جرد بدون بنود'), {
                statusCode: 409,
            });
        }

        for (const item of itemsRes.rows) {
            const productId = Number(item.product_id);
            const productName = item.product_name;
            const systemQuantity = parseFloat(String(item.system_quantity ?? '0'));
            const countedQuantity = parseFloat(String(item.counted_quantity ?? '0'));
            const differenceQuantity = parseFloat(String(item.difference_quantity ?? '0'));

            const warehouseStockRes = await client.query<{ quantity: string }>(
                `
        SELECT quantity
        FROM product_warehouse_stock
        WHERE product_id = $1 AND warehouse_id = $2
        FOR UPDATE
        `,
                [productId, warehouseId]
            );

            const currentWarehouseQuantity = parseFloat(
                String(warehouseStockRes.rows[0]?.quantity ?? '0')
            );

            if (!nearlyEqual(currentWarehouseQuantity, systemQuantity)) {
                throw Object.assign(
                    new Error(
                        `تعذر اعتماد الجرد للمنتج "${productName}" لأن رصيده تغيّر بعد بدء الجلسة. الرصيد الحالي: ${currentWarehouseQuantity.toFixed(3)} / الرصيد عند الجرد: ${systemQuantity.toFixed(3)}`
                    ),
                    { statusCode: 409 }
                );
            }

            if (!nearlyEqual(differenceQuantity, 0)) {
                const movement = await recordStockMovement(client, {
                    product_id: productId,
                    movement_type: differenceQuantity > 0 ? 'adjustment_in' : 'adjustment_out',
                    quantity_change: differenceQuantity,
                    reference_id: Number(session.id),
                    reference_type: 'stock_count_session',
                    note: `اعتماد جلسة جرد ${session.session_number} على المستودع "${session.warehouse_name}"`,
                    created_by: userId,
                });

                if (movement.low_stock_event) {
                    lowStockEvents.push(movement.low_stock_event);
                }

                if (warehouseStockRes.rows[0]) {
                    await client.query(
                        `
            UPDATE product_warehouse_stock
            SET quantity = $1, updated_at = NOW()
            WHERE product_id = $2 AND warehouse_id = $3
            `,
                        [countedQuantity, productId, warehouseId]
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
                        [productId, warehouseId, countedQuantity]
                    );
                }
            }
        }

        await client.query(
            `
      UPDATE stock_count_sessions
      SET
        status = 'posted',
        posted_by = $2,
        posted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      `,
            [sessionId, userId]
        );
    });

    if (lowStockEvents.length > 0) {
        await Promise.allSettled(
            lowStockEvents.map((event) => sendLowStockTelegramAlert(event))
        );
    }

    return await getStockCountSessionById(sessionId);
}