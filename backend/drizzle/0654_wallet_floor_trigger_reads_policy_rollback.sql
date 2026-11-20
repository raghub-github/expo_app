-- 0654_wallet_floor_trigger_reads_policy_rollback.sql
-- Restores the trigger function body exactly as it was in production before 0654
-- (read from pg_get_functiondef on 2026-11-20): hardcoded -50 / -200 and a delete
-- of every block row for the rider.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.sync_rider_negative_wallet_blocks_from_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  eff_food   NUMERIC;
  eff_parcel  NUMERIC;
  eff_person  NUMERIC;
  svc_thresh NUMERIC := -50;
  global_thresh NUMERIC := -200;
  alloc_food NUMERIC;
  alloc_parcel NUMERIC;
  alloc_person NUMERIC;
  block_reason TEXT;
BEGIN
  DELETE FROM rider_negative_wallet_blocks WHERE rider_id = NEW.rider_id;

  -- Do not block any service while total wallet balance is positive
  IF COALESCE(NEW.total_balance, 0) > 0 THEN
    RETURN NEW;
  END IF;

  alloc_food   := COALESCE(NEW.unblock_alloc_food, 0);
  alloc_parcel := COALESCE(NEW.unblock_alloc_parcel, 0);
  alloc_person := COALESCE(NEW.unblock_alloc_person_ride, 0);

  eff_food   := COALESCE(NEW.earnings_food, 0)   - COALESCE(NEW.penalties_food, 0)   + alloc_food;
  eff_parcel := COALESCE(NEW.earnings_parcel, 0) - COALESCE(NEW.penalties_parcel, 0) + alloc_parcel;
  eff_person := COALESCE(NEW.earnings_person_ride, 0) - COALESCE(NEW.penalties_person_ride, 0) + alloc_person;

  -- Global emergency block: total_balance <= -200 -> block ALL services
  IF COALESCE(NEW.total_balance, 0) <= global_thresh THEN
    block_reason := 'global_emergency';
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'food', block_reason),
           (NEW.rider_id, 'parcel', block_reason),
           (NEW.rider_id, 'person_ride', block_reason);
    RETURN NEW;
  END IF;

  -- Per-service block only when total_balance <= 0: effective_net <= -50
  block_reason := 'negative_wallet';
  IF eff_food <= svc_thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'food', block_reason);
  END IF;
  IF eff_parcel <= svc_thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'parcel', block_reason);
  END IF;
  IF eff_person <= svc_thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'person_ride', block_reason);
  END IF;

  RETURN NEW;
END;
$function$;

RESET lock_timeout;
