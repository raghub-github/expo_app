-- §30 out-of-order GPS guard: record the device fix time on the active-location
-- cache so a stale/out-of-order GPS fix can't overwrite a newer one.
-- Nullable + no backfill: legacy/non-GPS writes leave it NULL and keep
-- last-write-wins behaviour.
ALTER TABLE public.customer_active_location
  ADD COLUMN IF NOT EXISTS gps_captured_at timestamptz;
