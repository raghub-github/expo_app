-- =============================================================================
-- Purge test/dummy riders (keep id 1000 and 1052)
-- =============================================================================
-- Do NOT delete from Supabase Table UI — use this SQL script.
-- Run ENTIRE file in SQL Editor (Ctrl+A → Run).
-- =============================================================================

BEGIN;

SELECT 'order_rider_assignments_current (must be 0 after)' AS label,
       COUNT(*)::bigint AS n
FROM public.order_rider_assignments_current c
WHERE c.rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

-- Step 0: referrals
UPDATE public.riders r
SET referred_by = NULL, updated_at = NOW()
WHERE r.referred_by = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

-- Step 1: RESTRICT FK tables (plain SQL — no DO block)
DELETE FROM public.order_rider_assignments_current
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

DELETE FROM public.order_rider_assignment_timeline_events
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

DELETE FROM public.order_rider_assignments
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

DELETE FROM public.order_rider_dispatch_assignment_audit
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

DELETE FROM public.order_rider_ride_unassignments
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

DELETE FROM public.order_rider_assignment_events
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[])
   OR previous_rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

-- Optional tables (ignore if missing)
DO $purge$
DECLARE
  purge_ids int[] := ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[];
BEGIN
  IF to_regclass('public.order_rider_actions') IS NOT NULL THEN
    DELETE FROM public.order_rider_actions a WHERE a.rider_id = ANY (purge_ids);
  END IF;
  IF to_regclass('public.customer_tips_given') IS NOT NULL THEN
    DELETE FROM public.customer_tips_given t WHERE t.rider_id = ANY (purge_ids);
  END IF;
  IF to_regclass('public.rider_tracking_points') IS NOT NULL THEN
    DELETE FROM public.rider_tracking_points p WHERE p.rider_id = ANY (purge_ids);
  END IF;
  IF to_regclass('public.order_dispatch_wave_riders') IS NOT NULL THEN
    DELETE FROM public.order_dispatch_wave_riders w WHERE w.rider_id = ANY (purge_ids);
  END IF;
  IF to_regclass('public.rider_dispatch_order_exclusions') IS NOT NULL THEN
    DELETE FROM public.rider_dispatch_order_exclusions x WHERE x.rider_id = ANY (purge_ids);
  END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN
    UPDATE public.orders o SET current_rider_id = NULL, updated_at = NOW()
    WHERE o.current_rider_id = ANY (purge_ids);
  END IF;
END $purge$;

UPDATE public.orders_core oc
SET rider_id = NULL, updated_at = NOW()
WHERE oc.rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

UPDATE public.orders_ride r
SET assigned_rider_id = NULL, updated_at = NOW()
WHERE r.assigned_rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

DELETE FROM public.riders r
WHERE r.id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[])
  AND r.id NOT IN (1000, 1052);

SELECT 'remaining purge ids' AS label, COUNT(*)::bigint AS n
FROM public.riders r
WHERE r.id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

ROLLBACK;  -- dry run — then swap to COMMIT
-- COMMIT;
