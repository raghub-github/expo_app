-- Store close reason: mandatory when merchant manually closes the store.
-- Used for audit and analytics (why did the store close).

ALTER TABLE public.merchant_store_status_log
  ADD COLUMN IF NOT EXISTS close_reason text;

COMMENT ON COLUMN public.merchant_store_status_log.close_reason IS 'Reason for closing when action=CLOSED (e.g. Break/Lunch, Staff shortage, Other). Null for OPEN.';
