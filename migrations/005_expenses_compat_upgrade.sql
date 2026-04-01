-- ── Expenses compat cleanup (safe no-op if 004 already handled everything) ──

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expenses'
      AND column_name = 'description'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expenses'
      AND column_name = 'title'
  ) THEN
    ALTER TABLE expenses RENAME COLUMN description TO title;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expenses'
      AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'expenses'
      AND column_name = 'created_by'
  ) THEN
    ALTER TABLE expenses RENAME COLUMN user_id TO created_by;
  END IF;
END
$migration$;

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6) NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(14,4),
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS expense_date DATE NOT NULL DEFAULT CURRENT_DATE;

UPDATE expenses
SET amount_usd = amount
WHERE amount_usd IS NULL AND amount IS NOT NULL;

UPDATE expenses
SET expense_date = COALESCE(expense_date, created_at::date, CURRENT_DATE)
WHERE expense_date IS NULL;

ALTER TABLE expenses
ALTER COLUMN amount_usd SET NOT NULL;

ALTER TABLE expenses
ALTER COLUMN expense_date SET NOT NULL;

ALTER TABLE expenses
DROP CONSTRAINT IF EXISTS expenses_user_id_fkey;

ALTER TABLE expenses
DROP CONSTRAINT IF EXISTS expenses_created_by_fkey;

ALTER TABLE expenses
ADD CONSTRAINT expenses_created_by_fkey
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_date_idx
ON expenses(expense_date);

CREATE INDEX IF NOT EXISTS expenses_category_idx
ON expenses(category);