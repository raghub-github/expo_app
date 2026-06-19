-- Drop merchant_wallet.locked_balance and related hold columns (run AFTER 0342).
-- 0342 disabled the hold window but left locked_balance column + functions in place.

-- 1) Safety: move any leftover locked funds into available
UPDATE public.merchant_wallet
SET
  available_balance = COALESCE(available_balance, 0) + COALESCE(locked_balance, 0),
  locked_balance = 0,
  updated_at = NOW()
WHERE COALESCE(locked_balance, 0) > 0;

-- 2) Credit: LOCKED bucket → AVAILABLE (column removed)
CREATE OR REPLACE FUNCTION public.merchant_wallet_credit(
  p_wallet_id BIGINT,
  p_amount NUMERIC(14, 2),
  p_category wallet_transaction_category,
  p_balance_type wallet_balance_type,
  p_reference_type wallet_reference_type,
  p_reference_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ledger_id BIGINT;
  v_balance_before NUMERIC(14, 2);
  v_balance_after NUMERIC(14, 2);
  v_current_avail NUMERIC(14, 2);
  v_current_pending NUMERIC(14, 2);
  v_current_hold NUMERIC(14, 2);
  v_current_reserve NUMERIC(14, 2);
  v_version INTEGER;
  v_effective_balance_type wallet_balance_type;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_category = 'ORDER_EARNING'::wallet_transaction_category
     AND p_reference_type = 'ORDER'::wallet_reference_type THEN
    PERFORM public.merchant_wallet_assert_order_delivered_for_earning(p_reference_id);
  END IF;

  v_effective_balance_type := CASE
    WHEN p_balance_type = 'LOCKED'::wallet_balance_type THEN 'AVAILABLE'::wallet_balance_type
    ELSE p_balance_type
  END;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id FROM public.merchant_wallet_ledger
    WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
      RETURN v_ledger_id;
    END IF;
  END IF;

  SELECT available_balance, pending_balance, hold_balance, reserve_balance, version
  INTO v_current_avail, v_current_pending, v_current_hold, v_current_reserve, v_version
  FROM public.merchant_wallet
  WHERE id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found: %', p_wallet_id;
  END IF;

  CASE v_effective_balance_type
    WHEN 'AVAILABLE' THEN v_balance_before := v_current_avail; v_balance_after := v_current_avail + p_amount; v_current_avail := v_balance_after;
    WHEN 'PENDING' THEN v_balance_before := v_current_pending; v_balance_after := v_current_pending + p_amount; v_current_pending := v_balance_after;
    WHEN 'HOLD' THEN v_balance_before := v_current_hold; v_balance_after := v_current_hold + p_amount; v_current_hold := v_balance_after;
    WHEN 'RESERVE' THEN v_balance_before := v_current_reserve; v_balance_after := v_current_reserve + p_amount; v_current_reserve := v_balance_after;
    ELSE RAISE EXCEPTION 'invalid balance_type %', p_balance_type;
  END CASE;

  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata, status
  ) VALUES (
    p_wallet_id, 'CREDIT', p_category, v_effective_balance_type, p_amount, v_balance_before, v_balance_after,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata, 'COMPLETED'
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.merchant_wallet
  SET
    available_balance = v_current_avail,
    pending_balance = v_current_pending,
    hold_balance = v_current_hold,
    reserve_balance = v_current_reserve,
    total_earned = total_earned + CASE WHEN p_category = 'ORDER_EARNING' THEN p_amount ELSE 0 END,
    lifetime_credit = COALESCE(lifetime_credit, 0) + p_amount,
    version = version + 1,
    updated_at = NOW()
  WHERE id = p_wallet_id AND version = v_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet version conflict; retry';
  END IF;

  INSERT INTO public.merchant_wallet_transactions (
    wallet_id, ledger_id, direction, category, amount,
    reference_type, reference_id, idempotency_key, description, metadata
  ) VALUES (
    p_wallet_id, v_ledger_id, 'CREDIT', p_category, p_amount,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata
  );

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_credit IS
  'Credits merchant wallet. LOCKED balance_type is treated as AVAILABLE (hold window removed).';

-- 3) Debit: LOCKED bucket → AVAILABLE
CREATE OR REPLACE FUNCTION public.merchant_wallet_debit(
  p_wallet_id BIGINT,
  p_amount NUMERIC(14, 2),
  p_category wallet_transaction_category,
  p_balance_type wallet_balance_type,
  p_reference_type wallet_reference_type,
  p_reference_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ledger_id BIGINT;
  v_balance_before NUMERIC(14, 2);
  v_balance_after NUMERIC(14, 2);
  v_current_avail NUMERIC(14, 2);
  v_current_pending NUMERIC(14, 2);
  v_current_hold NUMERIC(14, 2);
  v_current_reserve NUMERIC(14, 2);
  v_version INTEGER;
  v_status wallet_status_type;
  v_effective_balance_type wallet_balance_type;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  v_effective_balance_type := CASE
    WHEN p_balance_type = 'LOCKED'::wallet_balance_type THEN 'AVAILABLE'::wallet_balance_type
    ELSE p_balance_type
  END;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id FROM public.merchant_wallet_ledger
    WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
      RETURN v_ledger_id;
    END IF;
  END IF;

  SELECT available_balance, pending_balance, hold_balance, reserve_balance, version, status
  INTO v_current_avail, v_current_pending, v_current_hold, v_current_reserve, v_version, v_status
  FROM public.merchant_wallet
  WHERE id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found: %', p_wallet_id;
  END IF;

  IF v_status IN ('FROZEN', 'BLOCKED', 'SUSPENDED') THEN
    RAISE EXCEPTION 'wallet not allowed to debit: status = %', v_status;
  END IF;

  CASE v_effective_balance_type
    WHEN 'AVAILABLE' THEN
      IF v_current_avail < p_amount THEN
        RAISE EXCEPTION 'insufficient available balance: have %, need %', v_current_avail, p_amount;
      END IF;
      v_balance_before := v_current_avail;
      v_balance_after := v_current_avail - p_amount;
      v_current_avail := v_balance_after;
    WHEN 'PENDING' THEN
      IF v_current_pending < p_amount THEN
        RAISE EXCEPTION 'insufficient pending balance';
      END IF;
      v_balance_before := v_current_pending;
      v_balance_after := v_current_pending - p_amount;
      v_current_pending := v_balance_after;
    WHEN 'HOLD' THEN
      IF v_current_hold < p_amount THEN
        RAISE EXCEPTION 'insufficient hold balance';
      END IF;
      v_balance_before := v_current_hold;
      v_balance_after := v_current_hold - p_amount;
      v_current_hold := v_balance_after;
    WHEN 'RESERVE' THEN
      IF v_current_reserve < p_amount THEN
        RAISE EXCEPTION 'insufficient reserve balance';
      END IF;
      v_balance_before := v_current_reserve;
      v_balance_after := v_current_reserve - p_amount;
      v_current_reserve := v_balance_after;
    ELSE
      RAISE EXCEPTION 'invalid balance_type %', p_balance_type;
  END CASE;

  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata, status
  ) VALUES (
    p_wallet_id, 'DEBIT', p_category, v_effective_balance_type, p_amount, v_balance_before, v_balance_after,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata, 'COMPLETED'
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.merchant_wallet
  SET
    available_balance = v_current_avail,
    pending_balance = v_current_pending,
    hold_balance = v_current_hold,
    reserve_balance = v_current_reserve,
    total_withdrawn = total_withdrawn + CASE WHEN p_category = 'WITHDRAWAL' THEN p_amount ELSE 0 END,
    total_penalty = total_penalty + CASE WHEN p_category = 'PENALTY' THEN p_amount ELSE 0 END,
    total_commission_deducted = total_commission_deducted + CASE WHEN p_category = 'COMMISSION_DEDUCTION' THEN p_amount ELSE 0 END,
    lifetime_debit = COALESCE(lifetime_debit, 0) + p_amount,
    version = version + 1,
    updated_at = NOW()
  WHERE id = p_wallet_id AND version = v_version;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet version conflict; retry';
  END IF;

  INSERT INTO public.merchant_wallet_transactions (
    wallet_id, ledger_id, direction, category, amount,
    reference_type, reference_id, idempotency_key, description, metadata
  ) VALUES (
    p_wallet_id, v_ledger_id, 'DEBIT', p_category, p_amount,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata
  );

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_debit IS
  'Debits merchant wallet. LOCKED balance_type is treated as AVAILABLE (hold window removed).';

-- 4) Legacy helpers → AVAILABLE / no-op
CREATE OR REPLACE FUNCTION public.merchant_wallet_credit_to_locked(
  p_wallet_id BIGINT,
  p_amount NUMERIC(14, 2),
  p_order_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_gst_amount NUMERIC(12, 2) DEFAULT 0,
  p_commission_amount NUMERIC(12, 2) DEFAULT 0,
  p_tds_amount NUMERIC(12, 2) DEFAULT 0,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.merchant_wallet_credit(
    p_wallet_id,
    p_amount,
    'ORDER_EARNING'::wallet_transaction_category,
    'AVAILABLE'::wallet_balance_type,
    'ORDER'::wallet_reference_type,
    p_order_id,
    p_idempotency_key,
    COALESCE(p_description, 'Order settlement'),
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'legacy_credit_to_locked', true,
      'gst_amount', p_gst_amount,
      'commission_amount', p_commission_amount,
      'tds_amount', p_tds_amount
    )
  );
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_credit_to_locked IS
  'Deprecated: credits AVAILABLE directly (hold window removed).';

CREATE OR REPLACE FUNCTION public.merchant_wallet_release_locked(
  p_wallet_id BIGINT,
  p_amount NUMERIC(14, 2),
  p_reference_id BIGINT,
  p_idempotency_key TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ledger_id BIGINT;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id
    FROM public.merchant_wallet_ledger
    WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
      RETURN v_ledger_id;
    END IF;
  END IF;
  RETURN 0;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_release_locked IS
  'Deprecated no-op: hold window removed; earnings already credit AVAILABLE.';

-- 5) Reconciliation helpers (no locked bucket)
DROP FUNCTION IF EXISTS public.merchant_wallet_reconcile(BIGINT);

CREATE OR REPLACE FUNCTION public.merchant_wallet_reconcile(p_wallet_id BIGINT)
RETURNS TABLE (
  wallet_id BIGINT,
  ledger_credit_sum NUMERIC(14, 2),
  ledger_debit_sum NUMERIC(14, 2),
  ledger_net NUMERIC(14, 2),
  wallet_total NUMERIC(14, 2),
  difference NUMERIC(14, 2),
  is_consistent BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credit_sum NUMERIC(14, 2);
  v_debit_sum NUMERIC(14, 2);
  v_net NUMERIC(14, 2);
  v_wallet_total NUMERIC(14, 2);
  v_diff NUMERIC(14, 2);
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0)
  INTO v_credit_sum, v_debit_sum
  FROM public.merchant_wallet_ledger l
  WHERE l.wallet_id = p_wallet_id;

  v_net := v_credit_sum - v_debit_sum;

  SELECT
    COALESCE(w.available_balance, 0)
    + COALESCE(w.pending_balance, 0)
    + COALESCE(w.hold_balance, 0)
    + COALESCE(w.reserve_balance, 0)
  INTO v_wallet_total
  FROM public.merchant_wallet w
  WHERE w.id = p_wallet_id;

  IF v_wallet_total IS NULL THEN
    RAISE EXCEPTION 'wallet not found: %', p_wallet_id;
  END IF;

  v_diff := v_net - v_wallet_total;

  RETURN QUERY SELECT
    p_wallet_id,
    v_credit_sum,
    v_debit_sum,
    v_net,
    v_wallet_total,
    v_diff,
    ABS(v_diff) < 0.01;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_run_daily_reconciliation(
  p_run_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id BIGINT;
  v_mismatch INTEGER := 0;
  v_matched INTEGER := 0;
  v_rec RECORD;
BEGIN
  INSERT INTO public.payment_reconciliation_runs (reconciliation_type, run_date, status)
  VALUES ('DAILY_WALLET', p_run_date, 'PROCESSING')
  ON CONFLICT (reconciliation_type, run_date) DO UPDATE SET status = 'PROCESSING', started_at = NOW()
  RETURNING id INTO v_run_id;

  FOR v_rec IN
    SELECT w.id AS wallet_id,
           w.available_balance + w.hold_balance + w.pending_balance AS wallet_total,
           COALESCE(SUM(
             CASE WHEN l.direction = 'CREDIT' THEN l.amount ELSE -l.amount END
           ), 0) AS ledger_net
    FROM public.merchant_wallet w
    LEFT JOIN public.merchant_wallet_ledger l ON l.wallet_id = w.id
    GROUP BY w.id, w.available_balance, w.hold_balance, w.pending_balance
  LOOP
    IF ABS(v_rec.wallet_total - v_rec.ledger_net) > 0.01 THEN
      INSERT INTO public.payment_reconciliation_mismatches (
        run_id, entity_type, entity_id, expected_amount, actual_amount, delta_amount, details
      ) VALUES (
        v_run_id, 'merchant_wallet', v_rec.wallet_id, v_rec.wallet_total, v_rec.ledger_net,
        v_rec.wallet_total - v_rec.ledger_net,
        jsonb_build_object('note', 'wallet buckets vs ledger net direction sum')
      );
      v_mismatch := v_mismatch + 1;
    ELSE
      v_matched := v_matched + 1;
    END IF;
  END LOOP;

  UPDATE public.payment_reconciliation_runs
  SET status = 'COMPLETED', matched_count = v_matched, mismatch_count = v_mismatch, completed_at = NOW()
  WHERE id = v_run_id;

  RETURN jsonb_build_object('ok', true, 'run_id', v_run_id, 'matched', v_matched, 'mismatches', v_mismatch);
END;
$$;

-- 6) Settlement breakdown: stop writing hold columns
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

-- 7) Drop hold columns (idempotent)
ALTER TABLE public.order_settlement_breakdown
  DROP COLUMN IF EXISTS locked_until,
  DROP COLUMN IF EXISTS refund_window_days;

ALTER TABLE public.merchant_wallet
  DROP COLUMN IF EXISTS locked_balance;

COMMENT ON TABLE public.merchant_wallet IS
  'Merchant wallet buckets: available (withdrawable), pending, hold, reserve. No locked/refund-window bucket.';
