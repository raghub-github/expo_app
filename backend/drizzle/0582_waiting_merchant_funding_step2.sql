-- Waiting Merchant Funding (Step 2) — allow food prep-delay waiting to be borne by the
-- merchant. Widens the waiting_funding_mode CHECK to include 'MERCHANT_100' so a food
-- service_payout_rule can be set to merchant-funded waiting (debits the merchant wallet;
-- the rider is still paid the waiting). Additive + idempotent; no data change.

ALTER TABLE service_payout_rules
  DROP CONSTRAINT IF EXISTS service_payout_rules_waiting_funding_chk;

ALTER TABLE service_payout_rules
  ADD CONSTRAINT service_payout_rules_waiting_funding_chk
  CHECK (waiting_funding_mode IN ('CUSTOMER_100', 'COMPANY_100', 'MERCHANT_100', 'SHARED'));

COMMENT ON COLUMN service_payout_rules.waiting_funding_mode IS
  'Who funds waiting: CUSTOMER_100 | COMPANY_100 | MERCHANT_100 (food prep-delay, debits merchant wallet) | SHARED (customer/company split).';
