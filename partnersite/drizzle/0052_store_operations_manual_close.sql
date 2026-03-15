-- Store Open/Closed engine: manual close with duration, auto-open from schedule
-- Adds columns to merchant_store_availability for:
--   - manual_close_until: when a merchant-initiated temporary close expires
--   - auto_open_from_schedule: whether to auto-open based on operating hours when manual_close_until passes

ALTER TABLE public.merchant_store_availability
  ADD COLUMN IF NOT EXISTS manual_close_until timestamp with time zone,
  ADD COLUMN IF NOT EXISTS auto_open_from_schedule boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS merchant_store_availability_manual_close_until_idx
  ON public.merchant_store_availability (store_id)
  WHERE manual_close_until IS NOT NULL;

COMMENT ON COLUMN public.merchant_store_availability.manual_close_until IS 'When manual temporary close expires; after this, store may auto-reopen if within operating hours';
COMMENT ON COLUMN public.merchant_store_availability.auto_open_from_schedule IS 'If true, when manual_close_until passes and current time is within operating hours, auto-reopen store';
