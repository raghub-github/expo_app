ALTER TABLE public.rider_payment_methods
  DROP COLUMN IF EXISTS pending_reason,
  DROP COLUMN IF EXISTS cross_check_messages,
  DROP COLUMN IF EXISTS cross_check_status;
