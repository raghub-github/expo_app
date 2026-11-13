-- 0650_user_device_sessions_app_source.sql
-- Merchant device list (Contact details): distinguish merchant app vs partnersite
-- and keep a short user-agent for friendly labels (Windows / macOS / Linux / phone model).
--
-- I/O SAFE: additive nullable columns only. No backfill, no table rewrite.
-- Existing rows keep working; new logins populate these fields.
--
-- PRODUCTION: apply only through the authorized migration process.

BEGIN;

ALTER TABLE public.user_device_sessions
  ADD COLUMN IF NOT EXISTS app_source TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

COMMENT ON COLUMN public.user_device_sessions.app_source IS
  'Client surface that owns this session: merchant_app | partnersite | dashboard. NULL = legacy row.';

COMMENT ON COLUMN public.user_device_sessions.user_agent IS
  'Short user-agent (web) used to derive Windows/macOS/Linux/browser labels. Nullable.';

-- Partial index for active merchant-app / partnersite lookups by user (small, write-light).
CREATE INDEX IF NOT EXISTS user_device_sessions_user_app_source_active_idx
  ON public.user_device_sessions USING btree (user_id, app_source)
  WHERE is_active = TRUE;

COMMIT;
