DROP TABLE IF EXISTS public.gm_financial_execution_ledger CASCADE;
DROP TABLE IF EXISTS public.gm_rule_funding_config CASCADE;

DROP FUNCTION IF EXISTS public.gm_write_execution_ledger(BIGINT, BIGINT, BIGINT, JSONB, TEXT, BIGINT);
DROP FUNCTION IF EXISTS public.gm_validate_financial_reconciliation(JSONB);
DROP FUNCTION IF EXISTS public.gm_build_funding_reconciliation_plan(BIGINT, JSONB);
DROP FUNCTION IF EXISTS public.gm_resolve_refund_funding_split(BIGINT);

DROP TYPE IF EXISTS public.gm_customer_penalty_recovery_source CASCADE;
DROP TYPE IF EXISTS public.gm_rider_penalty_recovery_source CASCADE;
DROP TYPE IF EXISTS public.gm_merchant_penalty_recovery_source CASCADE;
DROP TYPE IF EXISTS public.gm_refund_funding_source CASCADE;

-- Re-run 0249 to restore prior gm_execute_rule / gm_calc_rule_financial_amounts / gm_build_rule_snapshot
