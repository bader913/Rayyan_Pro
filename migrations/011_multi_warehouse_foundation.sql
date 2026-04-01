-- ============================================================
-- Rayyan Pro — Migration 011: Multi Warehouse Foundation
-- ============================================================

-- 1) setting افتراضي لإخفاء الميزة حتى يتم تفعيلها يدويًا
INSERT INTO settings (key, value, updated_at)
VALUES ('enable_multi_warehouse', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

-- 2) جدول المستودعات
CREATE TABLE IF NOT EXISTS warehouses (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  code        TEXT UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warehouses_active
  ON warehouses(is_active);

CREATE INDEX IF NOT EXISTS idx_warehouses_created
  ON warehouses(created_at DESC);

-- 3) توزيع رصيد المنتج على المستودعات
CREATE TABLE IF NOT EXISTS product_warehouse_stock (
  id            BIGSERIAL PRIMARY KEY,
  product_id    BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  warehouse_id  BIGINT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity      NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_product_warehouse_stock UNIQUE (product_id, warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_product_warehouse_stock_product
  ON product_warehouse_stock(product_id);

CREATE INDEX IF NOT EXISTS idx_product_warehouse_stock_warehouse
  ON product_warehouse_stock(warehouse_id);

-- 4) رأس تحويلات المخزون
CREATE TABLE IF NOT EXISTS stock_transfers (
  id                  BIGSERIAL PRIMARY KEY,
  transfer_number     TEXT NOT NULL UNIQUE,

  from_warehouse_id   BIGINT NOT NULL REFERENCES warehouses(id),
  to_warehouse_id     BIGINT NOT NULL REFERENCES warehouses(id),

  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'approved',
    'received',
    'cancelled'
  )),

  notes               TEXT,

  created_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at         TIMESTAMPTZ,
  received_at         TIMESTAMPTZ,

  CONSTRAINT chk_stock_transfers_different_warehouses
    CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_status
  ON stock_transfers(status);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_created
  ON stock_transfers(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_warehouse
  ON stock_transfers(from_warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_warehouse
  ON stock_transfers(to_warehouse_id);

-- 5) بنود التحويل
CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id            BIGSERIAL PRIMARY KEY,
  transfer_id   BIGINT NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id    BIGINT NOT NULL REFERENCES products(id),
  quantity      NUMERIC(15,4) NOT NULL CHECK (quantity > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_stock_transfer_item_product UNIQUE (transfer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer
  ON stock_transfer_items(transfer_id);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_product
  ON stock_transfer_items(product_id);

-- 6) توسيع reference_type في حركات المخزون لدعم التحويل
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'product_stock_movements'
      AND c.conname = 'product_stock_movements_reference_type_check'
  ) THEN
    ALTER TABLE product_stock_movements
      DROP CONSTRAINT product_stock_movements_reference_type_check;
  END IF;
END $$;

ALTER TABLE product_stock_movements
  ADD CONSTRAINT product_stock_movements_reference_type_check
  CHECK (
    reference_type IS NULL OR
    reference_type IN (
      'sale',
      'purchase',
      'sale_return',
      'purchase_return',
      'adjustment',
      'stock_transfer'
    )
  );

-- 7) إنشاء مستودع رئيسي افتراضي لضمان بقاء تجربة المستودع الواحد كما هي
INSERT INTO warehouses (name, code, is_active, created_at, updated_at)
SELECT 'المستودع الرئيسي', 'MAIN', TRUE, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM warehouses WHERE code = 'MAIN'
);

-- 8) نسخ الرصيد الحالي من products.stock_quantity إلى المستودع الرئيسي
--    بدون المساس بالرصيد العام الحالي
WITH main_wh AS (
  SELECT id
  FROM warehouses
  WHERE code = 'MAIN'
  ORDER BY id
  LIMIT 1
)
INSERT INTO product_warehouse_stock (
  product_id,
  warehouse_id,
  quantity,
  created_at,
  updated_at
)
SELECT
  p.id,
  main_wh.id,
  COALESCE(p.stock_quantity, 0),
  NOW(),
  NOW()
FROM products p
CROSS JOIN main_wh
ON CONFLICT (product_id, warehouse_id) DO NOTHING;