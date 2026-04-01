CREATE TABLE IF NOT EXISTS supplier_account_transactions (
  id BIGSERIAL PRIMARY KEY,
  supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  transaction_type VARCHAR(30) NOT NULL
    CHECK (transaction_type IN ('purchase', 'payment', 'return', 'adjustment')),
  reference_id BIGINT,
  reference_type VARCHAR(50),
  debit_amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency_code VARCHAR(10) NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(14,6) NOT NULL DEFAULT 1,
  amount_original NUMERIC(14,4),
  note VARCHAR(500),
  created_by BIGINT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supplier_account_transactions_supplier_id_idx
  ON supplier_account_transactions(supplier_id);

CREATE INDEX IF NOT EXISTS supplier_account_transactions_created_at_idx
  ON supplier_account_transactions(created_at DESC);

CREATE INDEX IF NOT EXISTS supplier_account_transactions_reference_idx
  ON supplier_account_transactions(reference_type, reference_id);