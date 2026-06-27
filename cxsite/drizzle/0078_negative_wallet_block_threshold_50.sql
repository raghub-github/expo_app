-- =============================================================================
-- Block only when per-service net balance <= -50 (not when -49 or higher).
-- Unblock when net > -50 (e.g. after add amount or penalty revert).
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
  thresh    NUMERIC := -50;
BEGIN
  net_food   := COALESCE(NEW.earnings_food, 0)   - COALESCE(NEW.penalties_food, 0);
  net_parcel := COALESCE(NEW.earnings_parcel, 0) - COALESCE(NEW.penalties_parcel, 0);
  net_person := COALESCE(NEW.earnings_person_ride, 0) - COALESCE(NEW.penalties_person_ride, 0);

  DELETE FROM rider_negative_wallet_blocks WHERE rider_id = NEW.rider_id;

  IF net_food <= thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'food', 'negative_wallet');
  END IF;
  IF net_parcel <= thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'parcel', 'negative_wallet');
  END IF;
  IF net_person <= thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'person_ride', 'negative_wallet');
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_rider_negative_wallet_blocks_from_wallet() IS
  'Sync rider_negative_wallet_blocks from rider_wallet. Block service when net (earnings - penalties) <= -50; no block for -49 or higher.';
