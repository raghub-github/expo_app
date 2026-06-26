-- =============================================================================
-- Rider temporary block due to negative wallet (per service)
-- When rider's net balance for a service (earnings - penalties) goes <= -50,
-- rider is temporarily blocked for that service only. Block is auto-removed
-- when balance recovers to >= 0 (via wallet adjustment or penalty revert).
-- Block is not time-based; it depends only on wallet balance.
-- =============================================================================

CREATE TABLE IF NOT EXISTS rider_negative_wallet_blocks (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL CHECK (service_type IN ('food', 'parcel', 'person_ride')),
  reason TEXT NOT NULL DEFAULT 'negative_wallet',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rider_id, service_type)
);

CREATE INDEX IF NOT EXISTS rider_negative_wallet_blocks_rider_id_idx
  ON rider_negative_wallet_blocks(rider_id);
CREATE INDEX IF NOT EXISTS rider_negative_wallet_blocks_service_type_idx
  ON rider_negative_wallet_blocks(service_type);
CREATE INDEX IF NOT EXISTS rider_negative_wallet_blocks_rider_service_idx
  ON rider_negative_wallet_blocks(rider_id, service_type);

COMMENT ON TABLE rider_negative_wallet_blocks IS 'Temporary per-service block when rider wallet net (earnings - penalties) for that service is <= -50. Auto-removed when balance recovers to >= 0.';
COMMENT ON COLUMN rider_negative_wallet_blocks.reason IS 'Always negative_wallet for this table.';
