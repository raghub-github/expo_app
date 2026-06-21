-- ============================================================================
-- 0270: Merchant payout PG transaction ID (super-admin → merchant ledger)
-- Run on Supabase after 0239 / merchant_wallet migrations.
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

ALTER TABLE public.merchant_payout_requests
  ADD COLUMN IF NOT EXISTS pg_transaction_id TEXT;

COMMENT ON COLUMN public.merchant_payout_requests.pg_transaction_id IS
  'Payment gateway transaction ID entered by super admin when marking payout complete. Shown in merchant ledger for bank reference.';

CREATE INDEX IF NOT EXISTS merchant_payout_requests_pg_transaction_id_idx
  ON public.merchant_payout_requests(pg_transaction_id)
  WHERE pg_transaction_id IS NOT NULL;

-- Complete merchant payout: persist PG TNX ID, sync approval row, debit HOLD ledger.
CREATE OR REPLACE FUNCTION public.payment_complete_merchant_payout(
  p_payout_request_id BIGINT,
  p_pg_transaction_id TEXT,
  p_actor_system_user_id BIGINT,
  p_utr_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pr public.merchant_payout_requests;
  v_pg TEXT;
  v_utr TEXT;
BEGIN
  v_pg := NULLIF(TRIM(p_pg_transaction_id), '');
  IF v_pg IS NULL THEN
    RAISE EXCEPTION 'pg_transaction_id is required';
  END IF;

  v_utr := NULLIF(TRIM(COALESCE(p_utr_reference, '')), '');

  SELECT * INTO v_pr
  FROM public.merchant_payout_requests
  WHERE id = p_payout_request_id
  FOR UPDATE;

  IF v_pr.id IS NULL THEN
    RAISE EXCEPTION 'payout request not found';
  END IF;

  IF v_pr.status = 'COMPLETED'::payout_request_status_type THEN
    UPDATE public.merchant_payout_requests
    SET pg_transaction_id = v_pg,
        utr_reference = COALESCE(v_utr, utr_reference),
        updated_at = NOW()
    WHERE id = p_payout_request_id;

    UPDATE public.payment_payout_approvals
    SET gateway_payout_id = v_pg,
        utr_reference = COALESCE(v_utr, utr_reference),
        updated_at = NOW()
    WHERE payout_request_id = p_payout_request_id AND payout_type = 'MERCHANT';

    PERFORM public.payment_audit_log(
      'MANUAL_OVERRIDE'::payment_audit_action,
      'merchant_payout_requests',
      p_payout_request_id,
      p_actor_system_user_id,
      NULL,
      jsonb_build_object('pg_transaction_id', v_pg, 'utr_reference', v_utr)
    );

    RETURN jsonb_build_object('ok', true, 'updated_only', true);
  END IF;

  IF v_pr.status = 'PENDING'::payout_request_status_type THEN
    UPDATE public.merchant_payout_requests
    SET status = 'APPROVED',
        approved_at = NOW(),
        approved_by_system_user_id = p_actor_system_user_id,
        updated_at = NOW()
    WHERE id = p_payout_request_id;

    INSERT INTO public.payment_payout_approvals (
      payout_request_id, payout_type, status, amount, net_amount,
      approved_by_system_user_id
    ) VALUES (
      p_payout_request_id, 'MERCHANT', 'APPROVED', v_pr.amount, v_pr.net_payout_amount,
      p_actor_system_user_id
    )
    ON CONFLICT (payout_request_id, payout_type) DO UPDATE
    SET status = 'APPROVED',
        approved_by_system_user_id = p_actor_system_user_id,
        updated_at = NOW();

    SELECT * INTO v_pr FROM public.merchant_payout_requests WHERE id = p_payout_request_id;
  END IF;

  IF v_pr.status NOT IN ('APPROVED'::payout_request_status_type, 'PROCESSING'::payout_request_status_type) THEN
    RAISE EXCEPTION 'cannot complete payout in status: %', v_pr.status;
  END IF;

  UPDATE public.merchant_payout_requests
  SET pg_transaction_id = v_pg,
      utr_reference = COALESCE(v_utr, utr_reference),
      status = 'PROCESSING',
      processed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_payout_request_id;

  UPDATE public.payment_payout_approvals
  SET gateway_payout_id = v_pg,
      utr_reference = COALESCE(v_utr, utr_reference),
      status = 'PROCESSING',
      updated_at = NOW()
  WHERE payout_request_id = p_payout_request_id AND payout_type = 'MERCHANT';

  PERFORM public.merchant_wallet_complete_withdrawal(p_payout_request_id);

  UPDATE public.merchant_payout_requests
  SET pg_transaction_id = v_pg,
      utr_reference = COALESCE(v_utr, utr_reference),
      updated_at = NOW()
  WHERE id = p_payout_request_id;

  UPDATE public.payment_payout_approvals
  SET gateway_payout_id = v_pg,
      utr_reference = COALESCE(v_utr, utr_reference),
      status = 'COMPLETED',
      updated_at = NOW()
  WHERE payout_request_id = p_payout_request_id AND payout_type = 'MERCHANT';

  PERFORM public.payment_audit_log(
    'PAYOUT_APPROVED'::payment_audit_action,
    'merchant_payout_requests',
    p_payout_request_id,
    p_actor_system_user_id,
    NULL,
    jsonb_build_object('pg_transaction_id', v_pg, 'utr_reference', v_utr, 'completed', true)
  );

  RETURN jsonb_build_object('ok', true, 'pg_transaction_id', v_pg);
END;
$$;

COMMENT ON FUNCTION public.payment_complete_merchant_payout IS
  'Super admin: mark merchant withdrawal paid — stores PG TNX ID, completes wallet hold debit, visible in merchant ledger.';

GRANT EXECUTE ON FUNCTION public.payment_complete_merchant_payout TO service_role;
