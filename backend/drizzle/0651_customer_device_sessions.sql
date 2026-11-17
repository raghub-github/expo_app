-- 0651_customer_device_sessions.sql
-- Customer app: track where / which devices an account is signed in on, so
-- Settings can list active sessions and "Sign out → All devices" can revoke them.
--
-- Table `user_device_sessions` already exists (0119+) with device + login geo columns.
-- This migration is additive / idempotent and I/O-safe:
--   • COMMENT only (metadata)
--   • CREATE INDEX IF NOT EXISTS (partial, small) — no table rewrite, no row UPDATE
--   • No UNIQUE index (would require dedupe UPDATE / ACCESS EXCLUSIVE risk)
--   • No backfill of existing merchant/rider rows
--
-- App upserts customer sessions in application code (persistCustomerDeviceSession).
--
-- PRODUCTION: apply only through the authorized migration process.

BEGIN;

COMMENT ON COLUMN public.user_device_sessions.app_source IS
  'Client surface that owns this session: customer_app | merchant_app | partnersite | rider_app | dashboard. NULL = legacy row.';

-- Lookup aid for Settings → Logged-in devices (customer_app only).
CREATE INDEX IF NOT EXISTS user_device_sessions_customer_app_active_idx
  ON public.user_device_sessions USING btree (user_id, last_active DESC)
  WHERE is_active = TRUE AND app_source = 'customer_app';

COMMIT;
