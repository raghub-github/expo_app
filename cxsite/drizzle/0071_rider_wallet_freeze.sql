-- ============================================================================
-- Rider Wallet Freeze: Agent action tracking and history
-- Migration: 0071_rider_wallet_freeze
--
-- 1. Add freeze state to rider_wallet: is_frozen, frozen_at, frozen_by_system_user_id
-- 2. Create rider_wallet_freeze_history for full audit trail (who froze/unfroze, when, reason)
-- 3. Enables blocking withdrawals when wallet is frozen; track agent who froze/unfroze
-- ============================================================================

-- Add freeze columns to rider_wallet
ALTER TABLE rider_wallet
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_at timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_by_system_user_id integer REFERENCES system_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN rider_wallet.is_frozen IS 'When true, rider cannot request or complete withdrawals';
COMMENT ON COLUMN rider_wallet.frozen_at IS 'When the wallet was last frozen (null if not frozen)';
COMMENT ON COLUMN rider_wallet.frozen_by_system_user_id IS 'Agent (system_users.id) who last froze the wallet';

CREATE INDEX IF NOT EXISTS rider_wallet_is_frozen_idx ON rider_wallet(is_frozen) WHERE is_frozen = true;
CREATE INDEX IF NOT EXISTS rider_wallet_frozen_by_idx ON rider_wallet(frozen_by_system_user_id) WHERE frozen_by_system_user_id IS NOT NULL;

-- Create freeze/unfreeze history table for full audit trail
CREATE TABLE IF NOT EXISTS rider_wallet_freeze_history (
  id bigserial PRIMARY KEY,
  rider_id integer NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('freeze', 'unfreeze')),
  performed_by_system_user_id integer NOT NULL REFERENCES system_users(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rider_wallet_freeze_history_rider_id_idx ON rider_wallet_freeze_history(rider_id);
CREATE INDEX IF NOT EXISTS rider_wallet_freeze_history_created_at_idx ON rider_wallet_freeze_history(created_at DESC);
CREATE INDEX IF NOT EXISTS rider_wallet_freeze_history_performed_by_idx ON rider_wallet_freeze_history(performed_by_system_user_id);

COMMENT ON TABLE rider_wallet_freeze_history IS 'Audit log of wallet freeze/unfreeze actions with agent tracking';
