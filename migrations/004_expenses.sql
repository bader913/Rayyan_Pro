-- ── Expenses Table (robust + compatible) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS expenses (
  id            BIGSERIAL PRIMARY KEY,
  title         VARCHAR(200)   NOT NULL,
  category      VARCHAR(100)   NOT NULL DEFAULT 'عام',
  amount        NUMERIC(14,4)  NOT NULL CHECK (amount > 0),
  currency      VARCHAR(10)    NOT NULL DEFAULT 'USD',
  exchange_rate NUMERIC(14,6)  NOT NULL DEFAULT 1,
  amount_usd    NUMERIC(14,4),
  expense_date  DATE           NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  created_by    BIGINT,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

DO $migration$
BEGIN
  -- rename legacy columns if they exist
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
ADD COLUMN IF NOT EXISTS title VARCHAR(200),
ADD COLUMN IF NOT EXISTS category VARCHAR(100) NOT NULL DEFAULT 'عام',
ADD COLUMN IF NOT EXISTS amount NUMERIC(14,4),
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(14,6) NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS amount_usd NUMERIC(14,4),
ADD COLUMN IF NOT EXISTS expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS created_by BIGINT,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- backfill safe defaults for old rows
UPDATE expenses
SET title = COALESCE(NULLIF(title, ''), 'مصروف')
WHERE title IS NULL OR title = '';

UPDATE expenses
SET currency = COALESCE(NULLIF(currency, ''), 'USD')
WHERE currency IS NULL OR currency = '';

UPDATE expenses
SET exchange_rate = COALESCE(exchange_rate, 1)
WHERE exchange_rate IS NULL;

UPDATE expenses
SET amount_usd = amount
WHERE amount_usd IS NULL AND amount IS NOT NULL;

UPDATE expenses
SET expense_date = COALESCE(expense_date, created_at::date, CURRENT_DATE)
WHERE expense_date IS NULL;

-- enforce not null only after backfill
ALTER TABLE expenses
ALTER COLUMN title SET NOT NULL;

ALTER TABLE expenses
ALTER COLUMN amount SET NOT NULL;

ALTER TABLE expenses
ALTER COLUMN amount_usd SET NOT NULL;

ALTER TABLE expenses
ALTER COLUMN expense_date SET NOT NULL;

-- rebuild foreign key safely
ALTER TABLE expenses
DROP CONSTRAINT IF EXISTS expenses_user_id_fkey;

ALTER TABLE expenses
DROP CONSTRAINT IF EXISTS expenses_created_by_fkey;

ALTER TABLE expenses
ADD CONSTRAINT expenses_created_by_fkey
FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- indexes only after ensuring columns exist
CREATE INDEX IF NOT EXISTS expenses_date_idx
ON expenses(expense_date);

CREATE INDEX IF NOT EXISTS expenses_category_idx
ON expenses(category);