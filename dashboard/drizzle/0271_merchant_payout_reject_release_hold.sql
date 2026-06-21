-- ============================================================================
-- 0271: Reject merchant payout → release HOLD back to AVAILABLE wallet
-- Run after 0123 (merchant_wallet_fail_withdrawal) and 0239.
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

  SELECT COALESCE(hold_balance, 0) INTO v_hold
  FROM public.merchant_wallet
  WHERE id = v_pr.wallet_id;

  IF v_hold >= v_pr.amount THEN
    PERFORM public.merchant_wallet_debit(
      v_pr.wallet_id, v_pr.amount, 'HOLD_RELEASE'::wallet_transaction_category,
      'HOLD'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
      p_payout_request_id, 'payout_reject_hold_debit_' || p_payout_request_id,
      'Withdrawal rejected — release hold #' || p_payout_request_id,
      jsonb_build_object('reason', p_reason, 'rejected_by', p_rejected_by_system_user_id)
    );

    PERFORM public.merchant_wallet_credit(
      v_pr.wallet_id, v_pr.amount, 'FAILED_WITHDRAWAL_REVERSAL'::wallet_transaction_category,
      'AVAILABLE'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
      p_payout_request_id, 'payout_reject_release_' || p_payout_request_id,
      'Withdrawal rejected — funds returned to wallet #' || p_payout_request_id,
      jsonb_build_object('payout_request_id', p_payout_request_id, 'reason', p_reason)
    );
  END IF;

  UPDATE public.merchant_payout_requests
  SET status = 'CANCELLED',
      rejection_reason = p_reason,
      rejected_by_system_user_id = p_rejected_by_system_user_id,
      updated_at = NOW()
  WHERE id = p_payout_request_id;

  PERFORM public.payment_audit_log(
    'PAYOUT_REJECTED'::payment_audit_action, 'merchant_payout_requests',
    p_payout_request_id, p_rejected_by_system_user_id, NULL,
    jsonb_build_object('reason', p_reason, 'hold_released', v_hold >= v_pr.amount)
  );

  RETURN jsonb_build_object('ok', true, 'hold_released', v_hold >= v_pr.amount);
END;
$$;

COMMENT ON FUNCTION public.payment_reject_merchant_payout IS
  'Super admin reject: releases held funds back to AVAILABLE and marks payout CANCELLED.';

GRANT EXECUTE ON FUNCTION public.payment_reject_merchant_payout TO service_role;
