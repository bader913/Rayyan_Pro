-- Phase 8: Performance indexes for high-traffic queries

-- purchases table
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id  ON purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_user_id      ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at   ON purchases(created_at DESC);

-- purchase_items table
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase_id ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product_id  ON purchase_items(product_id);

-- sales_returns table
CREATE INDEX IF NOT EXISTS idx_sales_returns_sale_id    ON sales_returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_user_id    ON sales_returns(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_created_at ON sales_returns(created_at DESC);

-- sales_return_items table
CREATE INDEX IF NOT EXISTS idx_sales_return_items_return_id  ON sales_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_sales_return_items_product_id ON sales_return_items(product_id);

-- supplier_account_transactions table
CREATE INDEX IF NOT EXISTS idx_sat_supplier_id  ON supplier_account_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sat_created_at   ON supplier_account_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sat_created_by   ON supplier_account_transactions(created_by);

-- customer_account_transactions table (ensure composite index for balance lookups)
CREATE INDEX IF NOT EXISTS idx_cat_created_at_desc ON customer_account_transactions(created_at DESC);

-- users table
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- expenses table
CREATE INDEX IF NOT EXISTS idx_expenses_created_at ON expenses(created_at DESC);

-- audit_logs: additional composite index for filtered queries
CREATE INDEX IF NOT EXISTS idx_audit_action_entity ON audit_logs(action, entity_type);
