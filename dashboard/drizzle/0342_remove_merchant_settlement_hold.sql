-- Remove merchant settlement hold / refund-window. Earnings credit directly to AVAILABLE wallet.

-- 1) Move existing locked balances into available (one-time)
UPDATE public.merchant_wallet
SET
  available_balance = COALESCE(available_balance, 0) + COALESCE(locked_balance, 0),
  locked_balance = 0,
  updated_at = NOW()
WHERE COALESCE(locked_balance, 0) > 0;

-- 2) Mark in-flight settlements as immediately available
UPDATE public.payment_order_settlements
SET
  lifecycle_status = 'AVAILABLE',
  released_at = COALESCE(released_at, NOW()),
  locked_until = NULL,
  updated_at = NOW()
WHERE lifecycle_status IN ('LOCKED', 'HOLD');

UPDATE public.order_settlement_breakdown
SET locked_until = NULL, updated_at = NOW()
WHERE locked_until IS NOT NULL;

-- 3) Drop hold-rule infrastructure
DROP INDEX IF EXISTS public.payment_order_settlements_lifecycle_idx;
DROP TABLE IF EXISTS public.payment_hold_rules CASCADE;

ALTER TABLE public.payment_order_settlements
  DROP COLUMN IF EXISTS locked_until;

-- 4) Delivered settlement → credit AVAILABLE immediately (no hold window)
CREATE OR REPLACE FUNCTION public.payment_process_delivered_settlement(
  p_order_id BIGINT,
  p_orders_food_id BIGINT,
  p_merchant_store_id BIGINT,
  p_merchant_gross NUMERIC,
  p_packaging NUMERIC DEFAULT 0,
  p_surge NUMERIC DEFAULT 0,
  p_tips NUMERIC DEFAULT 0,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule public.payment_settlement_rules;
  v_comm public.payment_commission_rules;
  v_tax_gst public.payment_tax_rules;
  v_tax_tds public.payment_tax_rules;
  v_wallet_id BIGINT;
  v_settlement_id BIGINT;
  v_key TEXT;
  v_merchant_net NUMERIC(14, 2);
  v_comm_amt NUMERIC(14, 2);
  v_gst NUMERIC(14, 2);
  v_tds NUMERIC(14, 2);
  v_ledger_id BIGINT;
  v_paused BOOLEAN;
BEGIN
  v_key := COALESCE(p_idempotency_key, 'settle:order:' || p_order_id::text);

  IF EXISTS (
    SELECT 1 FROM public.payment_order_settlements
    WHERE idempotency_key = v_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'idempotency_key', v_key);
  END IF;

  PERFORM public.merchant_wallet_assert_order_delivered_for_earning(
    COALESCE(p_orders_food_id, p_order_id)
  );

  v_wallet_id := public.get_or_create_merchant_wallet(p_merchant_store_id);

  SELECT settlement_paused INTO v_paused FROM public.merchant_wallet WHERE id = v_wallet_id;
  IF COALESCE(v_paused, FALSE) THEN
    RAISE EXCEPTION 'Settlement paused for wallet %', v_wallet_id;
  END IF;

  v_rule := public.payment_resolve_settlement_rule('FOOD');
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'No active payment_settlement_rules for DELIVERED';
  END IF;

  SELECT * INTO v_comm
  FROM public.payment_commission_rules c
  WHERE c.is_active = TRUE
    AND (c.merchant_store_id = p_merchant_store_id OR c.merchant_store_id IS NULL)
    AND c.effective_from <= NOW()
    AND (c.effective_to IS NULL OR c.effective_to > NOW())
  ORDER BY CASE WHEN c.merchant_store_id IS NOT NULL THEN 0 ELSE 1 END, c.id DESC
  LIMIT 1;

  v_comm_amt := public.payment_calc_amount(
    COALESCE(v_comm.calculation_mode, v_rule.platform_commission_mode),
    COALESCE(v_comm.commission_value, v_rule.platform_commission_value),
    p_merchant_gross + CASE WHEN v_rule.include_packaging THEN p_packaging ELSE 0 END
  );

  SELECT * INTO v_tax_gst FROM public.payment_tax_rules
  WHERE is_active AND tax_type = 'GST' AND party_type = 'MERCHANT' LIMIT 1;
  SELECT * INTO v_tax_tds FROM public.payment_tax_rules
  WHERE is_active AND tax_type = 'TDS' AND party_type = 'MERCHANT' LIMIT 1;

  v_gst := public.payment_calc_amount(
    COALESCE(v_tax_gst.calculation_mode, 'PERCENTAGE'::payment_calculation_mode),
    COALESCE(v_tax_gst.tax_value, 0),
    p_merchant_gross
  );
  v_tds := public.payment_calc_amount(
    COALESCE(v_tax_tds.calculation_mode, 'PERCENTAGE'::payment_calculation_mode),
    COALESCE(v_tax_tds.tax_value, 0),
    p_merchant_gross
  );

  v_merchant_net := public.payment_calc_amount(
    v_rule.merchant_share_mode, v_rule.merchant_share_value,
    p_merchant_gross + CASE WHEN v_rule.include_packaging THEN p_packaging ELSE 0 END
  ) - v_comm_amt - v_gst - v_tds;

  IF v_merchant_net < 0 THEN v_merchant_net := 0; END IF;

  INSERT INTO public.payment_order_settlements (
    order_id, orders_food_id, wallet_id, settlement_rule_id,
    lifecycle_status, merchant_net, platform_commission, gst_amount, tds_amount,
    packaging_amount, surge_amount, tips_amount, released_at, idempotency_key, metadata
  ) VALUES (
    p_order_id, p_orders_food_id, v_wallet_id, v_rule.id,
    'AVAILABLE', v_merchant_net, v_comm_amt, v_gst, v_tds,
    p_packaging, p_surge, p_tips, NOW(), v_key,
    jsonb_build_object('rule_code', v_rule.rule_code, 'direct_wallet_credit', true)
  )
  RETURNING id INTO v_settlement_id;

  v_ledger_id := public.merchant_wallet_credit(
    v_wallet_id, v_merchant_net, 'ORDER_EARNING'::wallet_transaction_category,
    'AVAILABLE'::wallet_balance_type, 'ORDER'::wallet_reference_type,
    COALESCE(p_orders_food_id, p_order_id),
    v_key || ':credit',
    'Order delivered', jsonb_build_object('settlement_id', v_settlement_id)
  );

  UPDATE public.payment_order_settlements
  SET credit_ledger_id = v_ledger_id, lifecycle_status = 'AVAILABLE', updated_at = NOW()
  WHERE id = v_settlement_id;

  UPDATE public.order_settlement_breakdown
  SET
    merchant_net = v_merchant_net,
    commission_amount = v_comm_amt,
    tds_amount = v_tds,
    gst_amount = v_gst,
    locked_until = NULL,
    settled = TRUE,
    settled_at = NOW(),
    ledger_id = v_ledger_id,
    wallet_id = v_wallet_id,
    payment_settlement_id = v_settlement_id,
    settlement_rule_id = v_rule.id,
    updated_at = NOW()
  WHERE order_id = p_order_id;

  PERFORM public.payment_audit_log(
    'RULE_UPDATED'::payment_audit_action,
    'payment_order_settlements', v_settlement_id, p_actor_system_user_id,
    NULL, jsonb_build_object('merchant_net', v_merchant_net, 'ledger_id', v_ledger_id)
  );

  RETURN jsonb_build_object(
    'ok', true, 'settlement_id', v_settlement_id,
    'ledger_id', v_ledger_id, 'merchant_net', v_merchant_net
  );
END;
$$;

COMMENT ON FUNCTION public.payment_process_delivered_settlement IS
  'Credits merchant_net directly to AVAILABLE wallet on DELIVERED (no hold/refund window).';

-- 5) Legacy cron no-op (hold release removed)
CREATE OR REPLACE FUNCTION public.payment_release_due_locked_balances(
  p_batch_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object('ok', true, 'released_count', 0, 'deprecated', true);
END;
$$;

COMMENT ON FUNCTION public.payment_release_due_locked_balances IS
  'Deprecated: merchant hold window removed; earnings credit directly to AVAILABLE.';
