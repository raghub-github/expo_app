-- Enforce at most one active session per device_id.
-- Prevents duplicate active rows when multiple set-cookie requests run (e.g. double mount).

DROP INDEX IF EXISTS public.merchant_sessions_device_id_idx;

CREATE UNIQUE INDEX merchant_sessions_one_active_per_device
  ON public.merchant_sessions(device_id)
  WHERE is_active = true;

COMMENT ON INDEX public.merchant_sessions_one_active_per_device IS
  'One active session per device; second insert for same device fails until first is deactivated.';
