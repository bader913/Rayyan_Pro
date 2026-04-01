ALTER TABLE customers
ADD COLUMN IF NOT EXISTS bonus_balance NUMERIC(14,4) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_bonus_earned NUMERIC(14,4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS customer_bonus_transactions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('earn', 'use', 'adjustment', 'reverse')),
  amount NUMERIC(14,4) NOT NULL,
  balance_after NUMERIC(14,4) NOT NULL,
  source_type TEXT,
  source_id BIGINT,
  note TEXT,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_bonus_transactions_customer_idx
ON customer_bonus_transactions(customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_bonus_transactions_source_idx
ON customer_bonus_transactions(source_type, source_id);

INSERT INTO settings (key, value, updated_at)
VALUES ('customer_bonus_enabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, updated_at)
VALUES ('customer_bonus_rate', '0', NOW())
ON CONFLICT (key) DO NOTHING;