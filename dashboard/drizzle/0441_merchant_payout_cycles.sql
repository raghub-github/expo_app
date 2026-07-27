-- ============================================================================
-- Merchant payout cycles: advance on SUCCESS / REJECTED / FAILED withdrawals.
-- Locked settlement snapshots; one OPEN cycle per wallet.
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_payout_cycle_status') THEN
    CREATE TYPE public.merchant_payout_cycle_status AS ENUM ('OPEN', 'CLOSED');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_payout_cycle_close_reason') THEN
    CREATE TYPE public.merchant_payout_cycle_close_reason AS ENUM (
      'WITHDRAWAL_COMPLETED',
      'WITHDRAWAL_REJECTED',
      'WITHDRAWAL_FAILED'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'merchant_payout_summary_status') THEN
    CREATE TYPE public.merchant_payout_summary_status AS ENUM ('DRAFT', 'LOCKED');
  END IF;
END $$;

-- Cycles table
CREATE TABLE IF NOT EXISTS public.merchant_payout_cycles (
  id BIGSERIAL PRIMARY KEY,
  wallet_id BIGINT NOT NULL REFERENCES public.merchant_wallet(id) ON DELETE CASCADE,
  merchant_store_id BIGINT NOT NULL REFERENCES public.merchant_stores(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ,
  status public.merchant_payout_cycle_status NOT NULL DEFAULT 'OPEN',
  close_reason public.merchant_payout_cycle_close_reason,
  payout_request_id BIGINT REFERENCES public.merchant_payout_requests(id) ON DELETE SET NULL,
  withdrawal_ledger_id BIGINT REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL,
  reversal_ledger_id BIGINT REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL,
  summary_id BIGINT,
  locked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_payout_cycles_period_check CHECK (
    period_end IS NULL OR period_end >= period_start
  ),
  CONSTRAINT merchant_payout_cycles_closed_fields CHECK (
    (status = 'OPEN' AND period_end IS NULL AND close_reason IS NULL AND locked_at IS NULL)
    OR (status = 'CLOSED' AND period_end IS NOT NULL AND close_reason IS NOT NULL AND locked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS merchant_payout_cycles_one_open_per_wallet
  ON public.merchant_payout_cycles(wallet_id)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS merchant_payout_cycles_wallet_period_idx
  ON public.merchant_payout_cycles(wallet_id, period_start DESC);

CREATE INDEX IF NOT EXISTS merchant_payout_cycles_store_idx
  ON public.merchant_payout_cycles(merchant_store_id, period_start DESC);

CREATE INDEX IF NOT EXISTS merchant_payout_cycles_payout_request_idx
  ON public.merchant_payout_cycles(payout_request_id)
  WHERE payout_request_id IS NOT NULL;

-- Extend summaries for locked snapshots
ALTER TABLE public.merchant_payout_summaries
  ADD COLUMN IF NOT EXISTS cycle_id BIGINT,
  ADD COLUMN IF NOT EXISTS payout_request_id BIGINT,
  ADD COLUMN IF NOT EXISTS close_reason public.merchant_payout_cycle_close_reason,
  ADD COLUMN IF NOT EXISTS status public.merchant_payout_summary_status NOT NULL DEFAULT 'LOCKED',
  ADD COLUMN IF NOT EXISTS net_order_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS restaurant_discounts NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_deductions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancellation_compensation NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_credits NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalties NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_adjustments NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_debit_adjustments NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chargebacks NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_payout NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_offer_discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS percentage_flat_offer_discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS combo_offer_discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_delivery_offer_discount NUMERIC(14, 2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_payout_summaries_cycle_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_payout_summaries
      ADD CONSTRAINT merchant_payout_summaries_cycle_id_fkey
      FOREIGN KEY (cycle_id) REFERENCES public.merchant_payout_cycles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_payout_cycles_summary_id_fkey'
  ) THEN
    ALTER TABLE public.merchant_payout_cycles
      ADD CONSTRAINT merchant_payout_cycles_summary_id_fkey
      FOREIGN KEY (summary_id) REFERENCES public.merchant_payout_summaries(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS merchant_payout_summaries_cycle_id_unique
  ON public.merchant_payout_summaries(cycle_id)
  WHERE cycle_id IS NOT NULL;

-- Immutable once LOCKED
CREATE OR REPLACE FUNCTION public.merchant_payout_summaries_prevent_locked_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'LOCKED'::public.merchant_payout_summary_status THEN
      RAISE EXCEPTION 'merchant_payout_summaries row % is LOCKED and cannot be deleted', OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'LOCKED'::public.merchant_payout_summary_status THEN
    RAISE EXCEPTION 'merchant_payout_summaries row % is LOCKED and cannot be updated', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merchant_payout_summaries_locked ON public.merchant_payout_summaries;
CREATE TRIGGER trg_merchant_payout_summaries_locked
  BEFORE UPDATE OR DELETE ON public.merchant_payout_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.merchant_payout_summaries_prevent_locked_mutation();

-- ---------------------------------------------------------------------------
-- Snapshot amounts from ledger for [period_start, period_end)
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
    COALESCE(SUM(l.amount) FILTER (
      WHERE l.direction = 'CREDIT'
        AND l.category::text IN (
          'FAILED_WITHDRAWAL_REVERSAL',
          'WITHDRAWAL_REVERSAL',
          'MANUAL_CREDIT',
          'ADJUSTMENT_CREDIT',
          'GST_CREDIT',
          'PENALTY_REVERSAL'
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
    'estimated_payout', v_estimated,
    'delivered_orders', v_delivered,
    'rejected_orders', v_rejected,
    'net_payout', v_estimated
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_open_merchant_payout_cycle(
  p_wallet_id BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cycle_id BIGINT;
  v_store_id BIGINT;
  v_start TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_cycle_id
  FROM public.merchant_payout_cycles
  WHERE wallet_id = p_wallet_id AND status = 'OPEN'
  LIMIT 1;

  IF v_cycle_id IS NOT NULL THEN
    RETURN v_cycle_id;
  END IF;

  SELECT merchant_store_id INTO v_store_id
  FROM public.merchant_wallet
  WHERE id = p_wallet_id;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'merchant wallet not found: %', p_wallet_id;
  END IF;

  -- Start after last closed cycle, else wallet creation / earliest ledger
  SELECT period_end INTO v_start
  FROM public.merchant_payout_cycles
  WHERE wallet_id = p_wallet_id AND status = 'CLOSED'
  ORDER BY period_end DESC NULLS LAST
  LIMIT 1;

  IF v_start IS NULL THEN
    SELECT COALESCE(MIN(created_at), NOW()) INTO v_start
    FROM public.merchant_wallet_ledger
    WHERE wallet_id = p_wallet_id;
  END IF;

  INSERT INTO public.merchant_payout_cycles (
    wallet_id, merchant_store_id, period_start, status
  ) VALUES (
    p_wallet_id, v_store_id, v_start, 'OPEN'
  )
  RETURNING id INTO v_cycle_id;

  RETURN v_cycle_id;
END;
$$;

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
-- Wire into complete / reject / fail
-- ---------------------------------------------------------------------------

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
  v_close_at TIMESTAMPTZ;
BEGIN
  SELECT wallet_id, amount, status INTO v_wallet_id, v_amount, v_status
  FROM public.merchant_payout_requests
  WHERE id = p_payout_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payout request not found: %', p_payout_request_id;
  END IF;

  IF v_status NOT IN ('APPROVED', 'PROCESSING') THEN
    RAISE EXCEPTION 'cannot complete payout in status: %', v_status;
  END IF;

  PERFORM public.ensure_open_merchant_payout_cycle(v_wallet_id);

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

  SELECT created_at INTO v_close_at
  FROM public.merchant_wallet_ledger
  WHERE id = v_ledger_id;

  PERFORM public.close_and_open_merchant_payout_cycle(
    v_wallet_id,
    'WITHDRAWAL_COMPLETED'::public.merchant_payout_cycle_close_reason,
    p_payout_request_id,
    v_ledger_id,
    NULL,
    COALESCE(v_close_at, clock_timestamp())
  );
END;
$$;

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
  'Super admin reject: close payout cycle, release hold to AVAILABLE in new cycle, mark CANCELLED.';

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

  v_close_at := clock_timestamp();
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
  'Bank transfer fail: close cycle, release HOLD to AVAILABLE in new cycle, mark FAILED.';

-- ---------------------------------------------------------------------------
-- Backfill cycles from historical WITHDRAWAL ledger + rejected/failed requests
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  w RECORD;
  b RECORD;
  v_start TIMESTAMPTZ;
  v_end TIMESTAMPTZ;
  v_reason public.merchant_payout_cycle_close_reason;
  v_cycle_id BIGINT;
  v_snap JSONB;
  v_summary_id BIGINT;
  v_boundaries TIMESTAMPTZ[];
  v_i INT;
BEGIN
  FOR w IN SELECT id AS wallet_id, merchant_store_id, created_at FROM public.merchant_wallet LOOP
    -- Skip if cycles already exist for this wallet
    IF EXISTS (SELECT 1 FROM public.merchant_payout_cycles WHERE wallet_id = w.wallet_id) THEN
      CONTINUE;
    END IF;

    v_boundaries := ARRAY[]::TIMESTAMPTZ[];

    FOR b IN
      SELECT created_at AS boundary_at
      FROM public.merchant_wallet_ledger
      WHERE wallet_id = w.wallet_id AND category = 'WITHDRAWAL' AND direction = 'DEBIT'
      ORDER BY created_at ASC
    LOOP
      v_boundaries := array_append(v_boundaries, b.boundary_at);
    END LOOP;

    FOR b IN
      SELECT COALESCE(l.created_at, pr.updated_at, pr.created_at) AS boundary_at
      FROM public.merchant_payout_requests pr
      LEFT JOIN public.merchant_wallet_ledger l
        ON l.wallet_id = pr.wallet_id
       AND l.reference_id = pr.id
       AND l.category = 'FAILED_WITHDRAWAL_REVERSAL'
       AND l.direction = 'CREDIT'
      WHERE pr.wallet_id = w.wallet_id
        AND pr.status IN ('CANCELLED', 'FAILED')
      ORDER BY 1 ASC
    LOOP
      IF b.boundary_at IS NOT NULL THEN
        v_boundaries := array_append(v_boundaries, b.boundary_at);
      END IF;
    END LOOP;

    -- Sort unique-ish by inserting chronologically via nested loop
    v_start := w.created_at;

    IF array_length(v_boundaries, 1) IS NULL THEN
      INSERT INTO public.merchant_payout_cycles (
        wallet_id, merchant_store_id, period_start, status
      ) VALUES (w.wallet_id, w.merchant_store_id, v_start, 'OPEN');
      CONTINUE;
    END IF;

    -- Process boundaries in time order using a temp approach
    FOR b IN
      SELECT DISTINCT x AS boundary_at
      FROM unnest(v_boundaries) AS x
      ORDER BY 1 ASC
    LOOP
      v_end := b.boundary_at;
      IF v_end <= v_start THEN
        CONTINUE;
      END IF;

      -- Prefer COMPLETED if WITHDRAWAL exists at boundary
      IF EXISTS (
        SELECT 1 FROM public.merchant_wallet_ledger
        WHERE wallet_id = w.wallet_id
          AND category = 'WITHDRAWAL'
          AND direction = 'DEBIT'
          AND created_at = v_end
      ) THEN
        v_reason := 'WITHDRAWAL_COMPLETED';
      ELSIF EXISTS (
        SELECT 1 FROM public.merchant_payout_requests
        WHERE wallet_id = w.wallet_id AND status = 'FAILED'
          AND COALESCE(updated_at, created_at) = v_end
      ) THEN
        v_reason := 'WITHDRAWAL_FAILED';
      ELSE
        v_reason := 'WITHDRAWAL_REJECTED';
      END IF;

      v_snap := public.compute_merchant_payout_cycle_snapshot(w.wallet_id, v_start, v_end);

      INSERT INTO public.merchant_payout_cycles (
        wallet_id, merchant_store_id, period_start, period_end,
        status, close_reason, locked_at
      ) VALUES (
        w.wallet_id, w.merchant_store_id, v_start, v_end,
        'CLOSED', v_reason, v_end
      )
      RETURNING id INTO v_cycle_id;

      INSERT INTO public.merchant_payout_summaries (
        wallet_id, period_start, period_end, payout_date, net_payout,
        item_subtotal, packaging_charges, promo_discount, other_restaurant_discount,
        delivery_charge_discount, payment_mechanism_fee, customer_compensation,
        delivered_orders, rejected_orders, metadata, cycle_id, close_reason, status,
        net_order_value, restaurant_discounts, order_deductions, cancellation_compensation,
        other_credits, penalties, refund_adjustments, manual_debit_adjustments, chargebacks,
        estimated_payout, coupon_offer_discount, percentage_flat_offer_discount,
        combo_offer_discount, free_delivery_offer_discount
      ) VALUES (
        w.wallet_id, v_start, v_end, v_end,
        COALESCE((v_snap->>'net_payout')::numeric, 0),
        COALESCE((v_snap->>'item_subtotal')::numeric, 0),
        COALESCE((v_snap->>'packaging_charges')::numeric, 0),
        COALESCE((v_snap->>'coupon_offer_discount')::numeric, 0),
        COALESCE((v_snap->>'percentage_flat_offer_discount')::numeric, 0),
        COALESCE((v_snap->>'free_delivery_offer_discount')::numeric, 0),
        COALESCE((v_snap->>'mechanism_fee')::numeric, 0),
        0,
        COALESCE((v_snap->>'delivered_orders')::int, 0),
        COALESCE((v_snap->>'rejected_orders')::int, 0),
        jsonb_build_object('snapshot', v_snap, 'backfill', true),
        v_cycle_id, v_reason, 'LOCKED',
        COALESCE((v_snap->>'net_order_value')::numeric, 0),
        COALESCE((v_snap->>'restaurant_discounts')::numeric, 0),
        COALESCE((v_snap->>'order_deductions')::numeric, 0),
        COALESCE((v_snap->>'cancellation_compensation')::numeric, 0),
        COALESCE((v_snap->>'other_credits')::numeric, 0),
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

      UPDATE public.merchant_payout_cycles SET summary_id = v_summary_id WHERE id = v_cycle_id;

      v_start := v_end;
    END LOOP;

    INSERT INTO public.merchant_payout_cycles (
      wallet_id, merchant_store_id, period_start, status
    ) VALUES (w.wallet_id, w.merchant_store_id, v_start, 'OPEN');
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.compute_merchant_payout_cycle_snapshot TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_open_merchant_payout_cycle TO service_role;
GRANT EXECUTE ON FUNCTION public.close_and_open_merchant_payout_cycle TO service_role;
GRANT EXECUTE ON FUNCTION public.merchant_wallet_complete_withdrawal TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_reject_merchant_payout TO service_role;
GRANT EXECUTE ON FUNCTION public.merchant_wallet_fail_withdrawal TO service_role;
