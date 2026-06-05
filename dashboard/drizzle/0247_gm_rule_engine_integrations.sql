-- ============================================================================
-- 0247: Financial Rule Engine — approvals, outbox, reporting, post-actions
-- Run AFTER 0246_gm_financial_rule_engine.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.gm_rule_pending_approvals (
  id BIGSERIAL PRIMARY KEY,
  execution_log_id BIGINT NOT NULL REFERENCES public.gm_rule_execution_log(id) ON DELETE CASCADE,
  rule_id BIGINT REFERENCES public.gm_rule_master(id) ON DELETE SET NULL,
  order_id BIGINT,
  core_order_id TEXT,
  scenario_type gm_rule_scenario_type NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  required_role_codes TEXT[] NOT NULL DEFAULT '{}',
  approval_sequence INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
  approved_by BIGINT REFERENCES public.system_users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gm_rule_pending_approvals_status_idx
  ON public.gm_rule_pending_approvals(status, created_at DESC)
  WHERE status = 'PENDING';

CREATE OR REPLACE VIEW public.v_gm_rule_execution_report AS
SELECT
  e.id,
  e.rule_code,
  e.rule_version_no,
  e.order_id,
  e.core_order_id,
  e.scenario_type,
  e.execution_status,
  e.applied_refund,
  e.applied_penalty,
  e.applied_compensation,
  e.applied_merchant_settlement,
  e.applied_rider_settlement,
  e.executed_at,
  m.rule_name,
  m.active_status AS rule_active_status,
  c.service_type,
  c.order_stage,
  c.triggered_by,
  c.cancellation_reason_id
FROM public.gm_rule_execution_log e
LEFT JOIN public.gm_rule_master m ON m.id = e.rule_id
LEFT JOIN public.gm_rule_conditions c ON c.rule_id = e.rule_id;

COMMENT ON VIEW public.v_gm_rule_execution_report IS
  'Operational reporting for financial rule executions.';

CREATE OR REPLACE FUNCTION public.gm_emit_rule_event(
  p_topic TEXT,
  p_payload JSONB
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'event_outbox'
  ) THEN
    INSERT INTO public.event_outbox (topic, payload)
    VALUES (p_topic, p_payload);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_queue_execution_approvals(
  p_execution_id BIGINT,
  p_rule_id BIGINT,
  p_refund_amount NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_threshold RECORD;
  v_count INTEGER := 0;
  v_exec public.gm_rule_execution_log;
BEGIN
  SELECT * INTO v_exec FROM public.gm_rule_execution_log WHERE id = p_execution_id;
  IF v_exec.id IS NULL THEN RETURN 0; END IF;

  FOR v_threshold IN
    SELECT * FROM public.gm_rule_approval_thresholds
    WHERE rule_id = p_rule_id AND p_refund_amount >= threshold_amount
    ORDER BY approval_sequence ASC
  LOOP
    INSERT INTO public.gm_rule_pending_approvals (
      execution_log_id, rule_id, order_id, core_order_id, scenario_type,
      amount, required_role_codes, approval_sequence
    ) VALUES (
      p_execution_id, p_rule_id, v_exec.order_id, v_exec.core_order_id,
      v_exec.scenario_type, p_refund_amount,
      v_threshold.required_role_codes, v_threshold.approval_sequence
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_approve_execution(
  p_approval_id BIGINT,
  p_approved_by BIGINT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_approval public.gm_rule_pending_approvals;
  v_exec public.gm_rule_execution_log;
BEGIN
  SELECT * INTO v_approval FROM public.gm_rule_pending_approvals
  WHERE id = p_approval_id AND status = 'PENDING'
  FOR UPDATE;
  IF v_approval.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'approval_not_found');
  END IF;

  UPDATE public.gm_rule_pending_approvals SET
    status = 'APPROVED',
    approved_by = p_approved_by,
    approved_at = NOW(),
    metadata = metadata || jsonb_build_object('notes', p_notes),
    updated_at = NOW()
  WHERE id = p_approval_id;

  SELECT * INTO v_exec FROM public.gm_rule_execution_log WHERE id = v_approval.execution_log_id;

  UPDATE public.gm_rule_execution_log SET
    execution_status = 'COMPLETED',
    output_result = output_result || jsonb_build_object('approved_at', NOW(), 'approved_by', p_approved_by)
  WHERE id = v_approval.execution_log_id;

  PERFORM public.gm_emit_rule_event(
    'financial_rule.approved',
    jsonb_build_object(
      'execution_log_id', v_approval.execution_log_id,
      'order_id', v_approval.order_id,
      'amount', v_approval.amount,
      'approved_by', p_approved_by
    )
  );

  RETURN jsonb_build_object('ok', true, 'execution_log_id', v_approval.execution_log_id);
END;
$$;

-- Patch gm_execute_rule tail: queue approvals + emit outbox (wrapper)
CREATE OR REPLACE FUNCTION public.gm_finalize_execution(
  p_execution_id BIGINT,
  p_rule_id BIGINT,
  p_refund_amount NUMERIC,
  p_auto public.gm_rule_auto_actions,
  p_result JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE v_approval_count INTEGER;
BEGIN
  IF p_result->>'execution_status' = 'APPROVAL_REQUIRED' OR
     (p_refund_amount > 0 AND EXISTS (
       SELECT 1 FROM public.gm_rule_approval_thresholds t
       WHERE t.rule_id = p_rule_id AND p_refund_amount >= t.threshold_amount
     )) THEN
    v_approval_count := public.gm_queue_execution_approvals(p_execution_id, p_rule_id, p_refund_amount);
    p_result := p_result || jsonb_build_object('approvals_queued', v_approval_count);
  END IF;

  IF coalesce(p_auto.auto_notification, TRUE) THEN
    PERFORM public.gm_emit_rule_event(
      'financial_rule.executed',
      jsonb_build_object(
        'execution_log_id', p_execution_id,
        'rule_id', p_rule_id,
        'result', p_result
      )
    );
  END IF;

  IF coalesce(p_auto.auto_ticket_creation, FALSE) THEN
    PERFORM public.gm_emit_rule_event(
      'financial_rule.ticket_required',
      jsonb_build_object('execution_log_id', p_execution_id, 'rule_id', p_rule_id)
    );
  END IF;

  IF coalesce(p_auto.auto_fraud_review, FALSE) THEN
    PERFORM public.gm_emit_rule_event(
      'financial_rule.fraud_review',
      jsonb_build_object('execution_log_id', p_execution_id, 'rule_id', p_rule_id)
    );
  END IF;

  RETURN p_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_create_dispute(
  p_party_type gm_dispute_party,
  p_party_id BIGINT,
  p_order_id BIGINT,
  p_core_order_id TEXT,
  p_dispute_type TEXT,
  p_claimed_amount NUMERIC DEFAULT NULL,
  p_execution_log_id BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE v_id BIGINT;
  v_code TEXT;
BEGIN
  v_code := 'DSP-' || to_char(NOW(), 'YYYYMMDD') || '-' || lpad((random() * 99999999)::bigint::text, 8, '0');
  INSERT INTO public.gm_disputes (
    dispute_code, order_id, core_order_id, party_type, party_id,
    dispute_type, claimed_amount, rule_execution_id
  ) VALUES (
    v_code, p_order_id, p_core_order_id, p_party_type, p_party_id,
    p_dispute_type, p_claimed_amount, p_execution_log_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN undefined_table THEN
  RETURN NULL;
WHEN OTHERS THEN
  v_code := 'DSP-' || extract(epoch from NOW())::bigint::text;
  INSERT INTO public.gm_disputes (
    dispute_code, order_id, core_order_id, party_type, party_id, dispute_type, claimed_amount
  ) VALUES (
    v_code, p_order_id, p_core_order_id, p_party_type, p_party_id, p_dispute_type, p_claimed_amount
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_record_chargeback(
  p_order_id BIGINT,
  p_core_order_id TEXT,
  p_amount NUMERIC,
  p_chargeback_type TEXT,
  p_rule_id BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE v_id BIGINT;
  v_code TEXT;
BEGIN
  v_code := 'CB-' || to_char(NOW(), 'YYYYMMDD') || '-' || p_order_id::text;
  INSERT INTO public.gm_chargeback_cases (
    case_code, order_id, core_order_id, chargeback_type, amount, rule_id
  ) VALUES (
    v_code, p_order_id, p_core_order_id, p_chargeback_type, p_amount, p_rule_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.gm_record_reversal(
  p_reversal_type gm_reversal_type,
  p_order_id BIGINT,
  p_party_type TEXT,
  p_amount NUMERIC,
  p_reason TEXT,
  p_reversed_by BIGINT,
  p_original_execution_id BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE v_id BIGINT;
BEGIN
  INSERT INTO public.gm_financial_reversals (
    reversal_code, reversal_type, original_execution_id, order_id,
    party_type, amount, reason, reversed_by
  ) VALUES (
    'REV-' || p_order_id::text || '-' || extract(epoch from NOW())::bigint::text,
    p_reversal_type, p_original_execution_id, p_order_id,
    p_party_type, p_amount, p_reason, p_reversed_by
  ) RETURNING id INTO v_id;

  INSERT INTO public.gm_rule_audit_log (
    rule_id, rule_code, version_no, action, new_value, changed_by, change_reason
  )
  SELECT
    m.id, m.rule_code, m.version_no, 'REVERSAL',
    jsonb_build_object('reversal_id', v_id, 'type', p_reversal_type, 'amount', p_amount),
    p_reversed_by, p_reason
  FROM public.gm_rule_master m
  WHERE m.id IS NOT NULL
  LIMIT 0;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gm_approve_execution TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_create_dispute TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_record_chargeback TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_record_reversal TO service_role;
