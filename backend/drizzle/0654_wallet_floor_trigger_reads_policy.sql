-- 0654_wallet_floor_trigger_reads_policy.sql
--
-- THE wallet rule: a rider is active while the wallet balance is ABOVE the floor
-- configured in Super Admin (ride_wallet_config.global_block_threshold, default
-- -200). The rider_wallet trigger that caches block rows hardcoded -200 / -50 and
-- deleted EVERY block row for the rider (fraud / manual / compliance too) on each
-- wallet write. This version:
--   * reads the active ride_wallet_config row (falls back to -200 / 50),
--   * deletes and rewrites only engine-owned rows (negative_wallet, global_emergency),
--   * never collides with a kept foreign row (ON CONFLICT DO NOTHING).
-- The per-service formula is unchanged.
--
-- I/O-safe: CREATE OR REPLACE FUNCTION only (no table rewrite, no lock on rider_wallet
-- beyond the catalog update). The trigger itself is unchanged and keeps pointing at
-- this function name. Rollback: 0654_..._rollback.sql restores the previous body.

SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.sync_rider_negative_wallet_blocks_from_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  eff_food      NUMERIC;
  eff_parcel    NUMERIC;
  eff_person    NUMERIC;
  svc_thresh    NUMERIC := -50;
  global_thresh NUMERIC := -200;
  cfg_global    NUMERIC;
  cfg_service   NUMERIC;
  alloc_food    NUMERIC;
  alloc_parcel  NUMERIC;
  alloc_person  NUMERIC;
  block_reason  TEXT;
BEGIN
  -- Live Super Admin policy (newest active row), same row the backend and dashboard read.
  BEGIN
    SELECT global_block_threshold, service_negative_threshold
      INTO cfg_global, cfg_service
      FROM ride_wallet_config
     WHERE is_active = TRUE
     ORDER BY id DESC
     LIMIT 1;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    cfg_global := NULL;
    cfg_service := NULL;
  END;
  IF cfg_global IS NOT NULL AND cfg_global <= 0 THEN
    global_thresh := cfg_global;
  END IF;
  IF cfg_service IS NOT NULL AND cfg_service > 0 THEN
    svc_thresh := -cfg_service;
  END IF;

  -- Only rows this engine owns; fraud / manual / compliance blocks are kept.
  DELETE FROM rider_negative_wallet_blocks
   WHERE rider_id = NEW.rider_id
     AND reason IN ('negative_wallet', 'global_emergency');

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

  -- At or below the floor -> block ALL services (active only while ABOVE it)
  IF COALESCE(NEW.total_balance, 0) <= global_thresh THEN
    block_reason := 'global_emergency';
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'food', block_reason),
           (NEW.rider_id, 'parcel', block_reason),
           (NEW.rider_id, 'person_ride', block_reason)
    ON CONFLICT (rider_id, service_type) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Per-service block only when total_balance <= 0 (formula unchanged)
  block_reason := 'negative_wallet';
  IF eff_food <= svc_thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'food', block_reason)
    ON CONFLICT (rider_id, service_type) DO NOTHING;
  END IF;
  IF eff_parcel <= svc_thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'parcel', block_reason)
    ON CONFLICT (rider_id, service_type) DO NOTHING;
  END IF;
  IF eff_person <= svc_thresh THEN
    INSERT INTO rider_negative_wallet_blocks (rider_id, service_type, reason)
    VALUES (NEW.rider_id, 'person_ride', block_reason)
    ON CONFLICT (rider_id, service_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

RESET lock_timeout;
