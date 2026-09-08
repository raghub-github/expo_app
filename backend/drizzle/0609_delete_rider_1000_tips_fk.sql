-- =============================================================================
-- 0609: Allow deleting riders referenced by customer_tips_given + remove rider 1000
-- =============================================================================
-- Problem: customer_tips_given.rider_id FK uses ON DELETE RESTRICT, so Table Editor
-- and DELETE FROM riders fail with:
--   Key (id)=(1000) is still referenced from table customer_tips_given
--
-- Fix:
--   1) Recreate FK as ON DELETE SET NULL (keep tip rows, clear rider link)
--   2) Hard-delete rider id = 1000 after clearing RESTRICT dependents
-- =============================================================================

BEGIN;

-- 1) Tips FK: RESTRICT → SET NULL
ALTER TABLE public.customer_tips_given
  DROP CONSTRAINT IF EXISTS customer_tips_given_rider_id_fkey;

ALTER TABLE public.customer_tips_given
  ADD CONSTRAINT customer_tips_given_rider_id_fkey
  FOREIGN KEY (rider_id)
  REFERENCES public.riders (id)
  ON DELETE SET NULL;

-- 2) Delete rider 1000 (skip if already gone)
DO $del$
DECLARE
  target_id constant int := 1000;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.riders WHERE id = target_id) THEN
    RAISE NOTICE 'Rider % already absent — FK fix applied only', target_id;
    RETURN;
  END IF;

  UPDATE public.riders
  SET referred_by = NULL, updated_at = NOW()
  WHERE referred_by = target_id;

  -- Known RESTRICT / assignment tables
  IF to_regclass('public.customer_tips_given') IS NOT NULL THEN
    DELETE FROM public.customer_tips_given WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.order_rider_assignments_current') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignments_current WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.order_rider_assignment_timeline_events') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignment_timeline_events WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.order_rider_assignments') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignments WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.order_rider_dispatch_assignment_audit') IS NOT NULL THEN
    DELETE FROM public.order_rider_dispatch_assignment_audit WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.order_rider_ride_unassignments') IS NOT NULL THEN
    DELETE FROM public.order_rider_ride_unassignments WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.order_rider_assignment_events') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignment_events
    WHERE rider_id = target_id OR previous_rider_id = target_id;
  END IF;

  IF to_regclass('public.order_rider_actions') IS NOT NULL THEN
    DELETE FROM public.order_rider_actions WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.rider_tracking_points') IS NOT NULL THEN
    DELETE FROM public.rider_tracking_points WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.order_dispatch_wave_riders') IS NOT NULL THEN
    DELETE FROM public.order_dispatch_wave_riders WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.rider_dispatch_order_exclusions') IS NOT NULL THEN
    DELETE FROM public.rider_dispatch_order_exclusions WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.orders_core') IS NOT NULL THEN
    UPDATE public.orders_core
    SET rider_id = NULL, updated_at = NOW()
    WHERE rider_id = target_id;
  END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    BEGIN
      UPDATE public.orders
      SET current_rider_id = NULL, updated_at = NOW()
      WHERE current_rider_id = target_id;
    EXCEPTION
      WHEN undefined_column THEN NULL;
    END;
  END IF;

  IF to_regclass('public.orders_ride') IS NOT NULL THEN
    BEGIN
      UPDATE public.orders_ride
      SET assigned_rider_id = NULL, updated_at = NOW()
      WHERE assigned_rider_id = target_id;
    EXCEPTION
      WHEN undefined_column THEN NULL;
    END;
  END IF;

  IF to_regclass('public.orders_parcel') IS NOT NULL THEN
    BEGIN
      UPDATE public.orders_parcel
      SET assigned_rider_id = NULL
      WHERE assigned_rider_id = target_id;
    EXCEPTION
      WHEN undefined_column THEN NULL;
    END;
  END IF;

  IF to_regclass('public.expo_push_tokens') IS NOT NULL THEN
    DELETE FROM public.expo_push_tokens WHERE user_id = 'usr_' || target_id::text;
  END IF;

  IF to_regclass('public.user_profiles') IS NOT NULL THEN
    DELETE FROM public.user_profiles WHERE user_id = 'usr_' || target_id::text;
  END IF;

  IF to_regclass('public.rider_location_events') IS NOT NULL THEN
    DELETE FROM public.rider_location_events WHERE user_id = 'usr_' || target_id::text;
  END IF;

  DELETE FROM public.riders WHERE id = target_id;
  RAISE NOTICE 'Deleted rider %', target_id;
END $del$;

COMMIT;
