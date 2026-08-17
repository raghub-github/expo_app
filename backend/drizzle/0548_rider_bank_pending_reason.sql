-- Persist why bank stays pending after provider (Cashfree) verify / Aadhaar cross-check.
ALTER TABLE public.rider_payment_methods
  ADD COLUMN IF NOT EXISTS cross_check_status text,
  ADD COLUMN IF NOT EXISTS cross_check_messages jsonb,
  ADD COLUMN IF NOT EXISTS pending_reason text;
