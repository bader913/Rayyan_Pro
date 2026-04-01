ALTER TABLE customer_orders
DROP CONSTRAINT IF EXISTS customer_orders_source_check;

ALTER TABLE customer_orders
ADD CONSTRAINT customer_orders_source_check
CHECK (source IN ('web', 'telegram', 'telegram_web'));