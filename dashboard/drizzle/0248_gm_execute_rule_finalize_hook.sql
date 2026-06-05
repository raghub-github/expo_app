-- ============================================================================
-- 0248: Wire gm_execute_rule → gm_finalize_execution (approvals + outbox)
-- Run AFTER 0247_gm_rule_engine_integrations.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.gm_execute_rule(
  p_scenario_type gm_rule_scenario_type,
  p_order_id BIGINT,
  p_orders_food_id BIGINT DEFAULT NULL,
  p_core_order_id TEXT DEFAULT NULL,
  p_service_type TEXT DEFAULT 'FOOD',
  p_order_stage TEXT DEFAULT NULL,
  p_cancellation_reason_id BIGINT DEFAULT NULL,
  p_triggered_by TEXT DEFAULT NULL,
  p_order_gross NUMERIC DEFAULT 0,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_simulate_only BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule public.gm_rule_master;
  v_refund public.gm_rule_refund_config;
  v_limits public.gm_rule_financial_limits;
  v_merchant_cfg public.gm_rule_merchant_settlement;
  v_rider_cfg public.gm_rule_rider_settlement;
  v_penalty_cfg public.gm_rule_customer_penalty;
  v_auto public.gm_rule_auto_actions;
  v_key TEXT;
  v_refund_amt NUMERIC(14, 2) := 0;
  v_penalty_amt NUMERIC(14, 2) := 0;
  v_comp_amt NUMERIC(14, 2) := 0;
  v_merchant_amt NUMERIC(14, 2) := 0;
  v_rider_amt NUMERIC(14, 2) := 0;
  v_exec_id BIGINT;
  v_snapshot JSONB;
  v_result JSONB;
  v_legacy JSONB;
  v_wallet_id BIGINT;
  v_store_id BIGINT;
  v_ledger_id BIGINT;
  v_status gm_execution_status := 'COMPLETED';
BEGIN
  IF p_simulate_only THEN
    RETURN public.gm_simulate_rule(
      p_scenario_type, p_service_type, p_order_stage,
      p_cancellation_reason_id, p_triggered_by, p_order_gross, p_actor_system_user_id
    );
  END IF;

  v_key := coalesce(
    p_idempotency_key,
    'gm_exec:' || p_scenario_type::text || ':' || coalesce(p_core_order_id, p_order_id::text)
      || ':' || coalesce(p_order_stage, 'any') || ':' || coalesce(p_triggered_by, 'any')
  );

  IF EXISTS (SELECT 1 FROM public.gm_rule_execution_log WHERE idempotency_key = v_key) THEN
    SELECT output_result INTO v_result FROM public.gm_rule_execution_log WHERE idempotency_key = v_key;
    RETURN v_result || jsonb_build_object('duplicate', true);
  END IF;

  v_rule := public.gm_resolve_rule(
    p_scenario_type, p_service_type, p_order_stage, p_cancellation_reason_id, p_triggered_by
  );

  IF v_rule.id IS NULL THEN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'payment_apply_cancellation')
       AND p_scenario_type = 'CANCELLATION'::gm_rule_scenario_type THEN
      v_legacy := public.payment_apply_cancellation(
        p_order_id, coalesce(p_orders_food_id, p_order_id),
        coalesce(p_order_stage, 'PRE_PICKUP_CANCELLED')::payment_order_milestone,
        coalesce(p_triggered_by, 'SYSTEM')::payment_cancelled_by,
        p_order_gross, p_actor_system_user_id, v_key
      );
      RETURN v_legacy || jsonb_build_object('engine', 'legacy_payment', 'fallback', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_rule');
  END IF;

  SELECT * INTO v_refund FROM public.gm_rule_refund_config WHERE rule_id = v_rule.id;
  SELECT * INTO v_limits FROM public.gm_rule_financial_limits WHERE rule_id = v_rule.id;
  SELECT * INTO v_merchant_cfg FROM public.gm_rule_merchant_settlement WHERE rule_id = v_rule.id;
  SELECT * INTO v_rider_cfg FROM public.gm_rule_rider_settlement WHERE rule_id = v_rule.id;
  SELECT * INTO v_penalty_cfg FROM public.gm_rule_customer_penalty WHERE rule_id = v_rule.id;
  SELECT * INTO v_auto FROM public.gm_rule_auto_actions WHERE rule_id = v_rule.id;

  IF coalesce(v_refund.refund_allowed, false) THEN
    v_refund_amt := public.gm_calc_pct_or_flat(
      v_refund.refund_pct, v_refund.refund_flat_amount, p_order_gross,
      coalesce(v_limits.max_refund_amount, v_refund.max_refund_amount),
      coalesce(v_limits.min_refund_amount, v_refund.min_refund_amount)
    );
  END IF;
  IF v_refund_amt > p_order_gross THEN v_refund_amt := p_order_gross; END IF;

  v_merchant_amt := public.gm_calc_pct_or_flat(v_merchant_cfg.merchant_receives_pct, NULL, p_order_gross, NULL, NULL);
  v_rider_amt := public.gm_calc_pct_or_flat(v_rider_cfg.rider_receives_pct, NULL, p_order_gross, NULL, NULL);
  v_penalty_amt := public.gm_calc_pct_or_flat(
    v_penalty_cfg.customer_penalty_pct, v_penalty_cfg.customer_flat_penalty, p_order_gross,
    v_limits.max_penalty_amount, NULL
  );
  v_comp_amt := public.gm_calc_pct_or_flat(
    v_merchant_cfg.merchant_compensation_pct, NULL, p_order_gross, v_limits.max_compensation_amount, NULL
  ) + public.gm_calc_pct_or_flat(
    v_rider_cfg.rider_compensation_pct, NULL, p_order_gross, v_limits.max_compensation_amount, NULL
  );

  IF coalesce(v_refund.refund_approval_required, false)
     OR EXISTS (
       SELECT 1 FROM public.gm_rule_approval_thresholds t
       WHERE t.rule_id = v_rule.id AND v_refund_amt >= t.threshold_amount
     ) THEN
    v_status := 'APPROVAL_REQUIRED';
  END IF;

  v_snapshot := public.gm_build_rule_snapshot(v_rule.id);

  IF v_status = 'COMPLETED' AND coalesce(v_auto.auto_wallet_adjustment, true) THEN
    IF p_orders_food_id IS NOT NULL THEN
      SELECT f.merchant_store_id INTO v_store_id
      FROM public.orders_food f
      WHERE f.id = p_orders_food_id OR f.order_id = p_order_id
      LIMIT 1;
    END IF;

    IF v_store_id IS NOT NULL AND v_merchant_amt > 0
       AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_or_create_merchant_wallet') THEN
      v_wallet_id := public.get_or_create_merchant_wallet(v_store_id);
      IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merchant_wallet_credit') THEN
        v_ledger_id := public.merchant_wallet_credit(
          v_wallet_id, v_merchant_amt, 'ORDER_ADJUSTMENT'::wallet_transaction_category,
          CASE WHEN coalesce(v_merchant_cfg.settlement_hold, false) THEN 'LOCKED'::wallet_balance_type
               ELSE 'PENDING'::wallet_balance_type END,
          'ORDER'::wallet_reference_type,
          coalesce(p_orders_food_id, p_order_id),
          v_key || ':merchant',
          'GM rule merchant credit: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id)
        );
      END IF;
    END IF;

    IF v_refund_amt > 0 AND EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'payment_refund_ledger'
    ) THEN
      INSERT INTO public.payment_refund_ledger (
        order_id, party_type, wallet_id, direction, amount, status, idempotency_key, reason, metadata
      ) VALUES (
        p_order_id, 'CUSTOMER', v_wallet_id, 'CREDIT', v_refund_amt,
        CASE WHEN v_status = 'APPROVAL_REQUIRED' THEN 'PENDING'::payment_transaction_status
             ELSE 'PENDING'::payment_transaction_status END,
        v_key || ':refund',
        'GM rule refund: ' || v_rule.rule_code,
        jsonb_build_object('rule_id', v_rule.id, 'recipient', v_refund.refund_recipient)
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'engine', 'gm_rule_engine',
    'rule_id', v_rule.id,
    'rule_code', v_rule.rule_code,
    'execution_status', v_status,
    'amounts', jsonb_build_object(
      'refund', v_refund_amt,
      'penalty', v_penalty_amt,
      'compensation', v_comp_amt,
      'merchant_settlement', v_merchant_amt,
      'rider_settlement', v_rider_amt
    ),
    'snapshot', v_snapshot
  );

  INSERT INTO public.gm_rule_execution_log (
    rule_id, rule_code, rule_version_no, order_id, core_order_id, orders_food_id,
    scenario_type, trigger_event, execution_status, input_context, output_result,
    applied_refund, applied_penalty, applied_compensation,
    applied_merchant_settlement, applied_rider_settlement,
    idempotency_key, executed_by
  ) VALUES (
    v_rule.id, v_rule.rule_code, v_rule.version_no, p_order_id, p_core_order_id, p_orders_food_id,
    p_scenario_type, coalesce(p_order_stage, 'UNKNOWN'), v_status,
    jsonb_build_object(
      'service_type', p_service_type, 'order_stage', p_order_stage,
      'cancellation_reason_id', p_cancellation_reason_id, 'triggered_by', p_triggered_by,
      'order_gross', p_order_gross
    ),
    v_result,
    v_refund_amt, v_penalty_amt, v_comp_amt, v_merchant_amt, v_rider_amt,
    v_key, p_actor_system_user_id
  )
  RETURNING id INTO v_exec_id;

  v_result := v_result || jsonb_build_object('execution_log_id', v_exec_id);

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gm_finalize_execution') THEN
    v_result := public.gm_finalize_execution(
      v_exec_id, v_rule.id, v_refund_amt, v_auto, v_result
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.gm_execute_rule IS
  'Central financial rule executor — logs, wallet side-effects, approvals queue, outbox events.';
