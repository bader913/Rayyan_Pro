-- ============================================================
-- Rayyan Pro — Migration 018: Historical Sale Cost Snapshots
-- ============================================================

ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,4);

ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS net_total NUMERIC(15,4);

ALTER TABLE sales_return_items
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,4);

ALTER TABLE sales_return_items
ADD COLUMN IF NOT EXISTS net_total NUMERIC(15,4);

DO $$
DECLARE
  bonus_expr TEXT := '0';
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sales'
      AND column_name = 'bonus_used_amount'
  ) THEN
    bonus_expr := 'COALESCE(s.bonus_used_amount, 0)';
  END IF;

  EXECUTE format($sql$
    WITH sale_agg AS (
      SELECT
        si.sale_id,
        COALESCE(SUM(si.total_price), 0) AS gross_total_after_item_discount,
        COALESCE(SUM(si.discount), 0) AS item_discount_total
      FROM sale_items si
      GROUP BY si.sale_id
    )
    UPDATE sale_items si
    SET
      unit_cost = COALESCE(si.unit_cost, p.purchase_price, 0),
      net_total = COALESCE(
        si.net_total,
        ROUND(
          GREATEST(
            si.total_price
            - CASE
                WHEN COALESCE(sa.gross_total_after_item_discount, 0) > 0 THEN
                  (
                    (
                      GREATEST(COALESCE(s.discount, 0) - COALESCE(sa.item_discount_total, 0), 0)
                      + %s
                    ) * si.total_price / sa.gross_total_after_item_discount
                  )
                ELSE 0
              END,
            0
          ),
          4
        )
      )
    FROM products p, sales s
    LEFT JOIN sale_agg sa ON sa.sale_id = s.id
    WHERE p.id = si.product_id
      AND s.id = si.sale_id
  $sql$, bonus_expr);
END $$;

UPDATE sales_return_items sri
SET
  unit_cost = COALESCE(sri.unit_cost, si.unit_cost, p.purchase_price, 0),
  net_total = COALESCE(
    sri.net_total,
    ROUND(
      CASE
        WHEN COALESCE(si.quantity, 0) > 0
          THEN (COALESCE(si.net_total, si.total_price, 0) / si.quantity) * sri.quantity
        ELSE COALESCE(sri.total_price, 0)
      END,
      4
    )
  )
FROM sale_items si, products p
WHERE si.id = sri.sale_item_id
  AND p.id = sri.product_id;

UPDATE sales_return_items sri
SET
  unit_cost = COALESCE(sri.unit_cost, p.purchase_price, 0),
  net_total = COALESCE(sri.net_total, sri.total_price, 0)
FROM products p
WHERE p.id = sri.product_id;

UPDATE sales_return_items
SET total_price = net_total
WHERE total_price IS DISTINCT FROM net_total;

UPDATE sales_returns sr
SET total_amount = COALESCE(calc.total_amount, 0)
FROM (
  SELECT
    return_id,
    COALESCE(SUM(net_total), 0) AS total_amount
  FROM sales_return_items
  GROUP BY return_id
) calc
WHERE calc.return_id = sr.id;

UPDATE sale_items
SET unit_cost = COALESCE(unit_cost, 0),
    net_total = COALESCE(net_total, total_price, 0)
WHERE unit_cost IS NULL OR net_total IS NULL;

UPDATE sales_return_items
SET unit_cost = COALESCE(unit_cost, 0),
    net_total = COALESCE(net_total, total_price, 0)
WHERE unit_cost IS NULL OR net_total IS NULL;

ALTER TABLE sale_items
ALTER COLUMN unit_cost SET NOT NULL;

ALTER TABLE sale_items
ALTER COLUMN net_total SET NOT NULL;

ALTER TABLE sales_return_items
ALTER COLUMN unit_cost SET NOT NULL;

ALTER TABLE sales_return_items
ALTER COLUMN net_total SET NOT NULL;