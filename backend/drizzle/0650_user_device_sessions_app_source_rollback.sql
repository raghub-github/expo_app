-- Rollback 0650_user_device_sessions_app_source.sql

BEGIN;

DROP INDEX IF EXISTS public.user_device_sessions_user_app_source_active_idx;

ALTER TABLE public.user_device_sessions
  DROP COLUMN IF EXISTS user_agent,
  DROP COLUMN IF EXISTS app_source;

COMMIT;
