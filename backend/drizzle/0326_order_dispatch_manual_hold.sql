-- Admin "Cancel rider only" — persist hold until manual assign or cancel+reassign.

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS dispatch_manual_hold BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.orders_core.dispatch_manual_hold IS
  'When TRUE, no dispatch offers/pool/accept until admin clears via manual assign or cancel+reassign.';

CREATE INDEX IF NOT EXISTS orders_core_dispatch_manual_hold_idx
  ON public.orders_core (dispatch_manual_hold)
  WHERE dispatch_manual_hold = TRUE AND rider_id IS NULL;
