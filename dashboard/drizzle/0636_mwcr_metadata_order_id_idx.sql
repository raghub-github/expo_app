-- Speed up order-linked wallet adjustment request lookups
CREATE INDEX IF NOT EXISTS mwcr_metadata_order_id_idx
  ON merchant_wallet_credit_requests (((metadata->>'order_id')::bigint))
  WHERE metadata ? 'order_id';
