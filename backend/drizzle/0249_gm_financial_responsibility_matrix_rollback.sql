-- Rollback 0249 — drop new columns only (functions revert via re-run 0248)
ALTER TABLE public.gm_rule_customer_penalty
  DROP COLUMN IF EXISTS customer_compensation_pct,
  DROP COLUMN IF EXISTS customer_compensation_flat,
  DROP COLUMN IF EXISTS customer_wallet_debit,
  DROP COLUMN IF EXISTS customer_wallet_credit;

ALTER TABLE public.gm_rule_merchant_settlement
  DROP COLUMN IF EXISTS merchant_flat_penalty,
  DROP COLUMN IF EXISTS merchant_compensation_flat,
  DROP COLUMN IF EXISTS merchant_wallet_debit,
  DROP COLUMN IF EXISTS merchant_wallet_credit;

ALTER TABLE public.gm_rule_rider_settlement
  DROP COLUMN IF EXISTS rider_flat_penalty,
  DROP COLUMN IF EXISTS rider_compensation_flat,
  DROP COLUMN IF EXISTS rider_wallet_debit,
  DROP COLUMN IF EXISTS rider_wallet_credit;

ALTER TABLE public.gm_rule_platform_liability
  DROP COLUMN IF EXISTS platform_compensation_flat,
  DROP COLUMN IF EXISTS platform_absorbed_loss_pct,
  DROP COLUMN IF EXISTS platform_settlement_impact_pct;

DROP FUNCTION IF EXISTS public.gm_calc_rule_financial_amounts(BIGINT, NUMERIC);
