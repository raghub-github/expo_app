-- ============================================================================
-- 0246 ROLLBACK: GatiMitra Financial Rule Engine
-- Run manually to reverse 0246_gm_financial_rule_engine.sql
-- ============================================================================

DROP FUNCTION IF EXISTS public.gm_execute_order_cancellation CASCADE;
DROP FUNCTION IF EXISTS public.gm_execute_rule CASCADE;
DROP FUNCTION IF EXISTS public.gm_simulate_rule CASCADE;
DROP FUNCTION IF EXISTS public.gm_clone_rule CASCADE;
DROP FUNCTION IF EXISTS public.gm_build_rule_snapshot CASCADE;
DROP FUNCTION IF EXISTS public.gm_resolve_rule CASCADE;
DROP FUNCTION IF EXISTS public.gm_calc_pct_or_flat CASCADE;
DROP FUNCTION IF EXISTS public.gm_is_valid_triggered_by CASCADE;
DROP FUNCTION IF EXISTS public.gm_is_valid_order_stage CASCADE;
DROP FUNCTION IF EXISTS public.gm_is_valid_service_type CASCADE;
DROP FUNCTION IF EXISTS public.gm_catalog_triggered_by CASCADE;
DROP FUNCTION IF EXISTS public.gm_catalog_order_stages CASCADE;
DROP FUNCTION IF EXISTS public.gm_catalog_service_types CASCADE;

DROP TRIGGER IF EXISTS trg_gm_rule_master_audit ON public.gm_rule_master;
DROP TRIGGER IF EXISTS trg_gm_rule_master_no_delete ON public.gm_rule_master;
DROP FUNCTION IF EXISTS public.gm_rule_master_audit_trigger CASCADE;
DROP FUNCTION IF EXISTS public.gm_rule_master_deny_delete CASCADE;

DROP TABLE IF EXISTS public.gm_financial_reversals CASCADE;
DROP TABLE IF EXISTS public.gm_chargeback_cases CASCADE;
DROP TABLE IF EXISTS public.gm_dispute_evidence CASCADE;
DROP TABLE IF EXISTS public.gm_disputes CASCADE;
DROP TABLE IF EXISTS public.gm_rule_simulation_log CASCADE;
DROP TABLE IF EXISTS public.gm_rule_execution_log CASCADE;
DROP TABLE IF EXISTS public.gm_rule_audit_log CASCADE;
DROP TABLE IF EXISTS public.gm_rule_advanced_config CASCADE;
DROP TABLE IF EXISTS public.gm_rule_approval_thresholds CASCADE;
DROP TABLE IF EXISTS public.gm_rule_evidence_config CASCADE;
DROP TABLE IF EXISTS public.gm_rule_fraud_config CASCADE;
DROP TABLE IF EXISTS public.gm_rule_auto_actions CASCADE;
DROP TABLE IF EXISTS public.gm_rule_financial_limits CASCADE;
DROP TABLE IF EXISTS public.gm_rule_customer_penalty CASCADE;
DROP TABLE IF EXISTS public.gm_rule_rider_settlement CASCADE;
DROP TABLE IF EXISTS public.gm_rule_merchant_settlement CASCADE;
DROP TABLE IF EXISTS public.gm_rule_refund_config CASCADE;
DROP TABLE IF EXISTS public.gm_rule_platform_liability CASCADE;
DROP TABLE IF EXISTS public.gm_rule_fault_allocation CASCADE;
DROP TABLE IF EXISTS public.gm_rule_conditions CASCADE;
DROP TABLE IF EXISTS public.gm_rule_master CASCADE;

DROP TYPE IF EXISTS public.gm_execution_status CASCADE;
DROP TYPE IF EXISTS public.gm_reversal_type CASCADE;
DROP TYPE IF EXISTS public.gm_dispute_party CASCADE;
DROP TYPE IF EXISTS public.gm_dispute_status CASCADE;
DROP TYPE IF EXISTS public.gm_account_restriction CASCADE;
DROP TYPE IF EXISTS public.gm_refund_recipient CASCADE;
DROP TYPE IF EXISTS public.gm_fault_bucket CASCADE;
DROP TYPE IF EXISTS public.gm_rule_scenario_type CASCADE;
DROP TYPE IF EXISTS public.gm_rule_active_status CASCADE;
