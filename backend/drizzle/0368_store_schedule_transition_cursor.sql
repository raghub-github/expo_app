-- Transition-driven store schedule cursor fields.
-- Backend scheduler processes only stores whose next transition is due.

ALTER TABLE public.merchant_store_availability
  ADD COLUMN IF NOT EXISTS status_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS last_schedule_evaluated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_schedule_transition_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_store_availability_next_schedule_transition
  ON public.merchant_store_availability (next_schedule_transition_at)
  WHERE next_schedule_transition_at IS NOT NULL;

