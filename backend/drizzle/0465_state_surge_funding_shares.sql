-- Phase 3 — Surge funding models.
--
-- Extend `state_surge_configs` so each surge rule declares WHO funds the
-- surge amount:
--
--   CUSTOMER_100 (default): the customer pays 100% of the surge; the rider
--     collects it as a pass-through. Company earnings unaffected.
--   COMPANY_100: the customer bill does NOT include the surge; the company
--     subsidises 100% of the amount to the rider. Company receivable includes
--     the subsidy in the settlement.
--   SHARED: split between customer and company using
--     customer_share_pct + company_share_pct (must sum to 100).
--
-- Settlement math (rideSettlement.math.ts) already handles the three modes
-- via surgeCustomerShare / surgeCompanyShare — this migration just adds the
-- config surface that the resolver reads.

ALTER TABLE state_surge_configs
  ADD COLUMN IF NOT EXISTS funding_mode text NOT NULL DEFAULT 'CUSTOMER_100';

ALTER TABLE state_surge_configs
  ADD COLUMN IF NOT EXISTS customer_share_pct numeric(6, 3) NOT NULL DEFAULT 100;

ALTER TABLE state_surge_configs
  ADD COLUMN IF NOT EXISTS company_share_pct numeric(6, 3) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'state_surge_funding_mode_chk'
  ) THEN
    ALTER TABLE state_surge_configs
      ADD CONSTRAINT state_surge_funding_mode_chk
      CHECK (funding_mode IN ('CUSTOMER_100', 'COMPANY_100', 'SHARED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'state_surge_share_range_chk'
  ) THEN
    ALTER TABLE state_surge_configs
      ADD CONSTRAINT state_surge_share_range_chk
      CHECK (
        customer_share_pct >= 0
        AND customer_share_pct <= 100
        AND company_share_pct >= 0
        AND company_share_pct <= 100
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'state_surge_share_sum_chk'
  ) THEN
    ALTER TABLE state_surge_configs
      ADD CONSTRAINT state_surge_share_sum_chk
      CHECK (
        -- CUSTOMER_100 / COMPANY_100 ignore explicit shares (resolver forces
        -- them to canonical values); SHARED must sum to exactly 100.
        funding_mode <> 'SHARED'
        OR ROUND((customer_share_pct + company_share_pct)::numeric, 3) = 100
      );
  END IF;
END $$;

-- Backfill existing rows with canonical 100/0 split for CUSTOMER_100 default.
UPDATE state_surge_configs
SET customer_share_pct = 100,
    company_share_pct = 0
WHERE funding_mode = 'CUSTOMER_100'
  AND (customer_share_pct <> 100 OR company_share_pct <> 0);
