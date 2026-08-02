-- Rollback for 0472_referral_codes_resync.sql
-- This migration only upserts / syncs data; it does not create tables.
-- Rollback is a no-op for schema. Do NOT delete referral_codes rows — that
-- would break live referrals. If you must undo a bad sync, restore from backup.

SELECT 1;
