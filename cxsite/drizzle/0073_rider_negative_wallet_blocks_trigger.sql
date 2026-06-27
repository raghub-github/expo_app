-- =============================================================================
-- Auto-sync rider_negative_wallet_blocks from rider_wallet
-- When wallet balance for a service (earnings - penalties) goes negative:
--   → INSERT block for that service (if not already present).
-- When balance recovers to >= 0 (add amount or penalty revert):
--   → DELETE block for that service.
-- Runs automatically on INSERT/UPDATE of rider_wallet (any change to
-- earnings_* or penalties_* columns).
-- =============================================================================

CREATE OR REPLACE FUNCTION sync_rider_negative_wallet_blocks_from_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  net_food   NUMERIC;
  net_parcel NUMERIC;
  net_person NUMERIC;
BEGIN
  -- Per-service net = earnings - penalties (only that service)
  net_food   := COALESCE(NEW.earnings_food, 0)   - COALESCE(NEW.penalties_food, 0);
  net_parcel := COALESCE(NEW.earnings_parcel, 0) - COALESCE(NEW.penalties_parcel, 0);
  net_person := COALESCE(NEW.earnings_person_ride, 0) - COALESCE(NEW.penalties_person_ride, 0);

  -- Replace blocks for this rider: delete all, then insert only services with net < 0.
  -- This avoids stale rows (e.g. all three blocked when only one service was penalized).
  DELETE FROM rider_negative_wallet_blocks WHERE rider_id = NEW.rider_id;

  IF net_food < 0 THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'food', 'negative_wallet');
  END IF;
  IF net_parcel < 0 THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'parcel', 'negative_wallet');
  END IF;
  IF net_person < 0 THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'person_ride', 'negative_wallet');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_rider_negative_wallet_blocks_from_wallet() IS
  'Trigger: sync rider_negative_wallet_blocks from rider_wallet. Block service when net (earnings - penalties) < 0; unblock when >= 0.';

-- Drop if exists so we can re-run migration
DROP TRIGGER IF EXISTS rider_wallet_sync_negative_blocks ON rider_wallet;

-- Fire on ANY INSERT/UPDATE so blocks stay in sync (e.g. after ledger-triggered refund/penalty_reversal)
CREATE TRIGGER rider_wallet_sync_negative_blocks
  AFTER INSERT OR UPDATE
  ON rider_wallet
  FOR EACH ROW
  EXECUTE FUNCTION sync_rider_negative_wallet_blocks_from_wallet();
