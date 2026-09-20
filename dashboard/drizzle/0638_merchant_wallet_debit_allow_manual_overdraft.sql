-- Allow merchant available_balance to go negative for admin manual/adjustment debits.
-- Withdrawals and other categories still require sufficient balance.
-- Future merchant_wallet_credit entries increase available_balance and settle dues
-- until balance returns to >= 0.
--
-- I/O-safe / idempotent: CREATE OR REPLACE same signature.

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
  v_allow_negative BOOLEAN;
  v_meta JSONB;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  v_effective_balance_type := CASE
    WHEN p_balance_type = 'LOCKED'::wallet_balance_type THEN 'AVAILABLE'::wallet_balance_type
    ELSE p_balance_type
  END;

  -- Manual / adjustment admin debits may overdraw; later credits settle the dues.
  v_allow_negative := p_category::text IN ('MANUAL_DEBIT', 'ADJUSTMENT_DEBIT');

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
      IF NOT v_allow_negative AND v_current_avail < p_amount THEN
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

  v_meta := COALESCE(p_metadata, '{}'::jsonb);
  IF v_allow_negative AND v_balance_after < 0 THEN
    v_meta := v_meta || jsonb_build_object(
      'overdraft', true,
      'balance_before', v_balance_before,
      'balance_after', v_balance_after,
      'dues_outstanding', ABS(v_balance_after)
    );
  END IF;

  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata, status
  ) VALUES (
    p_wallet_id, 'DEBIT', p_category, v_effective_balance_type, p_amount, v_balance_before, v_balance_after,
    p_reference_type, p_reference_id, p_idempotency_key, p_description, v_meta, 'COMPLETED'
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
    p_reference_type, p_reference_id, p_idempotency_key, p_description, v_meta
  );

  RETURN v_ledger_id;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_debit IS
  'Debits merchant wallet. MANUAL_DEBIT / ADJUSTMENT_DEBIT may drive available_balance negative; later credits settle dues. Other categories still require sufficient balance.';
