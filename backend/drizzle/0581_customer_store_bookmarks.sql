-- Saved stores (heart / bookmark) per customer.
-- Needed so POST /v1/bookmarks upserts and GET /v1/bookmarks can round-trip after restart.

CREATE TABLE IF NOT EXISTS customer_store_bookmarks (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  store_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, store_id)
);

CREATE INDEX IF NOT EXISTS customer_store_bookmarks_customer_idx
  ON customer_store_bookmarks (customer_id);

CREATE UNIQUE INDEX IF NOT EXISTS customer_store_bookmarks_customer_store_uidx
  ON customer_store_bookmarks (customer_id, store_id);
