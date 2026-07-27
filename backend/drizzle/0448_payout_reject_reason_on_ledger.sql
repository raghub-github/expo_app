-- ==============================================================================
-- Stamp admin rejection reason onto merchant wallet ledger descriptions + metadata.
-- Dashboard Payments Reject now requires a filled reason (Merchant + Rider).
-- ==============================================================================

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
  v_close_at TIMESTAMPTZ;
  v_reversal_ledger_id BIGINT;
  v_reason TEXT;
  v_desc_hold TEXT;
  v_desc_credit TEXT;
BEGIN
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'rejection reason is required (min 3 characters)';
  END IF;
  -- Cap length for ledger description readability
  v_reason := left(v_reason, 500);
  v_desc_hold := left('Withdrawal rejected — hold released. Reason: ' || v_reason, 500);
  v_desc_credit := left('Withdrawal rejected — funds returned. Reason: ' || v_reason, 500);

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

  PERFORM public.ensure_open_merchant_payout_cycle(v_pr.wallet_id);

  v_close_at := clock_timestamp();
  PERFORM public.close_and_open_merchant_payout_cycle(
    v_pr.wallet_id,
    'WITHDRAWAL_REJECTED'::public.merchant_payout_cycle_close_reason,
    p_payout_request_id,
    NULL,
    NULL,
    v_close_at
  );

  PERFORM public.merchant_wallet_debit(
    v_pr.wallet_id, v_amount, 'HOLD_RELEASE'::wallet_transaction_category,
    'HOLD'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, 'payout_reject_hold_debit_' || p_payout_request_id,
    v_desc_hold,
    jsonb_build_object(
      'reason', v_reason,
      'rejection_reason', v_reason,
      'rejected_by', p_rejected_by_system_user_id,
      'payout_request_id', p_payout_request_id
    )
  );

  v_reversal_ledger_id := public.merchant_wallet_credit(
    v_pr.wallet_id, v_amount, 'FAILED_WITHDRAWAL_REVERSAL'::wallet_transaction_category,
    'AVAILABLE'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, 'payout_reject_release_' || p_payout_request_id,
    v_desc_credit,
    jsonb_build_object(
      'payout_request_id', p_payout_request_id,
      'reason', v_reason,
      'rejection_reason', v_reason
    )
  );

  UPDATE public.merchant_payout_cycles
  SET reversal_ledger_id = v_reversal_ledger_id,
      updated_at = NOW()
  WHERE wallet_id = v_pr.wallet_id
    AND status = 'OPEN';

  UPDATE public.merchant_payout_cycles
  SET reversal_ledger_id = v_reversal_ledger_id,
      updated_at = NOW()
  WHERE payout_request_id = p_payout_request_id
    AND close_reason = 'WITHDRAWAL_REJECTED'::public.merchant_payout_cycle_close_reason;

  UPDATE public.merchant_payout_requests
  SET status = 'CANCELLED',
      rejection_reason = v_reason,
      rejected_by_system_user_id = p_rejected_by_system_user_id,
      updated_at = NOW()
  WHERE id = p_payout_request_id;

  PERFORM public.payment_audit_log(
    'PAYOUT_REJECTED'::payment_audit_action, 'merchant_payout_requests',
    p_payout_request_id, p_rejected_by_system_user_id, NULL,
    jsonb_build_object(
      'reason', v_reason,
      'hold_released', true,
      'amount', v_amount,
      'cycle_advanced', true,
      'reversal_ledger_id', v_reversal_ledger_id
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'hold_released', true,
    'amount', v_amount,
    'cycle_advanced', true,
    'reversal_ledger_id', v_reversal_ledger_id,
    'rejection_reason', v_reason
  );
END;
$$;

COMMENT ON FUNCTION public.payment_reject_merchant_payout IS
  'Super admin reject: requires reason; stamps reason on ledger + payout; releases HOLD to AVAILABLE in new cycle.';

GRANT EXECUTE ON FUNCTION public.payment_reject_merchant_payout TO service_role;
