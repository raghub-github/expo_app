-- Rollback 0247
DROP FUNCTION IF EXISTS public.gm_record_reversal CASCADE;
DROP FUNCTION IF EXISTS public.gm_record_chargeback CASCADE;
DROP FUNCTION IF EXISTS public.gm_create_dispute CASCADE;
DROP FUNCTION IF EXISTS public.gm_finalize_execution CASCADE;
DROP FUNCTION IF EXISTS public.gm_approve_execution CASCADE;
DROP FUNCTION IF EXISTS public.gm_queue_execution_approvals CASCADE;
DROP FUNCTION IF EXISTS public.gm_emit_rule_event CASCADE;
DROP VIEW IF EXISTS public.v_gm_rule_execution_report CASCADE;
DROP TABLE IF EXISTS public.gm_rule_pending_approvals CASCADE;
