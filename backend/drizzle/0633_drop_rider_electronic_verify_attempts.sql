-- 0633_drop_rider_electronic_verify_attempts.sql
-- Remove Verify Instantly rate-limit table (2 attempts / 24h).
-- Cashfree electronic verification is unrestricted again.
-- Idempotent: safe if table already missing.

DROP TABLE IF EXISTS public.rider_electronic_verify_attempts;
