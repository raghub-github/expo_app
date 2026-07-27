-- Rollback 0460: drop added rider_vehicles columns + helper; leave policies as-is
-- (re-run 0459 rollback separately if Cashfree hybrid must be disabled).

DROP INDEX IF EXISTS public.rider_vehicles_chassis_number_idx;
DROP INDEX IF EXISTS public.rider_vehicles_engine_number_idx;

ALTER TABLE public.rider_vehicles
  DROP COLUMN IF EXISTS chassis_number,
  DROP COLUMN IF EXISTS engine_number,
  DROP COLUMN IF EXISTS fitness_expiry,
  DROP COLUMN IF EXISTS puc_expiry,
  DROP COLUMN IF EXISTS rc_owner_name,
  DROP COLUMN IF EXISTS cashfree_rc_payload;

DROP FUNCTION IF EXISTS public.gm_parse_cashfree_date(text);
