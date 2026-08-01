-- ============================================================================
-- 0481 — A returned withdrawal is principal coming back, not payout earnings.
--
-- Problem: compute_merchant_payout_cycle_snapshot bundled
-- FAILED_WITHDRAWAL_REVERSAL / WITHDRAWAL_REVERSAL credits into other_credits,
-- which feeds estimated_payout (and, via the 0446 backfill block, net_payout).
-- A merchant whose withdrawal was rejected therefore saw the returned money
-- presented as "Net payout" for that cycle.
--
-- This migration:
--   1. adds merchant_payout_summaries.withdrawal_reversal_credits
--   2. lets a repair migration update LOCKED summaries behind an explicit,
--      transaction-local session flag (LOCKED rows stay undeletable)
--   3. rewrites compute_merchant_payout_cycle_snapshot so reversal credits are
--      reported separately and excluded from estimated_payout
--   4. persists the new field from close_and_open_merchant_payout_cycle
--   5. closes cycles at now() on reject/fail so the reversal ledger row lands in
--      the NEW cycle (the ledger uses now(); the old clock_timestamp() boundary
--      dropped the reversal back into the cycle it had just closed)
--   6. links historical backfilled cycles to the payout request that closed them
--      so the merchant can be shown the admin's rejection reason
--   7. repairs already-locked snapshots: reversal amount moved out of
--      other_credits / estimated_payout, and net_payout forced to 0 for
--      rejected/failed cycles (nothing was ever transferred). Genuine
--      WITHDRAWAL_COMPLETED payouts keep their transferred amount untouched.
--      Every changed row keeps its pre-repair values in metadata.repair_0481.
--
-- Forward-only and idempotent: the repair skips rows it has already stamped.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Reported-but-not-payable credit bucket
-- ---------------------------------------------------------------------------
ALTER TABLE public.merchant_payout_summaries
  ADD COLUMN IF NOT EXISTS withdrawal_reversal_credits NUMERIC(14, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.merchant_payout_summaries.withdrawal_reversal_credits IS
  'Withdrawal principal returned to the wallet in this period. Reported only — never part of estimated_payout / net_payout.';

-- ---------------------------------------------------------------------------
-- 2) LOCKED immutability, with an explicit repair escape hatch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merchant_payout_summaries_prevent_locked_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_repair BOOLEAN := COALESCE(
    NULLIF(current_setting('gatimitra.payout_summary_repair', true), ''),
    'off'
  ) = 'on';
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- LOCKED snapshots are never deletable, not even by a repair migration.
    IF OLD.status = 'LOCKED'::public.merchant_payout_summary_status THEN
      RAISE EXCEPTION 'merchant_payout_summaries row % is LOCKED and cannot be deleted', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'LOCKED'::public.merchant_payout_summary_status AND NOT v_repair THEN
    RAISE EXCEPTION 'merchant_payout_summaries row % is LOCKED and cannot be updated', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.merchant_payout_summaries_prevent_locked_mutation IS
  'LOCKED snapshots are immutable. A correction migration may set gatimitra.payout_summary_repair = on (transaction-local) to amend values; deletes stay blocked.';

-- ---------------------------------------------------------------------------
-- 3) Snapshot: split withdrawal reversals out of the payout formula
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_merchant_payout_cycle_snapshot(
  p_wallet_id BIGINT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_net_order_value NUMERIC(14, 2) := 0;
  v_item_subtotal NUMERIC(14, 2) := 0;
  v_packaging NUMERIC(14, 2) := 0;
  v_cancel_comp NUMERIC(14, 2) := 0;
  v_other_credits NUMERIC(14, 2) := 0;
  v_withdrawal_reversal NUMERIC(14, 2) := 0;
  v_penalties NUMERIC(14, 2) := 0;
  v_refund_adj NUMERIC(14, 2) := 0;
  v_manual_debit NUMERIC(14, 2) := 0;
  v_chargebacks NUMERIC(14, 2) := 0;
  v_coupon NUMERIC(14, 2) := 0;
  v_pct_flat NUMERIC(14, 2) := 0;
  v_combo NUMERIC(14, 2) := 0;
  v_free_del NUMERIC(14, 2) := 0;
  v_mechanism NUMERIC(14, 2) := 0;
  v_delivered INT := 0;
  v_rejected INT := 0;
  v_order_deductions NUMERIC(14, 2);
  v_restaurant_discounts NUMERIC(14, 2);
  v_estimated NUMERIC(14, 2);
BEGIN
  SELECT
    COALESCE(SUM(l.amount) FILTER (
      WHERE l.direction = 'CREDIT' AND l.category = 'ORDER_EARNING'
    ), 0),
    COALESCE(SUM(l.amount) FILTER (
      WHERE l.direction = 'CREDIT'
        AND l.category = 'ORDER_ADJUSTMENT'
        AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
        AND COALESCE(l.metadata->>'balance_impact', '') = 'credit'
    ), 0),
    -- Earnings-side other credits only (returned withdrawals excluded below)
    COALESCE(SUM(l.amount) FILTER (
      WHERE l.direction = 'CREDIT'
        AND l.category::text IN (
          'MANUAL_CREDIT',
          'ADJUSTMENT_CREDIT',
          'GST_CREDIT',
          'PENALTY_REVERSAL'
        )
    ), 0),
    COALESCE(SUM(l.amount) FILTER (
      WHERE l.direction = 'CREDIT'
        AND l.category::text IN (
          'FAILED_WITHDRAWAL_REVERSAL',
          'WITHDRAWAL_REVERSAL'
        )
    ), 0),
    COALESCE(SUM(l.amount) FILTER (
      WHERE l.direction = 'DEBIT'
        AND l.category::text = 'PENALTY'
        AND COALESCE(l.metadata->>'pending', 'false') NOT IN ('true', '1')
        AND COALESCE(l.metadata->>'status', '') NOT ILIKE '%pending%'
        AND COALESCE(l.metadata->>'finalized', 'true') NOT IN ('false', '0')
    ), 0),
    COALESCE(SUM(l.amount) FILTER (
      WHERE l.direction = 'DEBIT'
        AND l.category::text IN ('REFUND_DEBIT', 'REFUND_TO_CUSTOMER')
    ), 0),
    COALESCE(SUM(l.amount) FILTER (
      WHERE l.direction = 'DEBIT'
        AND l.category::text IN ('MANUAL_DEBIT', 'ADJUSTMENT_DEBIT')
    ), 0),
    COALESCE(SUM(l.amount) FILTER (
      WHERE l.direction = 'DEBIT'
        AND (
          l.category::text ILIKE '%CHARGEBACK%'
          OR COALESCE(l.metadata->>'type', '') ILIKE '%chargeback%'
          OR COALESCE(l.description, '') ILIKE '%chargeback%'
        )
    ), 0),
    COUNT(*) FILTER (
      WHERE l.direction = 'CREDIT' AND l.category = 'ORDER_EARNING'
    )::int
  INTO
    v_net_order_value,
    v_cancel_comp,
    v_other_credits,
    v_withdrawal_reversal,
    v_penalties,
    v_refund_adj,
    v_manual_debit,
    v_chargebacks,
    v_delivered
  FROM public.merchant_wallet_ledger l
  WHERE l.wallet_id = p_wallet_id
    AND l.created_at >= p_period_start
    AND l.created_at < p_period_end;

  -- Informational B + item/packaging from OSB for credited ORDER_EARNING only
  SELECT
    COALESCE(SUM(
      CASE
        WHEN COALESCE(osb.item_total, 0) > 0 THEN osb.item_total
        WHEN COALESCE(oc.item_total, 0) > 0 THEN oc.item_total
        ELSE GREATEST(0, po.ledger_amount - COALESCE(osb.packaging_charge, 0))
      END
    ), 0),
    COALESCE(SUM(COALESCE(osb.packaging_charge, 0)), 0),
    COALESCE(SUM(COALESCE(NULLIF(osb.coupon_offer_discount, 0), NULLIF(osb.promo_discount, 0), osb.coupon_discount, 0)), 0),
    COALESCE(SUM(COALESCE(NULLIF(osb.percentage_flat_offer_discount, 0), NULLIF(osb.other_restaurant_discount, 0), osb.merchant_funded_discount, 0)), 0),
    COALESCE(SUM(COALESCE(osb.combo_offer_discount, 0)), 0),
    COALESCE(SUM(COALESCE(NULLIF(osb.free_delivery_offer_discount, 0), NULLIF(osb.delivery_charge_discount, 0), 0)), 0),
    COALESCE(SUM(COALESCE(NULLIF(osb.payment_mechanism_fee, 0), osb.commission_amount, 0)), 0)
  INTO
    v_item_subtotal,
    v_packaging,
    v_coupon,
    v_pct_flat,
    v_combo,
    v_free_del,
    v_mechanism
  FROM (
    SELECT DISTINCT ON (l.reference_id)
      l.reference_id,
      l.amount AS ledger_amount,
      f.order_id
    FROM public.merchant_wallet_ledger l
    LEFT JOIN public.orders_food f ON f.id = l.reference_id
    WHERE l.wallet_id = p_wallet_id
      AND l.direction = 'CREDIT'
      AND l.category = 'ORDER_EARNING'
      AND l.reference_id IS NOT NULL
      AND l.created_at >= p_period_start
      AND l.created_at < p_period_end
    ORDER BY l.reference_id, l.created_at DESC
  ) po
  LEFT JOIN public.order_settlement_breakdown osb ON osb.order_id = po.order_id
  LEFT JOIN public.orders_core oc ON oc.id = po.order_id;

  SELECT COUNT(*)::int INTO v_rejected
  FROM public.merchant_wallet_ledger l
  WHERE l.wallet_id = p_wallet_id
    AND l.created_at >= p_period_start
    AND l.created_at < p_period_end
    AND l.category = 'ORDER_ADJUSTMENT'
    AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation';

  -- Mechanism fee already inside ORDER_EARNING net — do not double-count in C
  v_order_deductions := ROUND(v_penalties + v_refund_adj + v_manual_debit + v_chargebacks, 2);
  v_restaurant_discounts := ROUND(v_coupon + v_pct_flat + v_combo + v_free_del, 2);
  -- v_withdrawal_reversal is deliberately absent: returned principal is not earnings.
  v_estimated := GREATEST(
    0,
    ROUND(v_net_order_value + v_cancel_comp + v_other_credits - v_order_deductions, 2)
  );

  IF v_item_subtotal <= 0 AND v_net_order_value > 0 THEN
    v_item_subtotal := v_net_order_value;
  END IF;

  RETURN jsonb_build_object(
    'net_order_value', ROUND(v_net_order_value, 2),
    'item_subtotal', ROUND(v_item_subtotal, 2),
    'packaging_charges', ROUND(v_packaging, 2),
    'coupon_offer_discount', ROUND(v_coupon, 2),
    'percentage_flat_offer_discount', ROUND(v_pct_flat, 2),
    'combo_offer_discount', ROUND(v_combo, 2),
    'free_delivery_offer_discount', ROUND(v_free_del, 2),
    'restaurant_discounts', v_restaurant_discounts,
    'mechanism_fee', ROUND(v_mechanism, 2),
    'customer_compensation', 0,
    'penalties', ROUND(v_penalties, 2),
    'refund_adjustments', ROUND(v_refund_adj, 2),
    'manual_debit_adjustments', ROUND(v_manual_debit, 2),
    'chargebacks', ROUND(v_chargebacks, 2),
    'order_deductions', v_order_deductions,
    'cancellation_compensation', ROUND(v_cancel_comp, 2),
    'other_credits', ROUND(v_other_credits, 2),
    'withdrawal_reversal_credits', ROUND(v_withdrawal_reversal, 2),
    'estimated_payout', v_estimated,
    'delivered_orders', v_delivered,
    'rejected_orders', v_rejected,
    'net_payout', v_estimated
  );
END;
$$;

COMMENT ON FUNCTION public.compute_merchant_payout_cycle_snapshot IS
  'Ledger snapshot for [start, end). Withdrawal reversal credits are reported separately and never counted in estimated_payout.';

-- ---------------------------------------------------------------------------
-- 4) Persist withdrawal_reversal_credits when a cycle closes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_and_open_merchant_payout_cycle(
  p_wallet_id BIGINT,
  p_close_reason public.merchant_payout_cycle_close_reason,
  p_payout_request_id BIGINT DEFAULT NULL,
  p_withdrawal_ledger_id BIGINT DEFAULT NULL,
  p_reversal_ledger_id BIGINT DEFAULT NULL,
  p_close_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_close_at TIMESTAMPTZ;
  v_open public.merchant_payout_cycles;
  v_store_id BIGINT;
  v_snap JSONB;
  v_summary_id BIGINT;
  v_new_cycle_id BIGINT;
  v_amount NUMERIC(14, 2) := 0;
BEGIN
  v_close_at := COALESCE(p_close_at, clock_timestamp());

  SELECT * INTO v_open
  FROM public.merchant_payout_cycles
  WHERE wallet_id = p_wallet_id AND status = 'OPEN'
  FOR UPDATE;

  IF v_open.id IS NULL THEN
    PERFORM public.ensure_open_merchant_payout_cycle(p_wallet_id);
    SELECT * INTO v_open
    FROM public.merchant_payout_cycles
    WHERE wallet_id = p_wallet_id AND status = 'OPEN'
    FOR UPDATE;
  END IF;

  IF v_open.period_start >= v_close_at THEN
    v_close_at := v_open.period_start + INTERVAL '1 microsecond';
  END IF;

  v_snap := public.compute_merchant_payout_cycle_snapshot(
    p_wallet_id, v_open.period_start, v_close_at
  );

  IF p_payout_request_id IS NOT NULL THEN
    SELECT COALESCE(amount, 0) INTO v_amount
    FROM public.merchant_payout_requests
    WHERE id = p_payout_request_id;
  END IF;

  -- For completed withdrawals, net_payout = transferred amount
  IF p_close_reason = 'WITHDRAWAL_COMPLETED'::public.merchant_payout_cycle_close_reason
     AND v_amount > 0 THEN
    v_snap := v_snap || jsonb_build_object('net_payout', ROUND(v_amount, 2));
  END IF;

  -- Rejected/failed: nothing paid out
  IF p_close_reason IN (
    'WITHDRAWAL_REJECTED'::public.merchant_payout_cycle_close_reason,
    'WITHDRAWAL_FAILED'::public.merchant_payout_cycle_close_reason
  ) THEN
    v_snap := v_snap || jsonb_build_object('net_payout', 0);
  END IF;

  INSERT INTO public.merchant_payout_summaries (
    wallet_id,
    withdrawal_ledger_id,
    period_start,
    period_end,
    payout_date,
    net_payout,
    item_subtotal,
    packaging_charges,
    promo_discount,
    other_restaurant_discount,
    delivery_charge_discount,
    payment_mechanism_fee,
    customer_compensation,
    delivered_orders,
    rejected_orders,
    metadata,
    cycle_id,
    payout_request_id,
    close_reason,
    status,
    net_order_value,
    restaurant_discounts,
    order_deductions,
    cancellation_compensation,
    other_credits,
    withdrawal_reversal_credits,
    penalties,
    refund_adjustments,
    manual_debit_adjustments,
    chargebacks,
    estimated_payout,
    coupon_offer_discount,
    percentage_flat_offer_discount,
    combo_offer_discount,
    free_delivery_offer_discount
  ) VALUES (
    p_wallet_id,
    p_withdrawal_ledger_id,
    v_open.period_start,
    v_close_at,
    v_close_at,
    COALESCE((v_snap->>'net_payout')::numeric, 0),
    COALESCE((v_snap->>'item_subtotal')::numeric, 0),
    COALESCE((v_snap->>'packaging_charges')::numeric, 0),
    COALESCE((v_snap->>'coupon_offer_discount')::numeric, 0),
    COALESCE((v_snap->>'percentage_flat_offer_discount')::numeric, 0),
    COALESCE((v_snap->>'free_delivery_offer_discount')::numeric, 0),
    COALESCE((v_snap->>'mechanism_fee')::numeric, 0),
    COALESCE((v_snap->>'customer_compensation')::numeric, 0),
    COALESCE((v_snap->>'delivered_orders')::int, 0),
    COALESCE((v_snap->>'rejected_orders')::int, 0),
    jsonb_build_object(
      'snapshot', v_snap,
      'close_reason', p_close_reason::text,
      'payout_request_id', p_payout_request_id
    ),
    v_open.id,
    p_payout_request_id,
    p_close_reason,
    'LOCKED',
    COALESCE((v_snap->>'net_order_value')::numeric, 0),
    COALESCE((v_snap->>'restaurant_discounts')::numeric, 0),
    COALESCE((v_snap->>'order_deductions')::numeric, 0),
    COALESCE((v_snap->>'cancellation_compensation')::numeric, 0),
    COALESCE((v_snap->>'other_credits')::numeric, 0),
    COALESCE((v_snap->>'withdrawal_reversal_credits')::numeric, 0),
    COALESCE((v_snap->>'penalties')::numeric, 0),
    COALESCE((v_snap->>'refund_adjustments')::numeric, 0),
    COALESCE((v_snap->>'manual_debit_adjustments')::numeric, 0),
    COALESCE((v_snap->>'chargebacks')::numeric, 0),
    COALESCE((v_snap->>'estimated_payout')::numeric, 0),
    COALESCE((v_snap->>'coupon_offer_discount')::numeric, 0),
    COALESCE((v_snap->>'percentage_flat_offer_discount')::numeric, 0),
    COALESCE((v_snap->>'combo_offer_discount')::numeric, 0),
    COALESCE((v_snap->>'free_delivery_offer_discount')::numeric, 0)
  )
  RETURNING id INTO v_summary_id;

  UPDATE public.merchant_payout_cycles
  SET status = 'CLOSED',
      period_end = v_close_at,
      close_reason = p_close_reason,
      payout_request_id = p_payout_request_id,
      withdrawal_ledger_id = p_withdrawal_ledger_id,
      reversal_ledger_id = p_reversal_ledger_id,
      summary_id = v_summary_id,
      locked_at = v_close_at,
      updated_at = NOW()
  WHERE id = v_open.id;

  SELECT merchant_store_id INTO v_store_id
  FROM public.merchant_wallet
  WHERE id = p_wallet_id;

  INSERT INTO public.merchant_payout_cycles (
    wallet_id, merchant_store_id, period_start, status
  ) VALUES (
    p_wallet_id, v_store_id, v_close_at, 'OPEN'
  )
  RETURNING id INTO v_new_cycle_id;

  RETURN jsonb_build_object(
    'ok', true,
    'closed_cycle_id', v_open.id,
    'open_cycle_id', v_new_cycle_id,
    'summary_id', v_summary_id,
    'period_end', v_close_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Close at now() on reject/fail so the reversal lands in the NEW cycle
--    merchant_wallet_ledger.created_at defaults to now() (transaction start),
--    which is earlier than clock_timestamp(); the old boundary therefore put the
--    reversal back inside the cycle it had just closed.
-- ---------------------------------------------------------------------------
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

  PERFORM public.ensure_open_merchant_payout_cycle(v_pr.wallet_id);

  -- Close current cycle BEFORE returning funds so reversal lands in the new cycle
  v_close_at := now();
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
    'Withdrawal rejected — hold released',
    jsonb_build_object('reason', p_reason, 'rejected_by', p_rejected_by_system_user_id, 'payout_request_id', p_payout_request_id)
  );

  v_reversal_ledger_id := public.merchant_wallet_credit(
    v_pr.wallet_id, v_amount, 'FAILED_WITHDRAWAL_REVERSAL'::wallet_transaction_category,
    'AVAILABLE'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, 'payout_reject_release_' || p_payout_request_id,
    'Withdrawal rejected — funds returned to your wallet',
    jsonb_build_object('payout_request_id', p_payout_request_id, 'reason', p_reason)
  );

  UPDATE public.merchant_payout_cycles
  SET reversal_ledger_id = v_reversal_ledger_id,
      updated_at = NOW()
  WHERE wallet_id = v_pr.wallet_id
    AND status = 'OPEN';

  -- Also stamp closed cycle with reversal link for audit
  UPDATE public.merchant_payout_cycles
  SET reversal_ledger_id = v_reversal_ledger_id,
      updated_at = NOW()
  WHERE payout_request_id = p_payout_request_id
    AND close_reason = 'WITHDRAWAL_REJECTED'::public.merchant_payout_cycle_close_reason;

  UPDATE public.merchant_payout_requests
  SET status = 'CANCELLED',
      rejection_reason = p_reason,
      rejected_by_system_user_id = p_rejected_by_system_user_id,
      updated_at = NOW()
  WHERE id = p_payout_request_id;

  PERFORM public.payment_audit_log(
    'PAYOUT_REJECTED'::payment_audit_action, 'merchant_payout_requests',
    p_payout_request_id, p_rejected_by_system_user_id, NULL,
    jsonb_build_object(
      'reason', p_reason,
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
    'reversal_ledger_id', v_reversal_ledger_id
  );
END;
$$;

COMMENT ON FUNCTION public.payment_reject_merchant_payout IS
  'Super admin reject: close payout cycle at now(), release hold to AVAILABLE in the new cycle, mark CANCELLED.';

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
  v_close_at TIMESTAMPTZ;
  v_reversal_ledger_id BIGINT;
BEGIN
  SELECT wallet_id, amount, status INTO v_wallet_id, v_amount, v_status
  FROM public.merchant_payout_requests
  WHERE id = p_payout_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout request not found: %', p_payout_request_id;
  END IF;

  IF v_status NOT IN ('PENDING', 'APPROVED', 'PROCESSING') THEN
    RAISE EXCEPTION 'cannot fail payout in status: %', v_status;
  END IF;

  PERFORM public.ensure_open_merchant_payout_cycle(v_wallet_id);

  v_close_at := now();
  PERFORM public.close_and_open_merchant_payout_cycle(
    v_wallet_id,
    'WITHDRAWAL_FAILED'::public.merchant_payout_cycle_close_reason,
    p_payout_request_id,
    NULL,
    NULL,
    v_close_at
  );

  v_idem_debit := 'payout_fail_hold_debit_' || p_payout_request_id;
  v_idem_credit := 'payout_fail_release_' || p_payout_request_id;

  PERFORM public.merchant_wallet_debit(
    v_wallet_id, v_amount, 'HOLD_RELEASE'::wallet_transaction_category,
    'HOLD'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, v_idem_debit,
    'Failed withdrawal release #' || p_payout_request_id,
    jsonb_build_object('reason', p_failure_reason)
  );

  v_reversal_ledger_id := public.merchant_wallet_credit(
    v_wallet_id, v_amount, 'FAILED_WITHDRAWAL_REVERSAL'::wallet_transaction_category,
    'AVAILABLE'::wallet_balance_type, 'WITHDRAWAL'::wallet_reference_type,
    p_payout_request_id, v_idem_credit,
    'Withdrawal failed — funds released #' || p_payout_request_id,
    jsonb_build_object('payout_request_id', p_payout_request_id, 'reason', p_failure_reason)
  );

  UPDATE public.merchant_payout_cycles
  SET reversal_ledger_id = v_reversal_ledger_id,
      updated_at = NOW()
  WHERE wallet_id = v_wallet_id AND status = 'OPEN';

  UPDATE public.merchant_payout_cycles
  SET reversal_ledger_id = v_reversal_ledger_id,
      updated_at = NOW()
  WHERE payout_request_id = p_payout_request_id
    AND close_reason = 'WITHDRAWAL_FAILED'::public.merchant_payout_cycle_close_reason;

  UPDATE public.merchant_payout_requests
  SET status = 'FAILED',
      failure_reason = p_failure_reason,
      updated_at = NOW()
  WHERE id = p_payout_request_id;
END;
$$;

COMMENT ON FUNCTION public.merchant_wallet_fail_withdrawal IS
  'Bank transfer fail: close cycle at now(), release HOLD to AVAILABLE in the new cycle, mark FAILED.';

-- ---------------------------------------------------------------------------
-- 6) Link backfilled cycles to the payout request that closed them.
--    0446 built historical cycles from ledger boundaries without a request id,
--    so the merchant could not be shown why the withdrawal came back.
-- ---------------------------------------------------------------------------
WITH candidate AS (
  SELECT
    c.id AS cycle_id,
    pr.id AS payout_request_id,
    l.id AS reversal_ledger_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.id ORDER BY pr.id DESC
    ) AS rn
  FROM public.merchant_payout_cycles c
  JOIN public.merchant_payout_requests pr
    ON pr.wallet_id = c.wallet_id
   AND pr.status IN ('CANCELLED'::payout_request_status_type, 'FAILED'::payout_request_status_type)
  LEFT JOIN public.merchant_wallet_ledger l
    ON l.wallet_id = pr.wallet_id
   AND l.reference_id = pr.id
   AND l.direction = 'CREDIT'
   AND l.category::text IN ('FAILED_WITHDRAWAL_REVERSAL', 'WITHDRAWAL_REVERSAL')
  WHERE c.status = 'CLOSED'
    AND c.payout_request_id IS NULL
    AND c.close_reason IN (
      'WITHDRAWAL_REJECTED'::public.merchant_payout_cycle_close_reason,
      'WITHDRAWAL_FAILED'::public.merchant_payout_cycle_close_reason
    )
    AND c.period_end = COALESCE(l.created_at, pr.updated_at, pr.created_at)
)
UPDATE public.merchant_payout_cycles c
SET payout_request_id = candidate.payout_request_id,
    reversal_ledger_id = COALESCE(c.reversal_ledger_id, candidate.reversal_ledger_id),
    metadata = COALESCE(c.metadata, '{}'::jsonb)
      || jsonb_build_object('linked_payout_request_by', '0481'),
    updated_at = NOW()
FROM candidate
WHERE c.id = candidate.cycle_id
  AND candidate.rn = 1;

-- ---------------------------------------------------------------------------
-- 7) Repair already-locked snapshots
--    Surgical: only the reversal amount is moved out of the payout value, and
--    net_payout is zeroed for cycles that never transferred money. Everything
--    else in the frozen snapshot (order counts, A/B/C figures) is untouched, and
--    pre-repair values are preserved in metadata.repair_0481.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_reversal NUMERIC(14, 2);
  v_applied NUMERIC(14, 2);
  v_new_other NUMERIC(14, 2);
  v_new_estimated NUMERIC(14, 2);
  v_new_net NUMERIC(14, 2);
  v_request_amount NUMERIC(14, 2);
  v_repaired INT := 0;
BEGIN
  PERFORM set_config('gatimitra.payout_summary_repair', 'on', true);

  FOR r IN
    SELECT
      s.id,
      s.wallet_id,
      s.period_start,
      s.period_end,
      s.net_payout,
      s.estimated_payout,
      s.other_credits,
      s.withdrawal_reversal_credits,
      s.close_reason,
      COALESCE(s.payout_request_id, c.payout_request_id) AS payout_request_id,
      s.metadata,
      c.id AS cycle_id
    FROM public.merchant_payout_summaries s
    LEFT JOIN public.merchant_payout_cycles c ON c.summary_id = s.id
    WHERE s.status = 'LOCKED'
      AND s.period_start IS NOT NULL
      AND s.period_end IS NOT NULL
      AND NOT (COALESCE(s.metadata, '{}'::jsonb) ? 'repair_0481')
  LOOP
    SELECT COALESCE(SUM(l.amount), 0) INTO v_reversal
    FROM public.merchant_wallet_ledger l
    WHERE l.wallet_id = r.wallet_id
      AND l.direction = 'CREDIT'
      AND l.category::text IN ('FAILED_WITHDRAWAL_REVERSAL', 'WITHDRAWAL_REVERSAL')
      AND l.created_at >= r.period_start
      AND l.created_at < r.period_end;

    -- Never claw back more than the snapshot actually booked as other credits:
    -- a reversal can exceed it when boundary drift double-counted a later refund.
    v_applied := LEAST(GREATEST(v_reversal, 0), GREATEST(COALESCE(r.other_credits, 0), 0));

    v_request_amount := 0;
    IF r.payout_request_id IS NOT NULL THEN
      SELECT COALESCE(amount, 0) INTO v_request_amount
      FROM public.merchant_payout_requests
      WHERE id = r.payout_request_id;
    END IF;

    v_new_other := ROUND(GREATEST(0, COALESCE(r.other_credits, 0) - v_applied), 2);
    v_new_estimated := ROUND(GREATEST(0, COALESCE(r.estimated_payout, 0) - v_applied), 2);

    IF r.close_reason IN (
      'WITHDRAWAL_REJECTED'::public.merchant_payout_cycle_close_reason,
      'WITHDRAWAL_FAILED'::public.merchant_payout_cycle_close_reason
    ) THEN
      -- Nothing left the platform for these cycles.
      v_new_net := 0;
    ELSIF v_request_amount > 0 THEN
      -- Genuine transfer: net_payout is the amount actually paid. Keep it.
      v_new_net := ROUND(COALESCE(r.net_payout, 0), 2);
    ELSE
      v_new_net := ROUND(GREATEST(0, COALESCE(r.net_payout, 0) - v_applied), 2);
    END IF;

    CONTINUE WHEN v_applied = 0
      AND v_new_net = ROUND(COALESCE(r.net_payout, 0), 2)
      AND COALESCE(r.withdrawal_reversal_credits, 0) = ROUND(v_reversal, 2);

    UPDATE public.merchant_payout_summaries s
    SET other_credits = v_new_other,
        withdrawal_reversal_credits = ROUND(v_reversal, 2),
        estimated_payout = v_new_estimated,
        net_payout = v_new_net,
        payout_request_id = COALESCE(s.payout_request_id, r.payout_request_id),
        updated_at = NOW(),
        metadata = COALESCE(s.metadata, '{}'::jsonb)
          || jsonb_build_object(
               'repair_0481',
               jsonb_build_object(
                 'applied_at', NOW(),
                 'reason', 'withdrawal reversal credits are returned principal, not payout earnings',
                 'ledger_reversal_credits', ROUND(v_reversal, 2),
                 'removed_from_payout_value', v_applied,
                 'previous', jsonb_build_object(
                   'net_payout', COALESCE(s.net_payout, 0),
                   'estimated_payout', COALESCE(s.estimated_payout, 0),
                   'other_credits', COALESCE(s.other_credits, 0)
                 ),
                 'previous_snapshot', COALESCE(s.metadata->'snapshot', 'null'::jsonb)
               )
             )
          || CASE
               WHEN s.metadata ? 'snapshot' THEN jsonb_build_object(
                 'snapshot',
                 s.metadata->'snapshot'
                   || jsonb_build_object(
                        'other_credits', v_new_other,
                        'withdrawal_reversal_credits', ROUND(v_reversal, 2),
                        'estimated_payout', v_new_estimated,
                        'net_payout', v_new_net
                      )
               )
               ELSE '{}'::jsonb
             END
    WHERE s.id = r.id;

    v_repaired := v_repaired + 1;
  END LOOP;

  RAISE NOTICE '0481 payout snapshot repair: % row(s) corrected', v_repaired;
END $$;

GRANT EXECUTE ON FUNCTION public.compute_merchant_payout_cycle_snapshot TO service_role;
GRANT EXECUTE ON FUNCTION public.close_and_open_merchant_payout_cycle TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_reject_merchant_payout TO service_role;
GRANT EXECUTE ON FUNCTION public.merchant_wallet_fail_withdrawal TO service_role;
