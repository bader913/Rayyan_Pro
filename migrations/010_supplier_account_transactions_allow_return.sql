ALTER TABLE supplier_account_transactions
DROP CONSTRAINT IF EXISTS supplier_account_transactions_transaction_type_check;

ALTER TABLE supplier_account_transactions
ADD CONSTRAINT supplier_account_transactions_transaction_type_check
CHECK (transaction_type IN ('purchase', 'payment', 'return', 'adjustment'));