ALTER TABLE purchases
ADD COLUMN IF NOT EXISTS warehouse_id BIGINT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchases_warehouse_id_fkey'
  ) THEN
    ALTER TABLE purchases
    ADD CONSTRAINT purchases_warehouse_id_fkey
    FOREIGN KEY (warehouse_id)
    REFERENCES warehouses(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS purchases_warehouse_id_idx
ON purchases (warehouse_id);