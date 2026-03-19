-- ============================================================================
-- MERCHANT WALLET V3 — HOLD-based withdrawal, reconciliation, missing enum values
-- Run AFTER merchant_wallet.sql and merchant_wallet_v2_industry_standard.sql
-- ============================================================================

-- ============================================================================
-- 1. EXTEND ENUMS (ONBOARDING_FEE, SUBSCRIPTION_DEBIT, ONBOARDING ref type)
-- ============================================================================

DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'ONBOARDING_FEE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_transaction_category ADD VALUE 'SUBSCRIPTION_DEBIT'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE wallet_reference_type ADD VALUE 'ONBOARDING'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. Fix V1 credit/debit functions to set status column on ledger entries
--    and track lifetime_credit / lifetime_debit
-- ============================================================================

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

-- ============================================================================
-- 3. Updated debit function with LOCKED support, balance_before, status, lifetime_debit
-- ============================================================================

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
  v_current_locked NUMERIC(14, 2);
  v_version INTEGER;
  v_status wallet_status_type;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_ledger_id FROM public.merchant_wallet_ledger
    WHERE idempotency_key = p_idempotency_key;
    IF v_ledger_id IS NOT NULL THEN
      RETURN v_ledger_id;
    END IF;
  END IF;

  SELECT available_balance, pending_balance, hold_balance, reserve_balance,
         COALESCE(locked_balance, 0), version, status
  INTO v_current_avail, v_current_pending, v_current_hold, v_current_reserve,
       v_current_locked, v_version, v_status
  FROM public.merchant_wallet
  WHERE id = p_wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'wallet not found: %', p_wallet_id;
  END IF;

  IF v_status IN ('FROZEN', 'BLOCKED', 'SUSPENDED') THEN
    RAISE EXCEPTION 'wallet not allowed to debit: status = %', v_status;
  END IF;

  CASE p_balance_type
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
    WHEN 'LOCKED' THEN
      IF v_current_locked < p_amount THEN
        RAISE EXCEPTION 'insufficient locked balance';
      END IF;
      v_balance_before := v_current_locked;
      v_balance_after := v_current_locked - p_amount;
      v_current_locked := v_balance_after;
    ELSE
      RAISE EXCEPTION 'invalid balance_type %', p_balance_type;
  END CASE;

  INSERT INTO public.merchant_wallet_ledger (
    wallet_id, direction, category, balance_type, amount, balance_before, balance_after,
    reference_type, reference_id, idempotency_key, description, metadata, status
  ) VALUES (
    p_wallet_id, 'DEBIT', p_category, p_balance_type, p_amount, v_balance_before, v_balance_after,
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

-- ============================================================================
-- 4. RECONCILIATION FUNCTION — verify ledger sum matches wallet balances
-- ============================================================================

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
    + COALESCE(w.locked_balance, 0)
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

COMMENT ON FUNCTION public.merchant_wallet_reconcile IS 'Verifies that SUM(credits) - SUM(debits) from ledger equals the sum of all wallet balance buckets. Returns is_consistent = true if difference < 0.01.';

-- ============================================================================
-- 5. FUNCTION: Complete withdrawal (debit from HOLD after bank transfer success)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merchant_wallet_complete_withdrawal(
  p_payout_request_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id BIGINT;
  v_amount NUMERIC(14, 2);
  v_status TEXT;
  v_ledger_id BIGINT;
  v_idem TEXT;
BEGIN
  SELECT wallet_id, amount, status INTO v_wallet_id, v_amount, v_status
  FROM public.merchant_payout_requests
  WHERE id = p_payout_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout request not found: %', p_payout_request_id;
  END IF;

  IF v_status NOT IN ('APPROVED', 'PROCESSING') THEN
    RAISE EXCEPTION 'cannot complete payout in status: %', v_status;
  END IF;

  v_idem := 'payout_complete_' || p_payout_request_id;

  v_ledger_id := public.merchant_wallet_debit(
    v_wallet_id, v_amount, 'WITHDRAWAL'::wallet_transaction_category,
    'HOLD'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, v_idem,
    'Withdrawal completed #' || p_payout_request_id,
    jsonb_build_object('payout_request_id', p_payout_request_id)
  );

  UPDATE public.merchant_payout_requests
  SET status = 'COMPLETED',
      debit_ledger_id = v_ledger_id,
      completed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_payout_request_id;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_complete_withdrawal IS 'Called when bank transfer succeeds. Debits HOLD bucket and marks payout as COMPLETED.';

-- ============================================================================
-- 6. FUNCTION: Fail withdrawal (release HOLD back to AVAILABLE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merchant_wallet_fail_withdrawal(
  p_payout_request_id BIGINT,
  p_failure_reason TEXT DEFAULT 'Bank transfer failed'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id BIGINT;
  v_amount NUMERIC(14, 2);
  v_status TEXT;
  v_idem_debit TEXT;
  v_idem_credit TEXT;
BEGIN
  SELECT wallet_id, amount, status INTO v_wallet_id, v_amount, v_status
  FROM public.merchant_payout_requests
  WHERE id = p_payout_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout request not found: %', p_payout_request_id;
  END IF;

  IF v_status NOT IN ('PENDING', 'APPROVED', 'PROCESSING') THEN
    RAISE EXCEPTION 'cannot fail payout in status: %', v_status;
  END IF;

  v_idem_debit := 'payout_fail_hold_debit_' || p_payout_request_id;
  v_idem_credit := 'payout_fail_release_' || p_payout_request_id;

  -- Debit from HOLD
  PERFORM public.merchant_wallet_debit(
    v_wallet_id, v_amount, 'HOLD_RELEASE'::wallet_transaction_category,
    'HOLD'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, v_idem_debit,
    'Failed withdrawal release #' || p_payout_request_id,
    jsonb_build_object('reason', p_failure_reason)
  );

  -- Credit back to AVAILABLE
  PERFORM public.merchant_wallet_credit(
    v_wallet_id, v_amount, 'FAILED_WITHDRAWAL_REVERSAL'::wallet_transaction_category,
    'AVAILABLE'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, v_idem_credit,
    'Withdrawal failed — funds released #' || p_payout_request_id,
    jsonb_build_object('payout_request_id', p_payout_request_id, 'reason', p_failure_reason)
  );

  UPDATE public.merchant_payout_requests
  SET status = 'FAILED',
      failure_reason = p_failure_reason,
      updated_at = NOW()
  WHERE id = p_payout_request_id;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_fail_withdrawal IS 'Called when bank transfer fails. Releases HOLD back to AVAILABLE and marks payout as FAILED. Idempotent via ledger keys.';

-- ============================================================================
-- 7. FUNCTION: Refund window release scheduler helper
--    Releases all orders where locked_until has passed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.merchant_wallet_release_expired_locks()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_released INTEGER := 0;
  v_row RECORD;
  v_idem TEXT;
BEGIN
  FOR v_row IN
    SELECT osb.order_id, osb.merchant_net, osb.wallet_id
    FROM public.order_settlement_breakdown osb
    WHERE osb.settled = TRUE
      AND osb.locked_until IS NOT NULL
      AND osb.locked_until <= NOW()
      AND osb.wallet_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.merchant_wallet_ledger mwl
        WHERE mwl.wallet_id = osb.wallet_id
          AND mwl.category = 'ORDER_RELEASE'
          AND mwl.reference_id = osb.order_id
      )
  LOOP
    v_idem := 'order_release_' || v_row.order_id;

    BEGIN
      PERFORM public.merchant_wallet_release_locked(
        v_row.wallet_id, v_row.merchant_net, v_row.order_id, v_idem,
        'Refund window expired — funds released'
      );
      v_released := v_released + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to release locked balance for order %: %', v_row.order_id, SQLERRM;
    END;
  END LOOP;

  RETURN v_released;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_release_expired_locks IS 'Scheduler: call periodically to release locked funds after refund window expires. Returns count of orders released.';

-- ============================================================================
-- 8. INDEX: speed up expired lock lookup for scheduler
-- ============================================================================

CREATE INDEX IF NOT EXISTS order_settlement_breakdown_locked_until_idx
  ON public.order_settlement_breakdown(locked_until)
  WHERE settled = TRUE AND locked_until IS NOT NULL AND wallet_id IS NOT NULL;
