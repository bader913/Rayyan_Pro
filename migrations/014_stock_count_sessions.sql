-- ============================================================
-- Rayyan Pro — Migration 014: Stock Count Sessions
-- ============================================================

-- الفكرة:
-- - جلسة جرد رسمية مرتبطة دائمًا بمستودع فعلي
-- - حتى عند إطفاء multi-warehouse يبقى الربط داخليًا على MAIN / المستودع الافتراضي
-- - البنود تحفظ snapshot واضح:
--   system_quantity / counted_quantity / difference_quantity
-- - عند الاعتماد لاحقًا:
--   adjustment_in / adjustment_out عبر recordStockMovement فقط

-- 1) رأس جلسات الجرد
CREATE TABLE IF NOT EXISTS stock_count_sessions (
  id            BIGSERIAL PRIMARY KEY,
  session_number TEXT NOT NULL UNIQUE,

  warehouse_id  BIGINT NOT NULL REFERENCES warehouses(id),

  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'posted')),

  notes         TEXT,

  created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  posted_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stock_count_sessions_status
  ON stock_count_sessions(status);

CREATE INDEX IF NOT EXISTS idx_stock_count_sessions_warehouse
  ON stock_count_sessions(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_stock_count_sessions_created
  ON stock_count_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_count_sessions_posted
  ON stock_count_sessions(posted_at DESC);

-- 2) بنود الجرد
CREATE TABLE IF NOT EXISTS stock_count_session_items (
  id                  BIGSERIAL PRIMARY KEY,
  session_id          BIGINT NOT NULL REFERENCES stock_count_sessions(id) ON DELETE CASCADE,
  product_id          BIGINT NOT NULL REFERENCES products(id),

  system_quantity     NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (system_quantity >= 0),
  counted_quantity    NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (counted_quantity >= 0),
  difference_quantity NUMERIC(15,4) NOT NULL,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_stock_count_session_product UNIQUE (session_id, product_id),

  CONSTRAINT chk_stock_count_session_difference
    CHECK (difference_quantity = counted_quantity - system_quantity)
);

CREATE INDEX IF NOT EXISTS idx_stock_count_session_items_session
  ON stock_count_session_items(session_id);

CREATE INDEX IF NOT EXISTS idx_stock_count_session_items_product
  ON stock_count_session_items(product_id);

CREATE INDEX IF NOT EXISTS idx_stock_count_session_items_difference
  ON stock_count_session_items(difference_quantity);

-- 3) توسيع reference_type في product_stock_movements
-- لتمييز الجرد الرسمي عن adjustment اليدوي السريع
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
      'stock_transfer',
      'stock_count_session'
    )
  );