import { pool } from '../../shared/db/pool.js';

export interface Warehouse {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  products_count: number;
  total_quantity: number;
}

export interface WarehouseProduct {
  id: number;
  name: string;
  barcode: string | null;
  unit: string | null;
  warehouse_quantity: number;
  total_stock_quantity: number;
  min_stock_level: number;
}

interface WarehouseRow {
  id: string | number;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  products_count: string | number;
  total_quantity: string | number;
}

interface WarehouseProductRow {
  id: string | number;
  name: string;
  barcode: string | null;
  unit: string | null;
  warehouse_quantity: string | number;
  total_stock_quantity: string | number;
  min_stock_level: string | number;
}

interface CreateWarehouseInput {
  name: string;
  code?: string | null;
  is_active?: boolean;
}

interface UpdateWarehouseInput {
  name?: string;
  code?: string | null;
  is_active?: boolean;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toWarehouse(row: WarehouseRow): Warehouse {
  return {
    id: Number(row.id),
    name: row.name,
    code: row.code ?? null,
    is_active: !!row.is_active,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    products_count: Number(row.products_count ?? 0),
    total_quantity: parseFloat(String(row.total_quantity ?? 0)),
  };
}

function toWarehouseProduct(row: WarehouseProductRow): WarehouseProduct {
  return {
    id: Number(row.id),
    name: row.name,
    barcode: row.barcode ?? null,
    unit: row.unit ?? null,
    warehouse_quantity: parseFloat(String(row.warehouse_quantity ?? 0)),
    total_stock_quantity: parseFloat(String(row.total_stock_quantity ?? 0)),
    min_stock_level: parseFloat(String(row.min_stock_level ?? 0)),
  };
}

function normalizeWarehouseCode(code?: string | null): string | null {
  const value = String(code ?? '').trim();
  if (!value) return null;

  return value
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .toUpperCase();
}

async function getWarehouseRowById(id: number): Promise<Warehouse | null> {
  const res = await pool.query<WarehouseRow>(
    `
    SELECT
      w.id,
      w.name,
      w.code,
      w.is_active,
      w.created_at,
      w.updated_at,
      COUNT(DISTINCT pws.product_id) AS products_count,
      COALESCE(SUM(pws.quantity), 0) AS total_quantity
    FROM warehouses w
    LEFT JOIN product_warehouse_stock pws ON pws.warehouse_id = w.id
    WHERE w.id = $1
    GROUP BY w.id, w.name, w.code, w.is_active, w.created_at, w.updated_at
    `,
    [id]
  );

  if (!res.rows[0]) return null;
  return toWarehouse(res.rows[0]);
}

async function ensureNotLastActiveWarehouse(targetId: number) {
  const res = await pool.query<{ active_count: string }>(
    `SELECT COUNT(*) AS active_count FROM warehouses WHERE is_active = TRUE`
  );

  const activeCount = Number(res.rows[0]?.active_count ?? 0);

  if (activeCount <= 1) {
    const current = await pool.query<{ is_active: boolean }>(
      `SELECT is_active FROM warehouses WHERE id = $1`,
      [targetId]
    );

    if (current.rows[0]?.is_active) {
      throw Object.assign(
        new Error('لا يمكن تعطيل آخر مستودع نشط في النظام'),
        { statusCode: 409 }
      );
    }
  }
}

export async function listWarehouses(activeOnly = false): Promise<Warehouse[]> {
  const res = await pool.query<WarehouseRow>(
    `
    SELECT
      w.id,
      w.name,
      w.code,
      w.is_active,
      w.created_at,
      w.updated_at,
      COUNT(DISTINCT pws.product_id) AS products_count,
      COALESCE(SUM(pws.quantity), 0) AS total_quantity
    FROM warehouses w
    LEFT JOIN product_warehouse_stock pws ON pws.warehouse_id = w.id
    ${activeOnly ? 'WHERE w.is_active = TRUE' : ''}
    GROUP BY w.id, w.name, w.code, w.is_active, w.created_at, w.updated_at
    ORDER BY
      CASE WHEN w.code = 'MAIN' THEN 0 ELSE 1 END,
      w.is_active DESC,
      w.name ASC
    `
  );

  return res.rows.map(toWarehouse);
}

export async function getWarehouseById(id: number): Promise<Warehouse> {
  const warehouse = await getWarehouseRowById(id);

  if (!warehouse) {
    throw Object.assign(new Error('المستودع غير موجود'), { statusCode: 404 });
  }

  return warehouse;
}

export async function listWarehouseProducts(warehouseId: number): Promise<WarehouseProduct[]> {
  await getWarehouseById(warehouseId);

  const res = await pool.query<WarehouseProductRow>(
    `
    SELECT
      p.id,
      p.name,
      p.barcode,
      p.unit,
      COALESCE(pws.quantity, 0) AS warehouse_quantity,
      COALESCE(p.stock_quantity, 0) AS total_stock_quantity,
      COALESCE(p.min_stock_level, 0) AS min_stock_level
    FROM product_warehouse_stock pws
    INNER JOIN products p ON p.id = pws.product_id
    WHERE pws.warehouse_id = $1
    ORDER BY p.name ASC, p.id DESC
    `,
    [warehouseId]
  );

  return res.rows.map(toWarehouseProduct);
}

export async function createWarehouse(input: CreateWarehouseInput): Promise<Warehouse> {
  const name = String(input.name ?? '').trim();
  const code = normalizeWarehouseCode(input.code);
  const isActive = input.is_active ?? true;

  if (!name) {
    throw Object.assign(new Error('اسم المستودع مطلوب'), { statusCode: 400 });
  }

  if (input.code && !code) {
    throw Object.assign(new Error('رمز المستودع غير صالح'), { statusCode: 400 });
  }

  try {
    const insertRes = await pool.query<{ id: string | number }>(
      `
      INSERT INTO warehouses (name, code, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id
      `,
      [name, code, isActive]
    );

    return await getWarehouseById(Number(insertRes.rows[0].id));
  } catch (error: any) {
    if (error?.code === '23505') {
      throw Object.assign(new Error('رمز المستودع مستخدم بالفعل'), { statusCode: 409 });
    }
    throw error;
  }
}

export async function updateWarehouse(id: number, input: UpdateWarehouseInput): Promise<Warehouse> {
  const current = await getWarehouseById(id);

  const nextName =
    input.name !== undefined ? String(input.name ?? '').trim() : current.name;

  const nextCode =
    input.code !== undefined ? normalizeWarehouseCode(input.code) : current.code;

  const nextIsActive =
    input.is_active !== undefined ? !!input.is_active : current.is_active;

  if (!nextName) {
    throw Object.assign(new Error('اسم المستودع مطلوب'), { statusCode: 400 });
  }

  if (input.code !== undefined && input.code && !nextCode) {
    throw Object.assign(new Error('رمز المستودع غير صالح'), { statusCode: 400 });
  }

  if (!nextIsActive) {
    await ensureNotLastActiveWarehouse(id);
  }

  try {
    await pool.query(
      `
      UPDATE warehouses
      SET
        name = $1,
        code = $2,
        is_active = $3,
        updated_at = NOW()
      WHERE id = $4
      `,
      [nextName, nextCode, nextIsActive, id]
    );

    return await getWarehouseById(id);
  } catch (error: any) {
    if (error?.code === '23505') {
      throw Object.assign(new Error('رمز المستودع مستخدم بالفعل'), { statusCode: 409 });
    }
    throw error;
  }
}