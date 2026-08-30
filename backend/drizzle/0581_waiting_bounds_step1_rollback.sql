-- Rollback for 0581_waiting_bounds_step1.sql
--
-- Drops the duration-cap column. The waiting_max_charge backfill is intentionally NOT
-- reverted: once applied it is indistinguishable from an admin-set cap, and reverting it
-- would re-open the unbounded-waiting bug. The engine safety ceilings remain in code, so
-- waiting stays bounded regardless.

ALTER TABLE service_payout_rules
  DROP COLUMN IF EXISTS waiting_max_minutes;
