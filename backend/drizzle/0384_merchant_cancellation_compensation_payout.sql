-- Cancellation compensation → order_settlement_breakdown for merchant net payout on cancelled orders.
-- Syncs merchant_keeps_amount from merchant_wallet_ledger (compensation credit / info rows).

ALTER TABLE public.order_settlement_breakdown
  ADD COLUMN IF NOT EXISTS cancellation_compensation NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compensation_scenario TEXT,
  ADD COLUMN IF NOT EXISTS compensation_pct NUMERIC(5, 2);

COMMENT ON COLUMN public.order_settlement_breakdown.cancellation_compensation IS
  'Merchant net payout on cancellation per gm_merchant_compensation engine (merchant_keeps_amount).';
COMMENT ON COLUMN public.order_settlement_breakdown.compensation_scenario IS
  'gm_merchant_compensation scenario or exclusion code applied to this cancelled order.';
COMMENT ON COLUMN public.order_settlement_breakdown.compensation_pct IS
  'Compensation % merchant keeps (policy tier) for this cancelled order.';

CREATE OR REPLACE FUNCTION public.sync_order_settlement_cancellation_compensation(p_order_core_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_food_id BIGINT;
  v_ledger RECORD;
  v_keeps NUMERIC(12, 2);
  v_pct NUMERIC(5, 2);
  v_scenario TEXT;
  v_item NUMERIC(12, 2);
  v_packaging NUMERIC(12, 2);
  v_gross NUMERIC(12, 2);
  v_status TEXT;
  v_wallet_id BIGINT;
  v_debit NUMERIC(12, 2);
BEGIN
  IF p_order_core_id IS NULL OR p_order_core_id <= 0 THEN
    RETURN;
  END IF;

  SELECT f.id INTO v_food_id
  FROM public.orders_food f
  WHERE f.order_id = p_order_core_id
  LIMIT 1;

  IF v_food_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    l.id,
    l.wallet_id,
    l.amount,
    l.direction,
    l.metadata
  INTO v_ledger
  FROM public.merchant_wallet_ledger l
  WHERE l.reference_type = 'ORDER'::wallet_reference_type
    AND l.reference_id = v_food_id
    AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
  ORDER BY
    CASE
      WHEN l.direction = 'CREDIT'
        AND COALESCE(l.metadata->>'balance_impact', '') = 'credit' THEN 0
      WHEN COALESCE(l.metadata->>'balance_impact', '') = 'debit' THEN 1
      ELSE 2
    END,
    l.created_at DESC,
    l.id DESC
  LIMIT 1;

  IF v_ledger IS NULL THEN
    RETURN;
  END IF;

  v_keeps := COALESCE(
    NULLIF((v_ledger.metadata->>'merchant_keeps_amount')::numeric, 0),
    CASE
      WHEN v_ledger.direction = 'CREDIT'
        AND COALESCE(v_ledger.metadata->>'balance_impact', '') = 'credit'
      THEN v_ledger.amount
      ELSE 0
    END,
    0
  );

  v_pct := NULLIF((v_ledger.metadata->>'compensation_pct')::numeric, 0);
  v_scenario := COALESCE(
    NULLIF(TRIM(v_ledger.metadata->>'compensation_scenario'), ''),
    NULLIF(TRIM(v_ledger.metadata->>'compensation_exclusion'), '')
  );
  v_wallet_id := v_ledger.wallet_id;

  SELECT COALESCE(
    NULLIF(UPPER(TRIM(v_ledger.metadata->>'fulfillment_status')), ''),
    NULLIF(UPPER(TRIM(v_ledger.metadata->>'order_status')), ''),
    NULLIF(UPPER(TRIM(f.order_status)), ''),
    'REJECTED'
  )
  INTO v_status
  FROM public.orders_food f
  WHERE f.id = v_food_id;

  SELECT
    COALESCE(NULLIF(osb.item_total, 0), NULLIF(c.item_total, 0), 0),
    COALESCE(
      NULLIF(osb.packaging_charge, 0),
      NULLIF((c.billing_snapshot->>'packaging_charge')::numeric, 0),
      NULLIF((c.billing_snapshot->>'packaging_charges')::numeric, 0),
      0
    ),
    COALESCE(
      NULLIF(osb.merchant_gross, 0),
      NULLIF(c.total_ctm, 0),
      NULLIF(f.food_items_total_value, 0),
      NULLIF(c.item_total, 0),
      0
    )
  INTO v_item, v_packaging, v_gross
  FROM public.orders_core c
  LEFT JOIN public.orders_food f ON f.order_id = c.id
  LEFT JOIN public.order_settlement_breakdown osb ON osb.order_id = c.id
  WHERE c.id = p_order_core_id
  LIMIT 1;

  IF v_gross <= 0 AND (v_item + v_packaging) > 0 THEN
    v_gross := v_item + v_packaging;
  END IF;

  SELECT COALESCE(SUM(l.amount), 0)
  INTO v_debit
  FROM public.merchant_wallet_ledger l
  WHERE l.reference_type = 'ORDER'::wallet_reference_type
    AND l.reference_id = v_food_id
    AND l.direction = 'DEBIT'
    AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
    AND COALESCE(l.metadata->>'balance_impact', '') = 'debit';

  INSERT INTO public.order_settlement_breakdown (
    order_id,
    item_total,
    packaging_charge,
    merchant_gross,
    merchant_net,
    cancellation_compensation,
    compensation_scenario,
    compensation_pct,
    fulfillment_status,
    customer_compensation,
    cancellation_refund,
    wallet_id,
    ledger_id,
    updated_at
  )
  VALUES (
    p_order_core_id,
    v_item,
    v_packaging,
    v_gross,
    GREATEST(v_keeps, 0),
    GREATEST(v_keeps, 0),
    v_scenario,
    v_pct,
    v_status,
    GREATEST(v_debit, 0),
    GREATEST(v_debit, 0),
    v_wallet_id,
    v_ledger.id,
    NOW()
  )
  ON CONFLICT (order_id) DO UPDATE SET
    cancellation_compensation = GREATEST(EXCLUDED.cancellation_compensation, 0),
    compensation_scenario = COALESCE(EXCLUDED.compensation_scenario, order_settlement_breakdown.compensation_scenario),
    compensation_pct = COALESCE(EXCLUDED.compensation_pct, order_settlement_breakdown.compensation_pct),
    fulfillment_status = COALESCE(EXCLUDED.fulfillment_status, order_settlement_breakdown.fulfillment_status),
    merchant_net = CASE
      WHEN UPPER(COALESCE(EXCLUDED.fulfillment_status, order_settlement_breakdown.fulfillment_status, ''))
        IN ('REJECTED', 'CANCELLED', 'RTO')
      THEN GREATEST(EXCLUDED.cancellation_compensation, 0)
      ELSE GREATEST(
        COALESCE(order_settlement_breakdown.merchant_net, 0),
        EXCLUDED.merchant_net
      )
    END,
    customer_compensation = GREATEST(
      COALESCE(order_settlement_breakdown.customer_compensation, 0),
      EXCLUDED.customer_compensation
    ),
    cancellation_refund = GREATEST(
      COALESCE(order_settlement_breakdown.cancellation_refund, 0),
      EXCLUDED.cancellation_refund
    ),
    item_total = CASE
      WHEN COALESCE(order_settlement_breakdown.item_total, 0) > 0
      THEN order_settlement_breakdown.item_total
      ELSE EXCLUDED.item_total
    END,
    packaging_charge = CASE
      WHEN COALESCE(order_settlement_breakdown.packaging_charge, 0) > 0
      THEN order_settlement_breakdown.packaging_charge
      ELSE EXCLUDED.packaging_charge
    END,
    merchant_gross = CASE
      WHEN COALESCE(order_settlement_breakdown.merchant_gross, 0) > 0
      THEN order_settlement_breakdown.merchant_gross
      ELSE EXCLUDED.merchant_gross
    END,
    wallet_id = COALESCE(EXCLUDED.wallet_id, order_settlement_breakdown.wallet_id),
    ledger_id = COALESCE(EXCLUDED.ledger_id, order_settlement_breakdown.ledger_id),
    updated_at = NOW();
END;
$$;

COMMENT ON FUNCTION public.sync_order_settlement_cancellation_compensation(BIGINT) IS
  'Upserts order_settlement_breakdown.cancellation_compensation from latest cancellation ledger row.';

-- Backfill from existing cancellation ledger rows
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT
      COALESCE(
        NULLIF((l.metadata->>'orders_core_id')::bigint, 0),
        f.order_id
      ) AS order_core_id
    FROM public.merchant_wallet_ledger l
    LEFT JOIN public.orders_food f ON f.id = l.reference_id
    WHERE l.reference_type = 'ORDER'::wallet_reference_type
      AND COALESCE(l.metadata->>'entry_type', '') = 'order_cancellation'
      AND COALESCE(
        NULLIF((l.metadata->>'orders_core_id')::bigint, 0),
        f.order_id
      ) IS NOT NULL
  LOOP
    PERFORM public.sync_order_settlement_cancellation_compensation(r.order_core_id);
  END LOOP;
END;
$$;
