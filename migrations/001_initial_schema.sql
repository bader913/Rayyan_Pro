-- ============================================================
-- Rayyan Pro — Migration 001: Initial Schema
-- ============================================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id                BIGSERIAL PRIMARY KEY,
  username          TEXT UNIQUE NOT NULL,
  password_hash     TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  role              TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier', 'warehouse')),
  is_active         BOOLEAN DEFAULT TRUE,
  is_protected      BOOLEAN DEFAULT FALSE,
  avatar_url        TEXT,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- User Sessions (Refresh Tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT UNIQUE NOT NULL,
  ip_address    TEXT,
  user_agent    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_token   ON user_sessions(refresh_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);

-- POS Terminals (نقاط البيع)
CREATE TABLE IF NOT EXISTS pos_terminals (
  id          BIGSERIAL PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  location    TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  parent_id   BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Suppliers (موردون)
CREATE TABLE IF NOT EXISTS suppliers (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  phone       TEXT,
  address     TEXT,
  balance     NUMERIC(15,4) DEFAULT 0,
  notes       TEXT,
  created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Customers (عملاء)
CREATE TABLE IF NOT EXISTS customers (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  phone           TEXT,
  address         TEXT,
  customer_type   TEXT DEFAULT 'retail' CHECK (customer_type IN ('retail', 'wholesale')),
  credit_limit    NUMERIC(15,4) DEFAULT 0,
  balance         NUMERIC(15,4) DEFAULT 0,
  notes           TEXT,
  created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- Products (منتجات)
CREATE TABLE IF NOT EXISTS products (
  id                  BIGSERIAL PRIMARY KEY,
  barcode             TEXT,
  name                TEXT NOT NULL,
  category_id         BIGINT REFERENCES categories(id) ON DELETE SET NULL,
  unit                TEXT NOT NULL DEFAULT 'قطعة',
  is_weighted         BOOLEAN DEFAULT FALSE,
  purchase_price      NUMERIC(15,4) DEFAULT 0,
  retail_price        NUMERIC(15,4) DEFAULT 0,
  wholesale_price     NUMERIC(15,4),
  wholesale_min_qty   NUMERIC(15,4) DEFAULT 1,
  stock_quantity      NUMERIC(15,4) DEFAULT 0,
  min_stock_level     NUMERIC(15,4) DEFAULT 5,
  expiry_date         DATE,
  image_url           TEXT,
  supplier_id         BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  notes               TEXT,
  is_active           BOOLEAN DEFAULT TRUE,
  created_by          BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode    ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category   ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier   ON products(supplier_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_barcode
  ON products(name, barcode) WHERE barcode IS NOT NULL;

-- Shifts (ورديات)
CREATE TABLE IF NOT EXISTS shifts (
  id                          BIGSERIAL PRIMARY KEY,
  user_id                     BIGINT NOT NULL REFERENCES users(id),
  pos_terminal_id             BIGINT REFERENCES pos_terminals(id),
  currency_code               TEXT DEFAULT 'USD',
  exchange_rate               NUMERIC(15,6) DEFAULT 1,
  opening_balance             NUMERIC(15,4) DEFAULT 0,
  opening_balance_original    NUMERIC(15,4) DEFAULT 0,
  opening_note                TEXT,
  closing_note                TEXT,
  opened_at                   TIMESTAMPTZ DEFAULT NOW(),
  closed_at                   TIMESTAMPTZ,
  status                      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closing_cash_counted        NUMERIC(15,4) DEFAULT 0,
  expected_cash               NUMERIC(15,4) DEFAULT 0,
  difference                  NUMERIC(15,4) DEFAULT 0,
  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_user_id    ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status     ON shifts(status);
CREATE INDEX IF NOT EXISTS idx_shifts_terminal   ON shifts(pos_terminal_id);

-- Sales (مبيعات)
CREATE TABLE IF NOT EXISTS sales (
  id                BIGSERIAL PRIMARY KEY,
  invoice_number    TEXT UNIQUE NOT NULL,
  customer_id       BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  user_id           BIGINT NOT NULL REFERENCES users(id),
  shift_id          BIGINT REFERENCES shifts(id) ON DELETE SET NULL,
  pos_terminal_id   BIGINT REFERENCES pos_terminals(id) ON DELETE SET NULL,
  sale_type         TEXT DEFAULT 'retail' CHECK (sale_type IN ('retail', 'wholesale')),
  subtotal          NUMERIC(15,4) NOT NULL DEFAULT 0,
  discount          NUMERIC(15,4) DEFAULT 0,
  total_amount      NUMERIC(15,4) NOT NULL,
  paid_amount       NUMERIC(15,4) DEFAULT 0,
  payment_method    TEXT CHECK (payment_method IN ('cash', 'card', 'credit', 'mixed')),
  sale_currency     TEXT DEFAULT 'USD',
  exchange_rate     NUMERIC(15,6) DEFAULT 1,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_customer_id   ON sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at    ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_shift_id      ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_terminal      ON sales(pos_terminal_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales(invoice_number);

-- Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
  id            BIGSERIAL PRIMARY KEY,
  sale_id       BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id    BIGINT NOT NULL REFERENCES products(id),
  quantity      NUMERIC(15,4) NOT NULL,
  unit_price    NUMERIC(15,4) NOT NULL,
  discount      NUMERIC(15,4) DEFAULT 0,
  total_price   NUMERIC(15,4) NOT NULL,
  price_type    TEXT DEFAULT 'retail' CHECK (price_type IN ('retail', 'wholesale', 'custom'))
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id    ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);

-- Sales Returns (مرتجعات)
CREATE TABLE IF NOT EXISTS sales_returns (
  id              BIGSERIAL PRIMARY KEY,
  return_number   TEXT UNIQUE NOT NULL,
  sale_id         BIGINT NOT NULL REFERENCES sales(id),
  customer_id     BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  user_id         BIGINT NOT NULL REFERENCES users(id),
  shift_id        BIGINT REFERENCES shifts(id) ON DELETE SET NULL,
  return_method   TEXT NOT NULL CHECK (return_method IN ('cash_refund', 'debt_discount', 'stock_only')),
  total_amount    NUMERIC(15,4) NOT NULL DEFAULT 0,
  reason          TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id            BIGSERIAL PRIMARY KEY,
  return_id     BIGINT NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  sale_item_id  BIGINT REFERENCES sale_items(id) ON DELETE SET NULL,
  product_id    BIGINT NOT NULL REFERENCES products(id),
  quantity      NUMERIC(15,4) NOT NULL,
  unit_price    NUMERIC(15,4) NOT NULL,
  total_price   NUMERIC(15,4) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Purchases (مشتريات)
CREATE TABLE IF NOT EXISTS purchases (
  id                BIGSERIAL PRIMARY KEY,
  invoice_number    TEXT UNIQUE NOT NULL,
  supplier_id       BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
  user_id           BIGINT NOT NULL REFERENCES users(id),
  total_amount      NUMERIC(15,4) NOT NULL,
  paid_amount       NUMERIC(15,4) DEFAULT 0,
  purchase_currency TEXT DEFAULT 'USD',
  exchange_rate     NUMERIC(15,6) DEFAULT 1,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id            BIGSERIAL PRIMARY KEY,
  purchase_id   BIGINT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id    BIGINT NOT NULL REFERENCES products(id),
  quantity      NUMERIC(15,4) NOT NULL,
  unit_price    NUMERIC(15,4) NOT NULL,
  total_price   NUMERIC(15,4) NOT NULL
);

-- Expenses (مصاريف)
CREATE TABLE IF NOT EXISTS expenses (
  id          BIGSERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount      NUMERIC(15,4) NOT NULL,
  currency    TEXT DEFAULT 'USD',
  category    TEXT,
  shift_id    BIGINT REFERENCES shifts(id) ON DELETE SET NULL,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Customer Account Transactions (حركات حسابات العملاء)
CREATE TABLE IF NOT EXISTS customer_account_transactions (
  id                BIGSERIAL PRIMARY KEY,
  customer_id       BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_type  TEXT NOT NULL CHECK (transaction_type IN ('sale', 'payment', 'return', 'adjustment')),
  reference_id      BIGINT,
  reference_type    TEXT,
  debit_amount      NUMERIC(15,4) DEFAULT 0,
  credit_amount     NUMERIC(15,4) DEFAULT 0,
  balance_after     NUMERIC(15,4) NOT NULL,
  currency_code     TEXT DEFAULT 'USD',
  exchange_rate     NUMERIC(15,6) DEFAULT 1,
  amount_original   NUMERIC(15,4),
  note              TEXT,
  created_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cat_customer_id ON customer_account_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_cat_created_at  ON customer_account_transactions(created_at DESC);

-- Supplier Account Transactions (حركات حسابات الموردين)
CREATE TABLE IF NOT EXISTS supplier_account_transactions (
  id                BIGSERIAL PRIMARY KEY,
  supplier_id       BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  transaction_type  TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'payment', 'adjustment')),
  reference_id      BIGINT,
  reference_type    TEXT,
  debit_amount      NUMERIC(15,4) DEFAULT 0,
  credit_amount     NUMERIC(15,4) DEFAULT 0,
  balance_after     NUMERIC(15,4) NOT NULL,
  currency_code     TEXT DEFAULT 'USD',
  exchange_rate     NUMERIC(15,6) DEFAULT 1,
  amount_original   NUMERIC(15,4),
  note              TEXT,
  created_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs (سجل العمليات)
CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     BIGINT,
  old_data      JSONB,
  new_data      JSONB,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity    ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user      ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_logs(created_at DESC);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Invoice Sequences (تسلسل أرقام الفواتير)
CREATE TABLE IF NOT EXISTS invoice_sequences (
  prefix        TEXT PRIMARY KEY,
  last_number   BIGINT DEFAULT 0
);
