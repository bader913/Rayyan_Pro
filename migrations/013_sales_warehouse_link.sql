ALTER TABLE sales
ADD COLUMN IF NOT EXISTS warehouse_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_warehouse_id_fkey'
  ) THEN
    ALTER TABLE sales
    ADD CONSTRAINT sales_warehouse_id_fkey
    FOREIGN KEY (warehouse_id)
    REFERENCES warehouses(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_warehouse_id_idx
ON sales (warehouse_id);