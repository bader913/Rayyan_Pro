-- ============================================================
-- Rayyan Pro — Migration 002: Product Stock Movements
-- ============================================================

-- حركات المخزون — تتبع كل سبب لتغير الكمية
CREATE TABLE IF NOT EXISTS product_stock_movements (
  id              BIGSERIAL PRIMARY KEY,
  product_id      BIGINT NOT NULL REFERENCES products(id),

  -- نوع الحركة
  movement_type   TEXT NOT NULL CHECK (movement_type IN (
    'purchase',       -- شراء: دخول من مورد
    'sale',           -- بيع: خروج لعميل
    'return_in',      -- مرتجع بيع: عودة للمخزون
    'return_out',     -- مرتجع شراء: خروج للمورد
    'adjustment_in',  -- تعديل إدخال: جرد أو تصحيح
    'adjustment_out', -- تعديل إخراج: جرد أو تصحيح
    'initial',        -- رصيد افتتاحي
    'damage',         -- تالف أو منتهي الصلاحية
    'transfer_in',    -- تحويل وارد (بين فروع مستقبلاً)
    'transfer_out'    -- تحويل صادر
  )),

  -- موجب = دخول للمخزون، سالب = خروج
  quantity_change   NUMERIC(15,4) NOT NULL,
  quantity_before   NUMERIC(15,4) NOT NULL,
  quantity_after    NUMERIC(15,4) NOT NULL,

  -- مرجع العملية (id الفاتورة أو المرتجع أو التعديل)
  reference_id      BIGINT,
  reference_type    TEXT CHECK (reference_type IN (
    'sale', 'purchase', 'sale_return', 'purchase_return', 'adjustment', NULL
  )),

  note              TEXT,
  created_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_mv_product  ON product_stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_mv_type     ON product_stock_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_stock_mv_created  ON product_stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_mv_ref      ON product_stock_movements(reference_type, reference_id);
