-- Persist checkout flags and full cart JSON on orders_core; align with pending_orders.

ALTER TABLE public.orders_core
  ADD COLUMN IF NOT EXISTS donation_amount numeric(12, 2),
  ADD COLUMN IF NOT EXISTS checkout_metadata jsonb;

ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS checkout_metadata jsonb;

COMMENT ON COLUMN public.orders_core.items IS
  'Denormalized cart JSON (same as pending_orders.items_snapshot) for audits and legacy readers.';
COMMENT ON COLUMN public.orders_core.donation_amount IS
  'Donation line from checkout (also in billing_snapshot).';
COMMENT ON COLUMN public.orders_core.checkout_metadata IS
  'Non-billing checkout flags: leaveAtDoor, notes, subscriptionOptIn, etc.';
COMMENT ON COLUMN public.pending_orders.checkout_metadata IS
  'Client checkout flags captured before payment; copied to orders_core on finalize.';
