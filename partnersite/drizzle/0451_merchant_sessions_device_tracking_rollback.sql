-- Rollback 0451_merchant_sessions_device_tracking.sql

BEGIN;

DROP INDEX IF EXISTS public.merchant_sessions_merchant_logged_out_idx;
DROP INDEX IF EXISTS public.merchant_sessions_merchant_active_seen_idx;

ALTER TABLE public.merchant_sessions
  DROP COLUMN IF EXISTS login_method,
  DROP COLUMN IF EXISTS device_label,
  DROP COLUMN IF EXISTS ip_address,
  DROP COLUMN IF EXISTS user_agent,
  DROP COLUMN IF EXISTS logged_out_at,
  DROP COLUMN IF EXISTS last_seen_at;

COMMIT;
