-- Activity tracking for store open/close: who toggled (merchant, agent, or auto).
-- Used by dashboard and orders page; email saved for manual toggles, type for auto.

ALTER TABLE public.merchant_store_availability
  ADD COLUMN IF NOT EXISTS last_toggled_by_email text,
  ADD COLUMN IF NOT EXISTS last_toggle_type text,
  ADD COLUMN IF NOT EXISTS last_toggled_at timestamp with time zone;

COMMENT ON COLUMN public.merchant_store_availability.last_toggled_by_email IS 'Email of user who last manually toggled store (merchant/agent); null if auto';
COMMENT ON COLUMN public.merchant_store_availability.last_toggle_type IS 'MERCHANT | AGENT | AUTO_OPEN | AUTO_CLOSE';
COMMENT ON COLUMN public.merchant_store_availability.last_toggled_at IS 'When the last toggle (manual or auto) occurred';
