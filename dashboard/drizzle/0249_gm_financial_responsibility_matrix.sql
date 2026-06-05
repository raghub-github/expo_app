-- ============================================================================
-- 0249: Financial Responsibility Matrix — columns + executor + simulation
-- Run AFTER 0248_gm_execute_rule_finalize_hook.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema extensions (flat amounts + wallet direction flags)
-- ---------------------------------------------------------------------------

ALTER TABLE public.gm_rule_customer_penalty
  ADD COLUMN IF NOT EXISTS customer_compensation_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_compensation_flat NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_wallet_debit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS customer_wallet_credit BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.gm_rule_merchant_settlement
  ADD COLUMN IF NOT EXISTS merchant_flat_penalty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_compensation_flat NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_wallet_debit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS merchant_wallet_credit BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.gm_rule_rider_settlement
  ADD COLUMN IF NOT EXISTS rider_flat_penalty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_compensation_flat NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_wallet_debit BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS rider_wallet_credit BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.gm_rule_platform_liability
  ADD COLUMN IF NOT EXISTS platform_compensation_flat NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_absorbed_loss_pct NUMERIC(8, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_settlement_impact_pct NUMERIC(8, 4) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. Shared financial calculation (simulate + execute)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gm_calc_rule_financial_amounts(
  p_rule_id BIGINT,
  p_order_gross NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_refund_cfg public.gm_rule_refund_config;
  v_limits public.gm_rule_financial_limits;
  v_merchant public.gm_rule_merchant_settlement;
  v_rider public.gm_rule_rider_settlement;
  v_customer public.gm_rule_customer_penalty;
  v_platform public.gm_rule_platform_liability;
  v_refund_amt NUMERIC(14, 2) := 0;
  v_customer_penalty NUMERIC(14, 2) := 0;
  v_customer_comp NUMERIC(14, 2) := 0;
  v_merchant_settlement NUMERIC(14, 2) := 0;
  v_merchant_penalty NUMERIC(14, 2) := 0;
  v_merchant_comp NUMERIC(14, 2) := 0;
  v_rider_settlement NUMERIC(14, 2) := 0;
  v_rider_penalty NUMERIC(14, 2) := 0;
  v_rider_comp NUMERIC(14, 2) := 0;
  v_platform_comp NUMERIC(14, 2) := 0;
  v_platform_absorbed NUMERIC(14, 2) := 0;
  v_platform_impact NUMERIC(14, 2) := 0;
  v_total_comp NUMERIC(14, 2) := 0;
  v_total_penalty NUMERIC(14, 2) := 0;
BEGIN
  SELECT * INTO v_refund_cfg FROM public.gm_rule_refund_config WHERE rule_id = p_rule_id;
  SELECT * INTO v_limits FROM public.gm_rule_financial_limits WHERE rule_id = p_rule_id;
  SELECT * INTO v_merchant FROM public.gm_rule_merchant_settlement WHERE rule_id = p_rule_id;
  SELECT * INTO v_rider FROM public.gm_rule_rider_settlement WHERE rule_id = p_rule_id;
  SELECT * INTO v_customer FROM public.gm_rule_customer_penalty WHERE rule_id = p_rule_id;
  SELECT * INTO v_platform FROM public.gm_rule_platform_liability WHERE rule_id = p_rule_id;

  IF coalesce(v_refund_cfg.refund_allowed, false) THEN
    v_refund_amt := public.gm_calc_pct_or_flat(
      v_refund_cfg.refund_pct, v_refund_cfg.refund_flat_amount, p_order_gross,
      coalesce(v_limits.max_refund_amount, v_refund_cfg.max_refund_amount),
      coalesce(v_limits.min_refund_amount, v_refund_cfg.min_refund_amount)
    );
  END IF;
  IF v_refund_amt > p_order_gross THEN v_refund_amt := p_order_gross; END IF;

  v_customer_penalty := public.gm_calc_pct_or_flat(
    v_customer.customer_penalty_pct, v_customer.customer_flat_penalty, p_order_gross,
    v_limits.max_penalty_amount, NULL
  );
  v_customer_comp := public.gm_calc_pct_or_flat(
    v_customer.customer_compensation_pct, v_customer.customer_compensation_flat, p_order_gross,
    v_limits.max_compensation_amount, NULL
  );

  v_merchant_settlement := public.gm_calc_pct_or_flat(
    v_merchant.merchant_receives_pct, NULL, p_order_gross, NULL, NULL
  );
  v_merchant_penalty := public.gm_calc_pct_or_flat(
    v_merchant.merchant_penalty_pct, v_merchant.merchant_flat_penalty, p_order_gross,
    v_limits.max_penalty_amount, NULL
  );
  v_merchant_comp := public.gm_calc_pct_or_flat(
    v_merchant.merchant_compensation_pct, v_merchant.merchant_compensation_flat, p_order_gross,
    v_limits.max_compensation_amount, NULL
  );

  v_rider_settlement := public.gm_calc_pct_or_flat(
    v_rider.rider_receives_pct, NULL, p_order_gross, NULL, NULL
  );
  v_rider_penalty := public.gm_calc_pct_or_flat(
    v_rider.rider_penalty_pct, v_rider.rider_flat_penalty, p_order_gross,
    v_limits.max_penalty_amount, NULL
  );
  v_rider_comp := public.gm_calc_pct_or_flat(
    v_rider.rider_compensation_pct, v_rider.rider_compensation_flat, p_order_gross,
    v_limits.max_compensation_amount, NULL
  );

  v_platform_comp := coalesce(v_platform.platform_compensation_flat, 0);
  v_platform_absorbed := public.gm_calc_pct_or_flat(
    v_platform.platform_absorbed_loss_pct, NULL, p_order_gross, NULL, NULL
  );
  v_platform_impact := public.gm_calc_pct_or_flat(
    v_platform.platform_settlement_impact_pct, NULL, p_order_gross, NULL, NULL
  );

  IF coalesce(v_platform.platform_bears_loss, false) AND v_platform_absorbed = 0 THEN
    v_platform_absorbed := public.gm_calc_pct_or_flat(
      v_platform.gatimitra_liability_pct, NULL, p_order_gross, NULL, NULL
    );
  END IF;

  v_total_comp := v_customer_comp + v_merchant_comp + v_rider_comp + v_platform_comp;
  v_total_penalty := v_customer_penalty + v_merchant_penalty + v_rider_penalty;

  RETURN jsonb_build_object(
    'refund', v_refund_amt,
    'penalty', v_total_penalty,
    'compensation', v_total_comp,
    'merchant_settlement', v_merchant_settlement,
    'rider_settlement', v_rider_settlement,
    'customer', jsonb_build_object(
      'refund', v_refund_amt,
      'compensation', v_customer_comp,
      'penalty', v_customer_penalty,
      'wallet_debit', coalesce(v_customer.customer_wallet_debit, false),
      'wallet_credit', coalesce(v_customer.customer_wallet_credit, false)
    ),
    'merchant', jsonb_build_object(
      'settlement', v_merchant_settlement,
      'compensation', v_merchant_comp,
      'penalty', v_merchant_penalty,
      'settlement_hold', coalesce(v_merchant.settlement_hold, false),
      'settlement_hold_hours', coalesce(v_merchant.settlement_hold_hours, 0),
      'wallet_debit', coalesce(v_merchant.merchant_wallet_debit, false),
      'wallet_credit', coalesce(v_merchant.merchant_wallet_credit, true)
    ),
    'rider', jsonb_build_object(
      'settlement', v_rider_settlement,
      'compensation', v_rider_comp,
      'penalty', v_rider_penalty,
      'settlement_hold', coalesce(v_rider.settlement_hold, false),
      'settlement_hold_hours', coalesce(v_rider.settlement_hold_hours, 0),
      'wallet_debit', coalesce(v_rider.rider_wallet_debit, false),
      'wallet_credit', coalesce(v_rider.rider_wallet_credit, false)
    ),
    'platform', jsonb_build_object(
      'liability_pct', coalesce(v_platform.gatimitra_liability_pct, 0),
      'compensation', v_platform_comp,
      'absorbed_loss', v_platform_absorbed,
      'settlement_impact', v_platform_impact,
      'platform_bears_loss', coalesce(v_platform.platform_bears_loss, false)
    ),
    'order_gross', p_order_gross
  );
END;
$$;

COMMENT ON FUNCTION public.gm_calc_rule_financial_amounts IS
  'Per-party refund, settlement, penalty, compensation and wallet flags for a rule.';

-- ---------------------------------------------------------------------------
-- 3. Simulation engine
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gm_simulate_rule(
  p_scenario_type gm_rule_scenario_type,
  p_service_type TEXT,
  p_order_stage TEXT,
  p_cancellation_reason_id BIGINT DEFAULT NULL,
  p_triggered_by TEXT DEFAULT NULL,
  p_order_gross NUMERIC DEFAULT 0,
  p_actor_system_user_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rule public.gm_rule_master;
  v_refund public.gm_rule_refund_config;
  v_amounts JSONB;
  v_result JSONB;
BEGIN
  v_rule := public.gm_resolve_rule(
    p_scenario_type, p_service_type, p_order_stage, p_cancellation_reason_id, p_triggered_by
  );
  IF v_rule.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_matching_rule');
  END IF;

  SELECT * INTO v_refund FROM public.gm_rule_refund_config WHERE rule_id = v_rule.id;
  v_amounts := public.gm_calc_rule_financial_amounts(v_rule.id, p_order_gross);

  v_result := jsonb_build_object(
    'ok', true,
    'simulated', true,
    'rule_id', v_rule.id,
    'rule_code', v_rule.rule_code,
    'rule_version', v_rule.version_no,
    'snapshot', public.gm_build_rule_snapshot(v_rule.id),
    'amounts', v_amounts,
    'approval_required', coalesce(v_refund.refund_approval_required, false)
      OR EXISTS (
        SELECT 1 FROM public.gm_rule_approval_thresholds t
        WHERE t.rule_id = v_rule.id
          AND (v_amounts->>'refund')::numeric >= t.threshold_amount
      )
  );

  INSERT INTO public.gm_rule_simulation_log (rule_id, simulated_by, input_context, output_result)
  VALUES (
    v_rule.id, p_actor_system_user_id,
    jsonb_build_object(
      'scenario_type', p_scenario_type,
      'service_type', p_service_type,
      'order_stage', p_order_stage,
      'cancellation_reason_id', p_cancellation_reason_id,
      'triggered_by', p_triggered_by,
      'order_gross', p_order_gross
    ),
    v_result
  );

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Execution engine (wallet side-effects for all parties)
-- ---------------------------------------------------------------------------

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
  v_refund_cfg public.gm_rule_refund_config;
  v_auto public.gm_rule_auto_actions;
  v_key TEXT;
  v_amounts JSONB;
  v_refund_amt NUMERIC(14, 2) := 0;
  v_penalty_amt NUMERIC(14, 2) := 0;
  v_comp_amt NUMERIC(14, 2) := 0;
  v_merchant_amt NUMERIC(14, 2) := 0;
  v_rider_amt NUMERIC(14, 2) := 0;
  v_merchant_penalty NUMERIC(14, 2) := 0;
  v_merchant_comp NUMERIC(14, 2) := 0;
  v_rider_comp NUMERIC(14, 2) := 0;
  v_rider_penalty NUMERIC(14, 2) := 0;
  v_customer_penalty NUMERIC(14, 2) := 0;
  v_merchant_wallet_debit BOOLEAN := FALSE;
  v_merchant_wallet_credit BOOLEAN := TRUE;
  v_merchant_hold BOOLEAN := FALSE;
  v_exec_id BIGINT;
  v_snapshot JSONB;
  v_result JSONB;
  v_legacy JSONB;
  v_wallet_id BIGINT;
  v_store_id BIGINT;
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

  SELECT * INTO v_refund_cfg FROM public.gm_rule_refund_config WHERE rule_id = v_rule.id;
  SELECT * INTO v_auto FROM public.gm_rule_auto_actions WHERE rule_id = v_rule.id;
  v_amounts := public.gm_calc_rule_financial_amounts(v_rule.id, p_order_gross);

  v_refund_amt := coalesce((v_amounts->>'refund')::numeric, 0);
  v_penalty_amt := coalesce((v_amounts->>'penalty')::numeric, 0);
  v_comp_amt := coalesce((v_amounts->>'compensation')::numeric, 0);
  v_merchant_amt := coalesce((v_amounts->>'merchant_settlement')::numeric, 0);
  v_rider_amt := coalesce((v_amounts->>'rider_settlement')::numeric, 0);
  v_merchant_penalty := coalesce((v_amounts->'merchant'->>'penalty')::numeric, 0);
  v_merchant_comp := coalesce((v_amounts->'merchant'->>'compensation')::numeric, 0);
  v_rider_penalty := coalesce((v_amounts->'rider'->>'penalty')::numeric, 0);
  v_rider_comp := coalesce((v_amounts->'rider'->>'compensation')::numeric, 0);
  v_customer_penalty := coalesce((v_amounts->'customer'->>'penalty')::numeric, 0);
  v_merchant_wallet_debit := coalesce((v_amounts->'merchant'->>'wallet_debit')::boolean, false);
  v_merchant_wallet_credit := coalesce((v_amounts->'merchant'->>'wallet_credit')::boolean, true);
  v_merchant_hold := coalesce((v_amounts->'merchant'->>'settlement_hold')::boolean, false);

  IF coalesce(v_refund_cfg.refund_approval_required, false)
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

    IF v_store_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_or_create_merchant_wallet') THEN
      v_wallet_id := public.get_or_create_merchant_wallet(v_store_id);

      IF v_merchant_wallet_credit AND v_merchant_amt > 0
         AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merchant_wallet_credit') THEN
        PERFORM public.merchant_wallet_credit(
          v_wallet_id, v_merchant_amt, 'ORDER_ADJUSTMENT'::wallet_transaction_category,
          CASE WHEN v_merchant_hold THEN 'LOCKED'::wallet_balance_type
               ELSE 'PENDING'::wallet_balance_type END,
          'ORDER'::wallet_reference_type,
          coalesce(p_orders_food_id, p_order_id),
          v_key || ':merchant:credit',
          'GM rule merchant settlement: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'type', 'settlement')
        );
      END IF;

      IF (v_merchant_wallet_debit OR v_merchant_penalty > 0) AND v_merchant_penalty > 0
         AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merchant_wallet_debit') THEN
        PERFORM public.merchant_wallet_debit(
          v_wallet_id, v_merchant_penalty, 'ORDER_ADJUSTMENT'::wallet_transaction_category,
          'PENDING'::wallet_balance_type,
          'ORDER'::wallet_reference_type,
          coalesce(p_orders_food_id, p_order_id),
          v_key || ':merchant:debit',
          'GM rule merchant penalty: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'type', 'penalty')
        );
      END IF;

      IF v_merchant_comp > 0
         AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merchant_wallet_credit') THEN
        PERFORM public.merchant_wallet_credit(
          v_wallet_id, v_merchant_comp, 'ORDER_ADJUSTMENT'::wallet_transaction_category,
          'PENDING'::wallet_balance_type,
          'ORDER'::wallet_reference_type,
          coalesce(p_orders_food_id, p_order_id),
          v_key || ':merchant:comp',
          'GM rule merchant compensation: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'type', 'compensation')
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
        'PENDING'::payment_transaction_status,
        v_key || ':refund',
        'GM rule refund: ' || v_rule.rule_code,
        jsonb_build_object(
          'rule_id', v_rule.id,
          'recipient', v_refund_cfg.refund_recipient,
          'customer_penalty', v_customer_penalty
        )
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    IF (v_rider_comp > 0 OR v_rider_penalty > 0) AND EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'payment_refund_ledger'
    ) THEN
      IF v_rider_comp > 0 THEN
        INSERT INTO public.payment_refund_ledger (
          order_id, party_type, wallet_id, direction, amount, status, idempotency_key, reason, metadata
        ) VALUES (
          p_order_id, 'RIDER', NULL, 'CREDIT', v_rider_comp,
          'PENDING'::payment_transaction_status,
          v_key || ':rider:comp',
          'GM rule rider compensation: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'type', 'compensation')
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
      END IF;
      IF v_rider_penalty > 0 THEN
        INSERT INTO public.payment_refund_ledger (
          order_id, party_type, wallet_id, direction, amount, status, idempotency_key, reason, metadata
        ) VALUES (
          p_order_id, 'RIDER', NULL, 'DEBIT', v_rider_penalty,
          'PENDING'::payment_transaction_status,
          v_key || ':rider:penalty',
          'GM rule rider penalty: ' || v_rule.rule_code,
          jsonb_build_object('rule_id', v_rule.id, 'type', 'penalty')
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
      END IF;
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'engine', 'gm_rule_engine',
    'rule_id', v_rule.id,
    'rule_code', v_rule.rule_code,
    'execution_status', v_status,
    'amounts', v_amounts,
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

-- ---------------------------------------------------------------------------
-- 5. Clone rule — copy new columns
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gm_clone_rule(
  p_source_rule_id BIGINT,
  p_new_rule_code TEXT,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_change_reason TEXT DEFAULT 'Cloned'
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_src public.gm_rule_master;
  v_new_id BIGINT;
BEGIN
  SELECT * INTO v_src FROM public.gm_rule_master WHERE id = p_source_rule_id AND is_deleted = FALSE;
  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'Source rule % not found', p_source_rule_id;
  END IF;

  INSERT INTO public.gm_rule_master (
    rule_code, rule_name, description, scenario_type, priority, active_status,
    effective_from, version_no, change_reason, cloned_from_rule_id, created_by, updated_by
  ) VALUES (
    p_new_rule_code, v_src.rule_name || ' (clone)', v_src.description, v_src.scenario_type,
    v_src.priority, 'DRAFT', NOW(), 1, p_change_reason, p_source_rule_id,
    p_actor_system_user_id, p_actor_system_user_id
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.gm_rule_conditions (rule_id, service_type, order_stage, cancellation_reason_id, triggered_by)
  SELECT v_new_id, service_type, order_stage, cancellation_reason_id, triggered_by
  FROM public.gm_rule_conditions WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_fault_allocation (rule_id, fault_bucket, customer_pct, merchant_pct, rider_pct, platform_pct, gatimitra_pct)
  SELECT v_new_id, fault_bucket, customer_pct, merchant_pct, rider_pct, platform_pct, gatimitra_pct
  FROM public.gm_rule_fault_allocation WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_platform_liability (
    rule_id, platform_bears_loss, liability_pct, customer_liability_pct, merchant_liability_pct,
    rider_liability_pct, gatimitra_liability_pct, internal_notes,
    platform_compensation_flat, platform_absorbed_loss_pct, platform_settlement_impact_pct
  )
  SELECT
    v_new_id, platform_bears_loss, liability_pct, customer_liability_pct, merchant_liability_pct,
    rider_liability_pct, gatimitra_liability_pct, internal_notes,
    platform_compensation_flat, platform_absorbed_loss_pct, platform_settlement_impact_pct
  FROM public.gm_rule_platform_liability WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_refund_config (
    rule_id, refund_allowed, refund_recipient, refund_priority, refund_pct, refund_flat_amount,
    platform_fee_refund_pct, delivery_fee_refund_pct, convenience_fee_refund_pct, tip_refund_pct,
    tax_refund_pct, coupon_restore, item_level_refund, order_level_refund, auto_refund,
    refund_approval_required, min_refund_amount, max_refund_amount
  )
  SELECT
    v_new_id, refund_allowed, refund_recipient, refund_priority, refund_pct, refund_flat_amount,
    platform_fee_refund_pct, delivery_fee_refund_pct, convenience_fee_refund_pct, tip_refund_pct,
    tax_refund_pct, coupon_restore, item_level_refund, order_level_refund, auto_refund,
    refund_approval_required, min_refund_amount, max_refund_amount
  FROM public.gm_rule_refund_config WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_merchant_settlement (
    rule_id, merchant_receives_pct, merchant_penalty_pct, merchant_compensation_pct,
    settlement_hold, settlement_hold_hours, settlement_notes,
    merchant_flat_penalty, merchant_compensation_flat, merchant_wallet_debit, merchant_wallet_credit
  )
  SELECT
    v_new_id, merchant_receives_pct, merchant_penalty_pct, merchant_compensation_pct,
    settlement_hold, settlement_hold_hours, settlement_notes,
    merchant_flat_penalty, merchant_compensation_flat, merchant_wallet_debit, merchant_wallet_credit
  FROM public.gm_rule_merchant_settlement WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_rider_settlement (
    rule_id, rider_receives_pct, rider_penalty_pct, rider_compensation_pct,
    min_rider_protection_amount, settlement_hold, settlement_hold_hours,
    rider_flat_penalty, rider_compensation_flat, rider_wallet_debit, rider_wallet_credit
  )
  SELECT
    v_new_id, rider_receives_pct, rider_penalty_pct, rider_compensation_pct,
    min_rider_protection_amount, settlement_hold, settlement_hold_hours,
    rider_flat_penalty, rider_compensation_flat, rider_wallet_debit, rider_wallet_credit
  FROM public.gm_rule_rider_settlement WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_customer_penalty (
    rule_id, customer_penalty_pct, customer_flat_penalty, warning_increment,
    account_restriction, temporary_block_hours,
    customer_compensation_pct, customer_compensation_flat, customer_wallet_debit, customer_wallet_credit
  )
  SELECT
    v_new_id, customer_penalty_pct, customer_flat_penalty, warning_increment,
    account_restriction, temporary_block_hours,
    customer_compensation_pct, customer_compensation_flat, customer_wallet_debit, customer_wallet_credit
  FROM public.gm_rule_customer_penalty WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_financial_limits (rule_id, max_refund_amount, min_refund_amount, max_penalty_amount, max_compensation_amount)
  SELECT v_new_id, max_refund_amount, min_refund_amount, max_penalty_amount, max_compensation_amount
  FROM public.gm_rule_financial_limits WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_auto_actions (rule_id, auto_cancel, auto_refund, auto_settlement_recalc, auto_notification, auto_ticket_creation, auto_wallet_adjustment, auto_fraud_review)
  SELECT v_new_id, auto_cancel, auto_refund, auto_settlement_recalc, auto_notification, auto_ticket_creation, auto_wallet_adjustment, auto_fraud_review
  FROM public.gm_rule_auto_actions WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_fraud_config (rule_id, mark_fraud, manual_review_required, blacklist_customer, blacklist_merchant, blacklist_rider, freeze_wallet, freeze_settlement, create_investigation_ticket)
  SELECT v_new_id, mark_fraud, manual_review_required, blacklist_customer, blacklist_merchant, blacklist_rider, freeze_wallet, freeze_settlement, create_investigation_ticket
  FROM public.gm_rule_fraud_config WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_evidence_config (rule_id, require_customer_evidence, require_rider_evidence, require_merchant_evidence, require_photo, require_video, require_admin_approval, require_support_approval)
  SELECT v_new_id, require_customer_evidence, require_rider_evidence, require_merchant_evidence, require_photo, require_video, require_admin_approval, require_support_approval
  FROM public.gm_rule_evidence_config WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_approval_thresholds (rule_id, threshold_amount, required_role_codes, approval_sequence)
  SELECT v_new_id, threshold_amount, required_role_codes, approval_sequence
  FROM public.gm_rule_approval_thresholds WHERE rule_id = p_source_rule_id;

  INSERT INTO public.gm_rule_advanced_config (rule_id, config)
  SELECT v_new_id, config FROM public.gm_rule_advanced_config WHERE rule_id = p_source_rule_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gm_calc_rule_financial_amounts TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_simulate_rule TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_execute_rule TO service_role;
GRANT EXECUTE ON FUNCTION public.gm_clone_rule TO service_role;

COMMENT ON FUNCTION public.gm_execute_rule IS
  'Financial rule executor — per-party refund, settlement, penalty, compensation and wallet adjustments in one transaction.';
