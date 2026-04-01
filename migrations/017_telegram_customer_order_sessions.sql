CREATE TABLE IF NOT EXISTS telegram_customer_order_sessions (
  id BIGSERIAL PRIMARY KEY,
  chat_id TEXT NOT NULL UNIQUE,
  telegram_user_id TEXT,
  telegram_username TEXT,
  telegram_full_name TEXT,
  step TEXT NOT NULL DEFAULT 'idle',
  draft_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_message_text TEXT,
  last_update_id BIGINT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS telegram_customer_order_sessions_status_idx
  ON telegram_customer_order_sessions(status);

CREATE INDEX IF NOT EXISTS telegram_customer_order_sessions_updated_at_idx
  ON telegram_customer_order_sessions(updated_at);