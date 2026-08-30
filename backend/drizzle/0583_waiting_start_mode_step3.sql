-- Waiting Start Mode (Step 3) — configurable food waiting start: FIXED_GRACE (rider arrival
-- + fixed grace, the current behavior) or KPT_PLUS_GRACE (billable only after the merchant's
-- ORIGINAL kitchen-prep commitment + grace). Additive + idempotent. Defaults to FIXED_GRACE
-- so behavior is unchanged until an admin opts a geo/service into KPT_PLUS_GRACE.

ALTER TABLE service_payout_rules
  ADD COLUMN IF NOT EXISTS waiting_start_mode text NOT NULL DEFAULT 'FIXED_GRACE',
  ADD COLUMN IF NOT EXISTS waiting_kpt_grace_minutes integer;

DO $$
BEGIN
  ALTER TABLE service_payout_rules
    ADD CONSTRAINT service_payout_rules_waiting_start_mode_chk
    CHECK (waiting_start_mode IN ('FIXED_GRACE', 'KPT_PLUS_GRACE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN service_payout_rules.waiting_start_mode IS
  'When waiting starts: FIXED_GRACE (arrival + waiting_free_minutes) | KPT_PLUS_GRACE (after original prep_ready_by_at + waiting_kpt_grace_minutes).';
COMMENT ON COLUMN service_payout_rules.waiting_kpt_grace_minutes IS
  'Extra grace (minutes) after the merchant''s original KPT commitment before waiting is billable (KPT_PLUS_GRACE).';
