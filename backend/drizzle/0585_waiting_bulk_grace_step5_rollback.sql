-- Rollback for 0585_waiting_bulk_grace_step5.sql
ALTER TABLE service_payout_rules
  DROP COLUMN IF EXISTS waiting_bulk_extra_grace_minutes,
  DROP COLUMN IF EXISTS waiting_bulk_item_threshold,
  DROP COLUMN IF EXISTS waiting_bulk_value_threshold;
