-- =============================================================================
-- QUICK FIX: delete test riders (keep 1000 & 1052)
-- =============================================================================
-- Supabase Table UI "Delete row" WILL FAIL — FK is ON DELETE RESTRICT.
-- Copy this ENTIRE file → SQL Editor → Run once → COMMIT at bottom.
-- =============================================================================

BEGIN;

-- ① Current assignment projection (blocks UI delete — RESTRICT FK)
DELETE FROM public.order_rider_assignments_current
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

-- ② Timeline + assignment history (RESTRICT FK)
DELETE FROM public.order_rider_assignment_timeline_events
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

DELETE FROM public.order_rider_assignments
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

DELETE FROM public.order_rider_dispatch_assignment_audit
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

DELETE FROM public.order_rider_ride_unassignments
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

-- ③ Assignment events (check constraint blocks SET NULL on delete)
DELETE FROM public.order_rider_assignment_events
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[])
   OR previous_rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

-- ④ Detach orders + referrals
UPDATE public.orders_core
SET rider_id = NULL, updated_at = NOW()
WHERE rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

UPDATE public.orders_ride
SET assigned_rider_id = NULL, updated_at = NOW()
WHERE assigned_rider_id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

UPDATE public.riders
SET referred_by = NULL, updated_at = NOW()
WHERE referred_by = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[]);

-- ⑤ Delete riders (CASCADE handles duty_logs, vehicles, wallet, etc.)
DELETE FROM public.riders
WHERE id = ANY (ARRAY[1001, 1002, 1003, 1004, 1005, 1006, 1032, 1033, 1034, 1035, 1036, 1047, 1048]::int[])
  AND id NOT IN (1000, 1052);

COMMIT;
