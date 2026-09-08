-- Stores a customer hid from their restaurant feed (About → Hide this restaurant).

CREATE TABLE IF NOT EXISTS customer_hidden_stores (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  store_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, store_id)
);

CREATE INDEX IF NOT EXISTS customer_hidden_stores_customer_idx
  ON customer_hidden_stores (customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_hidden_stores_customer_store_uidx
  ON customer_hidden_stores (customer_id, store_id);
