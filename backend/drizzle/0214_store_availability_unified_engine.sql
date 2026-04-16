-- ============================================================================
-- 0214_store_availability_unified_engine
-- Unified Store Online/Offline Engine metadata (manual override, schedule-end prompt, auto-off)
-- Idempotent: safe to run multiple times.
-- ============================================================================

ALTER TABLE public.merchant_store_availability
  ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS manual_override_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS schedule_end_prompted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS schedule_end_prompt_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_auto_action_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS auto_off_reason TEXT NULL;

-- Helpful indexes for state + prompt expiry scans
CREATE INDEX IF NOT EXISTS merchant_store_availability_is_manual_override_idx
  ON public.merchant_store_availability (store_id)
  WHERE (is_manual_override = TRUE);

CREATE INDEX IF NOT EXISTS merchant_store_availability_schedule_end_prompt_expires_at_idx
  ON public.merchant_store_availability (schedule_end_prompt_expires_at)
  WHERE (schedule_end_prompt_expires_at IS NOT NULL);

CREATE INDEX IF NOT EXISTS merchant_store_availability_last_auto_action_at_idx
  ON public.merchant_store_availability (last_auto_action_at)
  WHERE (last_auto_action_at IS NOT NULL);

