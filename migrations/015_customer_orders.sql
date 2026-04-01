-- ============================================================
-- Rayyan Pro — Migration 015: Customer Orders
-- ============================================================

-- 1) رأس الطلبات الواردة
CREATE TABLE IF NOT EXISTS customer_orders (
  id                    BIGSERIAL PRIMARY KEY,
  order_number          TEXT NOT NULL UNIQUE,

  source                TEXT NOT NULL DEFAULT 'telegram_web'
                        CHECK (source IN ('telegram_web')),

  status                TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new', 'reviewed', 'converted', 'cancelled')),

  customer_name         TEXT NOT NULL,
  recipient_name        TEXT,
  phone                 TEXT,
  notes                 TEXT,

  payment_method        TEXT NOT NULL
                        CHECK (payment_method IN ('cash_on_delivery', 'sham_cash')),

  currency_code         TEXT NOT NULL DEFAULT 'USD'
                        CHECK (currency_code IN ('USD', 'SYP', 'TRY', 'SAR', 'AED')),

  exchange_rate         NUMERIC(14,6) NOT NULL DEFAULT 1,

  subtotal_usd          NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_usd             NUMERIC(15,4) NOT NULL DEFAULT 0,

  customer_id           BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  warehouse_id          BIGINT REFERENCES warehouses(id) ON DELETE SET NULL,

  converted_to_sale_id  BIGINT REFERENCES sales(id) ON DELETE SET NULL,

  cancel_reason         TEXT,

  created_by            BIGINT REFERENCES users(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at           TIMESTAMPTZ,
  converted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_customer_orders_status
  ON customer_orders(status);

CREATE INDEX IF NOT EXISTS idx_customer_orders_created_at
  ON customer_orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_orders_customer_name
  ON customer_orders(customer_name);

CREATE INDEX IF NOT EXISTS idx_customer_orders_phone
  ON customer_orders(phone);

CREATE INDEX IF NOT EXISTS idx_customer_orders_warehouse_id
  ON customer_orders(warehouse_id);

CREATE INDEX IF NOT EXISTS idx_customer_orders_converted_to_sale_id
  ON customer_orders(converted_to_sale_id);

-- 2) بنود الطلبات
CREATE TABLE IF NOT EXISTS customer_order_items (
  id                    BIGSERIAL PRIMARY KEY,
  order_id              BIGINT NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,

  product_id            BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,

  product_name_snapshot TEXT NOT NULL,
  unit_snapshot         TEXT NOT NULL DEFAULT 'قطعة',
  image_url_snapshot    TEXT,

  quantity              NUMERIC(15,4) NOT NULL CHECK (quantity > 0),
  unit_price_usd        NUMERIC(15,4) NOT NULL DEFAULT 0,
  line_total_usd        NUMERIC(15,4) NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_order_items_order_id
  ON customer_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_customer_order_items_product_id
  ON customer_order_items(product_id);

-- 3) ربط sale لاحقاً بالطلب الأصلي
ALTER TABLE sales
ADD COLUMN IF NOT EXISTS source_order_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_source_order_id_fkey'
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_source_order_id_fkey
    FOREIGN KEY (source_order_id)
    REFERENCES customer_orders(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_source_order_id_idx
ON sales (source_order_id);