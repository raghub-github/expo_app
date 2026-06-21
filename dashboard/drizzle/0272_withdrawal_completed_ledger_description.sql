-- ============================================================================
-- 0272: Merchant-facing withdrawal complete ledger description (no payout #)
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

-- Note: merchant_wallet_ledger is immutable (0239 trigger). Legacy rows with
-- "Withdrawal completed #N" are normalized in partnersite/merchant-app UI via
-- formatLedgerDescription(); new completions use the description above.
