-- 0451: Enrich merchant_sessions for multi-device tracking / logout-all audit.
-- Purpose: keep a proper record of every place (device/browser) a merchant parent
-- is logged in, so partners can see active device count and revoke all sessions.

BEGIN;

-- Human-readable + forensic fields (nullable for back-compat with existing rows)
ALTER TABLE public.merchant_sessions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS logged_out_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS device_label TEXT,
  ADD COLUMN IF NOT EXISTS login_method TEXT;

-- Backfill last_seen_at from updated_at / created_at for active rows
UPDATE public.merchant_sessions
SET last_seen_at = COALESCE(last_seen_at, updated_at, created_at)
WHERE last_seen_at IS NULL;

-- Active sessions that were soft-deactivated without a timestamp
UPDATE public.merchant_sessions
SET logged_out_at = COALESCE(logged_out_at, updated_at)
WHERE is_active = false
  AND logged_out_at IS NULL;

COMMENT ON COLUMN public.merchant_sessions.last_seen_at IS
  'Last time this device session was confirmed active (login or resolve-session heartbeat).';
COMMENT ON COLUMN public.merchant_sessions.logged_out_at IS
  'When this device session was deactivated (single logout or logout-all).';
COMMENT ON COLUMN public.merchant_sessions.user_agent IS
  'Browser/app User-Agent at login time.';
COMMENT ON COLUMN public.merchant_sessions.ip_address IS
  'Client IP observed at login (best-effort; may be proxy).';
COMMENT ON COLUMN public.merchant_sessions.device_label IS
  'Short label e.g. Chrome on Windows — for partner UI device list.';
COMMENT ON COLUMN public.merchant_sessions.login_method IS
  'How session was created: google | phone_otp | email | app_handoff | self_heal | unknown.';

-- Fast: "how many devices is this merchant logged into?"
CREATE INDEX IF NOT EXISTS merchant_sessions_merchant_active_seen_idx
  ON public.merchant_sessions (merchant_id, last_seen_at DESC)
  WHERE is_active = true;

-- Fast: list inactive history for a merchant (audit)
CREATE INDEX IF NOT EXISTS merchant_sessions_merchant_logged_out_idx
  ON public.merchant_sessions (merchant_id, logged_out_at DESC)
  WHERE is_active = false;

COMMENT ON TABLE public.merchant_sessions IS
  'Per-device partner login sessions for merchant_parents. One active row per device_id; logout-all deactivates all rows for merchant_id.';

COMMIT;
