-- =============================================================================
-- Remap rider id 1052 → 1001 (keep 1000 unchanged)
-- Next onboarding rider gets id 1002 (sequence reset at end)
-- =============================================================================
-- Run ENTIRE file in Supabase SQL Editor.
-- Rider must RE-LOGIN after this (JWT sub changes usr_1052 → usr_1001).
-- =============================================================================

BEGIN;

DO $remap$
DECLARE
  old_id   constant int := 1052;
  new_id   constant int := 1001;
  r        record;
  orig_mobile        text;
  orig_referral      text;
  orig_aadhaar       text;
  orig_pan           text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.riders WHERE id = old_id) THEN
    RAISE EXCEPTION 'Rider % not found', old_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.riders WHERE id = new_id) THEN
    RAISE EXCEPTION 'Rider % already exists — free that id first', new_id;
  END IF;

  SELECT mobile, referral_code, aadhaar_number, pan_number
  INTO orig_mobile, orig_referral, orig_aadhaar, orig_pan
  FROM public.riders
  WHERE id = old_id;

  -- Free UNIQUE(mobile) / UNIQUE(referral_code) so clone can use originals
  UPDATE public.riders
  SET
    mobile = '__tmp_remap_' || old_id::text,
    referral_code = '__tmp_remap_' || old_id::text,
    aadhaar_number = CASE
      WHEN aadhaar_number IS NOT NULL THEN '__tmp_' || old_id::text
      ELSE NULL
    END,
    pan_number = CASE
      WHEN pan_number IS NOT NULL THEN '__TMP' || old_id::text
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE id = old_id;

  -- Clone rider row with new primary key
  INSERT INTO public.riders (
    id,
    mobile,
    country_code,
    name,
    aadhaar_number,
    pan_number,
    dob,
    selfie_url,
    onboarding_stage,
    kyc_status,
    status,
    city,
    state,
    pincode,
    address,
    lat,
    lon,
    referral_code,
    referred_by,
    default_language,
    created_at,
    updated_at,
    vehicle_choice,
    preferred_service_types,
    deleted_at,
    deleted_by,
    created_by,
    updated_by,
    area_manager_id,
    locality_code,
    availability_status,
    emergency_contacts,
    subscription_dues_outstanding,
    subscription_dispatch_blocked,
    subscription_dispatch_blocked_at,
    subscription_negative_since,
    last_rider_income_at
  )
  OVERRIDING SYSTEM VALUE
  SELECT
    new_id,
    orig_mobile,
    country_code,
    name,
    orig_aadhaar,
    orig_pan,
    dob,
    selfie_url,
    onboarding_stage,
    kyc_status,
    status,
    city,
    state,
    pincode,
    address,
    lat,
    lon,
    orig_referral,
    referred_by,
    default_language,
    created_at,
    NOW(),
    vehicle_choice,
    preferred_service_types,
    deleted_at,
    deleted_by,
    created_by,
    updated_by,
    area_manager_id,
    locality_code,
    availability_status,
    emergency_contacts,
    subscription_dues_outstanding,
    subscription_dispatch_blocked,
    subscription_dispatch_blocked_at,
    subscription_negative_since,
    last_rider_income_at
  FROM public.riders
  WHERE id = old_id;

  -- 1:1 tables (UNIQUE/PK on rider_id): INSERT above may create empty stub at new_id.
  -- Delete stub row at new_id, then repoint old_id → new_id (avoid duplicate key).
  IF to_regclass('public.rider_wallet') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.rider_wallet WHERE rider_id = old_id) THEN
      DELETE FROM public.rider_wallet WHERE rider_id = new_id;
      UPDATE public.rider_wallet SET rider_id = new_id WHERE rider_id = old_id;
    END IF;
  END IF;

  IF to_regclass('public.rider_dispatch_offer_stats') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.rider_dispatch_offer_stats WHERE rider_id = old_id) THEN
      DELETE FROM public.rider_dispatch_offer_stats WHERE rider_id = new_id;
      UPDATE public.rider_dispatch_offer_stats SET rider_id = new_id WHERE rider_id = old_id;
    END IF;
  END IF;

  IF to_regclass('public.rider_live_locations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.rider_live_locations WHERE rider_id = old_id) THEN
      DELETE FROM public.rider_live_locations WHERE rider_id = new_id;
      UPDATE public.rider_live_locations SET rider_id = new_id WHERE rider_id = old_id;
    END IF;
  END IF;

  IF to_regclass('public.rider_leaderboard') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.rider_leaderboard WHERE rider_id = old_id) THEN
      DELETE FROM public.rider_leaderboard WHERE rider_id = new_id;
      UPDATE public.rider_leaderboard SET rider_id = new_id WHERE rider_id = old_id;
    END IF;
  END IF;

  IF to_regclass('public.rider_performance_summary') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.rider_performance_summary WHERE rider_id = old_id) THEN
      DELETE FROM public.rider_performance_summary WHERE rider_id = new_id;
      UPDATE public.rider_performance_summary SET rider_id = new_id WHERE rider_id = old_id;
    END IF;
  END IF;

  -- Repoint every FK column that references riders(id) (skip 1:1 tables handled above)
  FOR r IN
    SELECT
      tc.table_schema,
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_schema = 'public'
      AND ccu.table_name = 'riders'
      AND ccu.column_name = 'id'
      AND tc.table_name <> 'riders'
      AND tc.table_name NOT IN (
        'rider_wallet',
        'rider_dispatch_offer_stats',
        'rider_live_locations',
        'rider_leaderboard',
        'rider_performance_summary'
      )
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
      r.table_schema, r.table_name, r.column_name, r.column_name
    )
    USING new_id, old_id;
    RAISE NOTICE 'Updated %.% : % -> %', r.table_name, r.column_name, old_id, new_id;
  END LOOP;

  -- riders.referred_by (self-FK on riders, not covered if same table — cover explicitly)
  UPDATE public.riders
  SET referred_by = new_id, updated_at = NOW()
  WHERE referred_by = old_id;

  -- Auth / location string ids (usr_1052 → usr_1001)
  IF to_regclass('public.rider_location_events') IS NOT NULL THEN
    UPDATE public.rider_location_events
    SET user_id = 'usr_' || new_id::text
    WHERE user_id = 'usr_' || old_id::text;
  END IF;

  IF to_regclass('public.expo_push_tokens') IS NOT NULL THEN
    UPDATE public.expo_push_tokens
    SET user_id = 'usr_' || new_id::text
    WHERE user_id = 'usr_' || old_id::text;
  END IF;

  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    UPDATE public.user_profiles
    SET user_id = 'usr_' || new_id::text
    WHERE user_id = 'usr_' || old_id::text;
  END IF;

  -- Document storage paths (optional)
  UPDATE public.riders
  SET selfie_url = REPLACE(selfie_url, '/1052/', '/1001/')
  WHERE id = new_id
    AND selfie_url LIKE '%/1052/%';

  -- Remove old rider row
  DELETE FROM public.riders WHERE id = old_id;

  RAISE NOTICE 'Remapped rider % -> %', old_id, new_id;
END $remap$;

-- Reset id sequence: next new rider = MAX(id) + 1 (expect 1002)
DO $seq$
DECLARE
  v_max   integer;
  v_next  integer;
BEGIN
  SELECT COALESCE(MAX(id), 999) INTO v_max FROM public.riders;
  v_next := GREATEST(v_max + 1, 1000);

  BEGIN
    EXECUTE format('ALTER TABLE public.riders ALTER COLUMN id RESTART WITH %s', v_next);
  EXCEPTION
    WHEN OTHERS THEN
      IF to_regclass('public.riders_id_seq') IS NOT NULL THEN
        PERFORM setval('public.riders_id_seq', v_next, false);
      END IF;
  END;

  RAISE NOTICE 'Next rider id will be %', v_next;
END $seq$;

-- Verify
SELECT id, mobile, name, referral_code FROM public.riders ORDER BY id;

SELECT
  (SELECT MAX(id) FROM public.riders) AS max_rider_id,
  COALESCE(
    (SELECT last_value FROM public.riders_id_seq),
    (SELECT pg_sequence_last_value('public.riders_id_seq'::regclass))
  ) AS sequence_last_value;

COMMIT;
