-- ============================================================================
-- Pickup instructions per child store
-- Each child store can have one active pickup instruction for delivery partners.
-- ============================================================================

CREATE TABLE IF NOT EXISTS pickup_instructions (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  instruction_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pickup_store ON pickup_instructions(store_id);
CREATE INDEX IF NOT EXISTS idx_pickup_store_active ON pickup_instructions(store_id, is_active) WHERE is_active = TRUE;

COMMENT ON TABLE pickup_instructions IS 'Pickup instructions for delivery partners, one per child store when active';
