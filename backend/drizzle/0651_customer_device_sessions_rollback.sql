-- Rollback 0651_customer_device_sessions.sql

BEGIN;

DROP INDEX IF EXISTS public.user_device_sessions_customer_app_active_idx;

COMMENT ON COLUMN public.user_device_sessions.app_source IS
  'Client surface that owns this session: merchant_app | partnersite | dashboard. NULL = legacy row.';

COMMIT;
