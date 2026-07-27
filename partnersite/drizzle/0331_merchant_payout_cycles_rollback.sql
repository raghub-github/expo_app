-- Rollback 0446 merchant_payout_cycles (restores prior reject/complete/fail behavior).
-- Does NOT drop historical summary rows that may have been created.

DROP TRIGGER IF EXISTS trg_merchant_payout_summaries_locked ON public.merchant_payout_summaries;
DROP FUNCTION IF EXISTS public.merchant_payout_summaries_prevent_locked_mutation();
DROP FUNCTION IF EXISTS public.close_and_open_merchant_payout_cycle(BIGINT, public.merchant_payout_cycle_close_reason, BIGINT, BIGINT, BIGINT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.ensure_open_merchant_payout_cycle(BIGINT);
DROP FUNCTION IF EXISTS public.compute_merchant_payout_cycle_snapshot(BIGINT, TIMESTAMPTZ, TIMESTAMPTZ);

-- Restore complete withdrawal without cycle advance (0272 body)
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
  v_description TEXT := 'Funds have been successfully transferred to the registered bank account.';
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
    v_description,
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

-- Restore reject from 0444 (hold release, no cycle)
CREATE OR REPLACE FUNCTION public.payment_reject_merchant_payout(
  p_payout_request_id BIGINT,
  p_rejected_by_system_user_id BIGINT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr public.merchant_payout_requests;
  v_hold NUMERIC(14, 2);
  v_amount NUMERIC(14, 2);
BEGIN
  SELECT * INTO v_pr
  FROM public.merchant_payout_requests
  WHERE id = p_payout_request_id
  FOR UPDATE;

  IF v_pr.id IS NULL THEN
    RAISE EXCEPTION 'payout request not found';
  END IF;

  IF v_pr.status NOT IN (
    'PENDING'::payout_request_status_type,
    'APPROVED'::payout_request_status_type,
    'PROCESSING'::payout_request_status_type
  ) THEN
    RAISE EXCEPTION 'payout not rejectable in status: %', v_pr.status;
  END IF;

  v_amount := COALESCE(v_pr.amount, 0);

  SELECT COALESCE(hold_balance, 0) INTO v_hold
  FROM public.merchant_wallet
  WHERE id = v_pr.wallet_id
  FOR UPDATE;

  IF v_hold IS NULL THEN
    RAISE EXCEPTION 'merchant wallet not found for payout %', p_payout_request_id;
  END IF;

  IF v_hold < v_amount THEN
    RAISE EXCEPTION
      'cannot reject payout %: hold_balance % < amount % (funds may already be released)',
      p_payout_request_id, v_hold, v_amount;
  END IF;

  PERFORM public.merchant_wallet_debit(
    v_pr.wallet_id, v_amount, 'HOLD_RELEASE'::wallet_transaction_category,
    'HOLD'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, 'payout_reject_hold_debit_' || p_payout_request_id,
    'Withdrawal rejected — hold released',
    jsonb_build_object('reason', p_reason, 'rejected_by', p_rejected_by_system_user_id, 'payout_request_id', p_payout_request_id)
  );

  PERFORM public.merchant_wallet_credit(
    v_pr.wallet_id, v_amount, 'FAILED_WITHDRAWAL_REVERSAL'::wallet_transaction_category,
    'AVAILABLE'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, 'payout_reject_release_' || p_payout_request_id,
    'Withdrawal rejected — funds returned to your wallet',
    jsonb_build_object('payout_request_id', p_payout_request_id, 'reason', p_reason)
  );

  UPDATE public.merchant_payout_requests
  SET status = 'CANCELLED',
      rejection_reason = p_reason,
      rejected_by_system_user_id = p_rejected_by_system_user_id,
      updated_at = NOW()
  WHERE id = p_payout_request_id;

  PERFORM public.payment_audit_log(
    'PAYOUT_REJECTED'::payment_audit_action, 'merchant_payout_requests',
    p_payout_request_id, p_rejected_by_system_user_id, NULL,
    jsonb_build_object('reason', p_reason, 'hold_released', true, 'amount', v_amount)
  );

  RETURN jsonb_build_object('ok', true, 'hold_released', true, 'amount', v_amount);
END;
$$;

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

  PERFORM public.merchant_wallet_debit(
    v_wallet_id, v_amount, 'HOLD_RELEASE'::wallet_transaction_category,
    'HOLD'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, v_idem_debit,
    'Failed withdrawal release #' || p_payout_request_id,
    jsonb_build_object('reason', p_failure_reason)
  );

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

-- Keep tables/columns for data safety; drop only if empty optional:
-- DROP TABLE IF EXISTS public.merchant_payout_cycles;
