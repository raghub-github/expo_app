-- 0396: Remove Razorpay as a verification provider.
--
-- Decision (2026-06-29): document / bank / UPI verification runs on Cashfree
-- or manual review ONLY. Razorpay remains a *payments* provider elsewhere in
-- the platform, but it must never verify KYC docs, bank accounts or UPI IDs.
--
-- What this does:
--   1. Deletes every razorpay row from verification_switches (the rows the
--      super-admin Policy Center was showing).
--   2. Deletes the razorpay verification_provider_configs row.
--   3. Repoints any verification_policies that referenced razorpay to cashfree.
--
-- What this deliberately does NOT do:
--   - Drop 'razorpay' from the verification_provider_kind enum. Postgres
--     cannot remove enum values in place, and historical rows in
--     verification_requests / verification_audit_logs may reference it.
--     The value stays in the type but nothing active uses it.

BEGIN;

-- 3 first: policies must stop referencing razorpay before configs go away.
UPDATE verification_policies
   SET provider = 'cashfree',
       updated_at = NOW(),
       notes = COALESCE(notes, '') || ' [0396: provider razorpay -> cashfree]'
 WHERE provider = 'razorpay';

DELETE FROM verification_switches
 WHERE provider = 'razorpay';

DELETE FROM verification_provider_configs
 WHERE provider = 'razorpay';

COMMIT;