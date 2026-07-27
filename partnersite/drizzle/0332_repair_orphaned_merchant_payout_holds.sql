-- ==============================================================================
-- Repair orphaned merchant payout HOLD balances after reject/fail.
-- Terminal payouts (FAILED/CANCELLED/REVERSED) without FAILED_WITHDRAWAL_REVERSAL
-- credit leave cash stuck in hold_balance → withdrawable shows ₹0.
-- Also clears excess HOLD not backed by active PENDING/APPROVED/PROCESSING payouts.
-- ==============================================================================

DO $$
DECLARE
  w RECORD;
  pr RECORD;
  v_hold NUMERIC(14, 2);
  v_avail NUMERIC(14, 2);
  v_active NUMERIC(14, 2);
  v_excess NUMERIC(14, 2);
  v_amount NUMERIC(14, 2);
  v_ledger_avail NUMERIC(14, 2);
BEGIN
  FOR w IN SELECT id AS wallet_id FROM public.merchant_wallet LOOP
    -- 1) Terminal payouts missing reversal credit
    FOR pr IN
      SELECT p.id, p.amount
      FROM public.merchant_payout_requests p
      WHERE p.wallet_id = w.wallet_id
        AND p.status IN (
          'FAILED'::payout_request_status_type,
          'CANCELLED'::payout_request_status_type,
          'REVERSED'::payout_request_status_type
        )
        AND COALESCE(p.amount, 0) > 0
        AND NOT EXISTS (
          SELECT 1
          FROM public.merchant_wallet_ledger l
          WHERE l.wallet_id = p.wallet_id
            AND l.reference_id = p.id
            AND l.direction = 'CREDIT'
            AND l.category::text IN ('FAILED_WITHDRAWAL_REVERSAL', 'WITHDRAWAL_REVERSAL')
        )
      ORDER BY p.id ASC
    LOOP
      v_amount := COALESCE(pr.amount, 0);

      SELECT COALESCE(hold_balance, 0) INTO v_hold
      FROM public.merchant_wallet
      WHERE id = w.wallet_id
      FOR UPDATE;

      IF v_hold < v_amount THEN
        CONTINUE;
      END IF;

      BEGIN
        PERFORM public.merchant_wallet_debit(
          w.wallet_id, v_amount, 'HOLD_RELEASE'::wallet_transaction_category,
          'HOLD'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
          pr.id, 'payout_repair_hold_debit_' || pr.id,
          'Repair: release hold for terminal payout',
          jsonb_build_object('payout_request_id', pr.id, 'repair', true)
        );

        PERFORM public.merchant_wallet_credit(
          w.wallet_id, v_amount, 'FAILED_WITHDRAWAL_REVERSAL'::wallet_transaction_category,
          'AVAILABLE'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
          pr.id, 'payout_repair_release_' || pr.id,
          'Withdrawal returned — funds restored to your wallet',
          jsonb_build_object('payout_request_id', pr.id, 'repair', true)
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '0447 repair payout % failed: %', pr.id, SQLERRM;
      END;
    END LOOP;

    -- 2) Excess HOLD not covered by active payouts
    SELECT COALESCE(hold_balance, 0), COALESCE(available_balance, 0)
      INTO v_hold, v_avail
    FROM public.merchant_wallet
    WHERE id = w.wallet_id
    FOR UPDATE;

    SELECT COALESCE(SUM(amount), 0) INTO v_active
    FROM public.merchant_payout_requests
    WHERE wallet_id = w.wallet_id
      AND status IN (
        'PENDING'::payout_request_status_type,
        'APPROVED'::payout_request_status_type,
        'PROCESSING'::payout_request_status_type
      );

    v_excess := ROUND(v_hold - v_active, 2);
    IF v_excess < 0.01 THEN
      CONTINUE;
    END IF;

    -- Approximate AVAILABLE ledger net (same buckets withdrawable uses)
    SELECT COALESCE(ROUND(SUM(
      CASE
        WHEN direction = 'CREDIT' THEN amount
        WHEN direction = 'DEBIT' THEN -amount
        ELSE 0
      END
    ), 2), 0)
    INTO v_ledger_avail
    FROM public.merchant_wallet_ledger
    WHERE wallet_id = w.wallet_id
      AND COALESCE(balance_type::text, 'AVAILABLE') IN ('AVAILABLE', 'LOCKED');

    BEGIN
      PERFORM public.merchant_wallet_debit(
        w.wallet_id, v_excess, 'HOLD_RELEASE'::wallet_transaction_category,
        'HOLD'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
        0, 'payout_repair_excess_hold_debit_' || w.wallet_id || '_' || (v_excess * 100)::bigint,
        'Repair: release orphaned hold balance',
        jsonb_build_object('repair', true, 'excess', true)
      );

      IF COALESCE(v_ledger_avail, 0) < 0.01 THEN
        PERFORM public.merchant_wallet_credit(
          w.wallet_id, v_excess, 'FAILED_WITHDRAWAL_REVERSAL'::wallet_transaction_category,
          'AVAILABLE'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
          0, 'payout_repair_excess_hold_credit_' || w.wallet_id || '_' || (v_excess * 100)::bigint,
          'Orphaned hold released — funds restored to your wallet',
          jsonb_build_object('repair', true, 'excess', true)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '0447 excess hold repair wallet % failed: %', w.wallet_id, SQLERRM;
    END;
  END LOOP;
END;
$$;
