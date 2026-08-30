-- Rollback for 0583_waiting_start_mode_step3.sql
ALTER TABLE service_payout_rules
  DROP CONSTRAINT IF EXISTS service_payout_rules_waiting_start_mode_chk;

ALTER TABLE service_payout_rules
  DROP COLUMN IF EXISTS waiting_kpt_grace_minutes,
  DROP COLUMN IF EXISTS waiting_start_mode;
