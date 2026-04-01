CREATE TABLE IF NOT EXISTS purchase_returns (
  id BIGSERIAL PRIMARY KEY,
  return_number VARCHAR(50) NOT NULL UNIQUE,
  purchase_id BIGINT NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
  supplier_id BIGINT NULL REFERENCES suppliers(id) ON DELETE SET NULL,
  user_id BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  return_method VARCHAR(30) NOT NULL CHECK (return_method IN ('cash_refund', 'debt_discount', 'stock_only')),
  total_amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  reason VARCHAR(500),
  notes VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_return_items (
  id BIGSERIAL PRIMARY KEY,
  return_id BIGINT NOT NULL REFERENCES purchase_returns(id) ON DELETE CASCADE,
  purchase_item_id BIGINT NOT NULL REFERENCES purchase_items(id) ON DELETE RESTRICT,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  total_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchase_returns_purchase_id_idx
  ON purchase_returns(purchase_id);

CREATE INDEX IF NOT EXISTS purchase_returns_supplier_id_idx
  ON purchase_returns(supplier_id);

CREATE INDEX IF NOT EXISTS purchase_returns_created_at_idx
  ON purchase_returns(created_at DESC);

CREATE INDEX IF NOT EXISTS purchase_return_items_return_id_idx
  ON purchase_return_items(return_id);

CREATE INDEX IF NOT EXISTS purchase_return_items_purchase_item_id_idx
  ON purchase_return_items(purchase_item_id);

CREATE INDEX IF NOT EXISTS purchase_return_items_product_id_idx
  ON purchase_return_items(product_id);