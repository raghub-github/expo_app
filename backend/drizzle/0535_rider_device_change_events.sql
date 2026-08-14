-- Single-device login enforcement for riders: append-only log of genuine device-switch
-- events, used to rate-limit how often a rider can change devices (3 per rolling 24h,
-- 10 per rolling 30d — enforced in application code, see
-- backend/src/lib/rider-device-change-policy.ts).
--
-- user_device_sessions (0119/0378) is upserted per (user_id, device_id) — reactivated on
-- relogin, not appended — so it cannot answer "how many times did this rider switch
-- devices in the last 24h/30d". This table exists purely to answer that question.
--
-- Only genuine device CHANGES are recorded here: never a relogin on the same device,
-- never a rider's first-ever login (there is no "from" device to log), and never a login
-- from the app-store review-bypass phone (see reviewMode.ts) — all three are decided in
-- application code before a row would be inserted.
--
-- No FK on rider_id, matching user_device_sessions' existing denormalized-rider_id
-- convention in this table family (0119/0378) — riderId is always resolved by the caller
-- before this row is written.

CREATE TABLE IF NOT EXISTS public.rider_device_change_events (
  id BIGSERIAL PRIMARY KEY,
  rider_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  from_device_id TEXT NOT NULL,
  to_device_id TEXT NOT NULL,
  ip_address TEXT NULL,
  login_method TEXT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rate-limit lookups: COUNT(*)/MIN(changed_at) WHERE rider_id = $1 AND changed_at > now() - interval.
CREATE INDEX IF NOT EXISTS rider_device_change_events_rider_changed_idx
  ON public.rider_device_change_events USING btree (rider_id, changed_at DESC);

COMMENT ON TABLE public.rider_device_change_events IS
  'Append-only: one row per genuine rider device switch (never same-device relogin, first-ever login, or the review-bypass phone). Drives the 3-per-24h / 10-per-30-day device-change limit.';
COMMENT ON COLUMN public.rider_device_change_events.from_device_id IS
  'The device_id being switched away from. Always populated — a row is only ever inserted when a prior device genuinely exists.';
COMMENT ON COLUMN public.rider_device_change_events.to_device_id IS
  'The new device_id being switched to (the one that becomes the rider''s single active session).';
