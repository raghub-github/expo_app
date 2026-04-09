-- Add snooze support to unified tickets with backwards-compatible defaults.
-- Safe for rolling deploys:
-- - enum extension is additive
-- - new columns are nullable
-- - existing rows remain unchanged (snoozed_until defaults null)

ALTER TYPE public.unified_ticket_status ADD VALUE IF NOT EXISTS 'SNOOZED';

ALTER TABLE public.unified_tickets
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS snooze_reason TEXT;

-- Explicitly normalize historic data; keeps migration idempotent.
UPDATE public.unified_tickets
SET snoozed_until = NULL
WHERE snoozed_until IS NOT NULL
  AND status::text <> 'SNOOZED';

-- Targeted wake-up query index: status + time window lookup.
CREATE INDEX IF NOT EXISTS unified_tickets_status_snoozed_until_idx
  ON public.unified_tickets (status, snoozed_until)
  WHERE snoozed_until IS NOT NULL;
