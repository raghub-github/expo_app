-- Rollback for 0582_waiting_merchant_funding_step2.sql
-- Reverts the CHECK to the pre-Step-2 set. Will FAIL if any rule is currently set to
-- 'MERCHANT_100' (re-point those rules first): that is intentional — silently dropping a
-- funding mode that live rules use would corrupt waiting accounting.

ALTER TABLE service_payout_rules
  DROP CONSTRAINT IF EXISTS service_payout_rules_waiting_funding_chk;

ALTER TABLE service_payout_rules
  ADD CONSTRAINT service_payout_rules_waiting_funding_chk
  CHECK (waiting_funding_mode IN ('CUSTOMER_100', 'COMPANY_100', 'SHARED'));
