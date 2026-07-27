-- ============================================================================
-- Harden payment_reject_merchant_payout:
-- Always release HOLD → AVAILABLE on reject (raise if hold is short).
-- Prevents CANCELLED payouts that leave cash stuck in hold_balance.
-- ============================================================================

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

COMMENT ON FUNCTION public.payment_reject_merchant_payout IS
  'Super admin reject: ALWAYS releases held funds back to AVAILABLE, then marks payout CANCELLED.';

GRANT EXECUTE ON FUNCTION public.payment_reject_merchant_payout TO service_role;
