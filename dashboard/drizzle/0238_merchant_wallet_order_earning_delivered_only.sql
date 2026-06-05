-- ORDER_EARNING credits only when linked food order is DELIVERED (DB enforcement).
-- Run after merchant_wallet v1/v2/v3 functions exist.

CREATE OR REPLACE FUNCTION public.merchant_wallet_assert_order_delivered_for_earning(
  p_reference_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_reference_id IS NULL THEN
    RAISE EXCEPTION 'ORDER_EARNING requires reference_id (orders_food.id or orders_core.id)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders_food f
    WHERE f.id = p_reference_id
      AND upper(COALESCE(f.order_status::text, '')) = 'DELIVERED'
      AND f.delivered_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orders_food f
    WHERE f.order_id = p_reference_id
      AND upper(COALESCE(f.order_status::text, '')) = 'DELIVERED'
      AND f.delivered_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION
    'ORDER_EARNING credit blocked: order must be DELIVERED with delivered_at set (ref %)',
    p_reference_id;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_assert_order_delivered_for_earning IS
  'Guards merchant_wallet_credit / credit_to_locked for ORDER_EARNING + ORDER reference.';

-- Patch V3 credit (production path on most envs)
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
  v_current_locked NUMERIC(14, 2);
  v_version INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_category = 'ORDER_EARNING'::wallet_transaction_category
     AND p_reference_type = 'ORDER'::wallet_reference_type THEN
    PERFORM public.merchant_wallet_assert_order_delivered_for_earning(p_reference_id);
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id FROM public.merchant_wallet_ledger
    WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
      RETURN v_ledger_id;
    END IF;
  END IF;

  SELECT available_balance, pending_balance, hold_balance, reserve_balance,
         COALESCE(locked_balance, 0), version
  INTO v_current_avail, v_current_pending, v_current_hold, v_current_reserve,
       v_current_locked, v_version
  FROM public.merchant_wallet
  WHERE id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found: %', p_wallet_id;
  END IF;

  CASE p_balance_type
    WHEN 'AVAILABLE' THEN v_balance_before := v_current_avail; v_balance_after := v_current_avail + p_amount; v_current_avail := v_balance_after;
    WHEN 'PENDING' THEN v_balance_before := v_current_pending; v_balance_after := v_current_pending + p_amount; v_current_pending := v_balance_after;
    WHEN 'HOLD' THEN v_balance_before := v_current_hold; v_balance_after := v_current_hold + p_amount; v_current_hold := v_balance_after;
    WHEN 'RESERVE' THEN v_balance_before := v_current_reserve; v_balance_after := v_current_reserve + p_amount; v_current_reserve := v_balance_after;
    WHEN 'LOCKED' THEN v_balance_before := v_current_locked; v_balance_after := v_current_locked + p_amount; v_current_locked := v_balance_after;
    ELSE RAISE EXCEPTION 'invalid balance_type %', p_balance_type;
  END CASE;

  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata, status
  ) VALUES (
    p_wallet_id, 'CREDIT', p_category, p_balance_type, p_amount, v_balance_before, v_balance_after,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, p_metadata, 'COMPLETED'
  )
  RETURNING id INTO v_ledger_id;

  UPDATE public.merchant_wallet
  SET
    available_balance = v_current_avail,
    pending_balance = v_current_pending,
    hold_balance = v_current_hold,
    reserve_balance = v_current_reserve,
    locked_balance = v_current_locked,
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

-- If you use merchant_wallet_credit_to_locked, add at the top of that function body:
--   PERFORM public.merchant_wallet_assert_order_delivered_for_earning(p_order_id);
