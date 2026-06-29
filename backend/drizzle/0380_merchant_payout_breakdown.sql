-- Merchant payout breakdown: per-order settlement fields + payout period snapshots + ledger metadata.

-- 1) Per-order breakdown columns (merchant app payout summary A/B/C)
ALTER TABLE public.order_settlement_breakdown
  ADD COLUMN IF NOT EXISTS promo_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_restaurant_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_charge_discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_mechanism_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_compensation NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT;

COMMENT ON COLUMN public.order_settlement_breakdown.promo_discount IS
  'Restaurant promo / coupon discount funded by merchant (payout section B).';
COMMENT ON COLUMN public.order_settlement_breakdown.payment_mechanism_fee IS
  'Payment mechanism / PG fee deducted from merchant (payout section C).';

UPDATE public.order_settlement_breakdown
SET
  promo_discount = COALESCE(NULLIF(promo_discount, 0), coupon_discount, 0),
  other_restaurant_discount = COALESCE(NULLIF(other_restaurant_discount, 0), merchant_funded_discount, 0),
  delivery_charge_discount = COALESCE(NULLIF(delivery_charge_discount, 0), delivery_fee, 0),
  payment_mechanism_fee = COALESCE(NULLIF(payment_mechanism_fee, 0), commission_amount, 0),
  fulfillment_status = COALESCE(fulfillment_status, 'DELIVERED')
WHERE TRUE;

-- 2) Payout period snapshot (one row per completed withdrawal)
CREATE TABLE IF NOT EXISTS public.merchant_payout_summaries (
  id BIGSERIAL PRIMARY KEY,
  wallet_id BIGINT NOT NULL REFERENCES public.merchant_wallet(id) ON DELETE CASCADE,
  withdrawal_ledger_id BIGINT REFERENCES public.merchant_wallet_ledger(id) ON DELETE SET NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  payout_date TIMESTAMPTZ,
  net_payout NUMERIC(14, 2) NOT NULL DEFAULT 0,
  item_subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  packaging_charges NUMERIC(14, 2) NOT NULL DEFAULT 0,
  promo_discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  other_restaurant_discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  delivery_charge_discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  payment_mechanism_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  customer_compensation NUMERIC(14, 2) NOT NULL DEFAULT 0,
  delivered_orders INTEGER NOT NULL DEFAULT 0,
  rejected_orders INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT merchant_payout_summaries_withdrawal_ledger_unique UNIQUE (withdrawal_ledger_id)
);

CREATE INDEX IF NOT EXISTS merchant_payout_summaries_wallet_id_idx
  ON public.merchant_payout_summaries(wallet_id, payout_date DESC);

COMMENT ON TABLE public.merchant_payout_summaries IS
  'Cached payout-period breakdown for merchant app (Summary tab).';

-- 3) Store payout breakdown on ORDER_EARNING ledger metadata at settlement time
CREATE OR REPLACE FUNCTION public.payment_process_delivered_settlement(
  p_order_id BIGINT,
  p_orders_food_id BIGINT,
  p_merchant_store_id BIGINT,
  p_merchant_gross NUMERIC,
  p_packaging NUMERIC DEFAULT 0,
  p_surge NUMERIC DEFAULT 0,
  p_tips NUMERIC DEFAULT 0,
  p_actor_system_user_id BIGINT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule public.payment_settlement_rules;
  v_comm public.payment_commission_rules;
  v_tax_gst public.payment_tax_rules;
  v_tax_tds public.payment_tax_rules;
  v_wallet_id BIGINT;
  v_settlement_id BIGINT;
  v_key TEXT;
  v_merchant_net NUMERIC(14, 2);
  v_comm_amt NUMERIC(14, 2);
  v_gst NUMERIC(14, 2);
  v_tds NUMERIC(14, 2);
  v_ledger_id BIGINT;
  v_paused BOOLEAN;
  v_item_subtotal NUMERIC(14, 2);
  v_packaging NUMERIC(14, 2);
  v_promo_discount NUMERIC(14, 2);
  v_other_discount NUMERIC(14, 2);
  v_delivery_discount NUMERIC(14, 2);
  v_mechanism_fee NUMERIC(14, 2);
  v_customer_comp NUMERIC(14, 2);
  v_payout_meta JSONB;
BEGIN
  v_key := COALESCE(p_idempotency_key, 'settle:order:' || p_order_id::text);

  IF EXISTS (
    SELECT 1 FROM public.payment_order_settlements
    WHERE idempotency_key = v_key
  ) THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'idempotency_key', v_key);
  END IF;

  PERFORM public.merchant_wallet_assert_order_delivered_for_earning(
    COALESCE(p_orders_food_id, p_order_id)
  );

  v_wallet_id := public.get_or_create_merchant_wallet(p_merchant_store_id);

  SELECT settlement_paused INTO v_paused FROM public.merchant_wallet WHERE id = v_wallet_id;
  IF COALESCE(v_paused, FALSE) THEN
    RAISE EXCEPTION 'Settlement paused for wallet %', v_wallet_id;
  END IF;

  v_rule := public.payment_resolve_settlement_rule('FOOD');
  IF v_rule.id IS NULL THEN
    RAISE EXCEPTION 'No active payment_settlement_rules for DELIVERED';
  END IF;

  SELECT * INTO v_comm
  FROM public.payment_commission_rules c
  WHERE c.is_active = TRUE
    AND (c.merchant_store_id = p_merchant_store_id OR c.merchant_store_id IS NULL)
    AND c.effective_from <= NOW()
    AND (c.effective_to IS NULL OR c.effective_to > NOW())
  ORDER BY CASE WHEN c.merchant_store_id IS NOT NULL THEN 0 ELSE 1 END, c.id DESC
  LIMIT 1;

  v_comm_amt := public.payment_calc_amount(
    COALESCE(v_comm.calculation_mode, v_rule.platform_commission_mode),
    COALESCE(v_comm.commission_value, v_rule.platform_commission_value),
    p_merchant_gross + CASE WHEN v_rule.include_packaging THEN p_packaging ELSE 0 END
  );

  SELECT * INTO v_tax_gst FROM public.payment_tax_rules
  WHERE is_active AND tax_type = 'GST' AND party_type = 'MERCHANT' LIMIT 1;
  SELECT * INTO v_tax_tds FROM public.payment_tax_rules
  WHERE is_active AND tax_type = 'TDS' AND party_type = 'MERCHANT' LIMIT 1;

  v_gst := public.payment_calc_amount(
    COALESCE(v_tax_gst.calculation_mode, 'PERCENTAGE'::payment_calculation_mode),
    COALESCE(v_tax_gst.tax_value, 0),
    p_merchant_gross
  );
  v_tds := public.payment_calc_amount(
    COALESCE(v_tax_tds.calculation_mode, 'PERCENTAGE'::payment_calculation_mode),
    COALESCE(v_tax_tds.tax_value, 0),
    p_merchant_gross
  );

  v_merchant_net := public.payment_calc_amount(
    v_rule.merchant_share_mode, v_rule.merchant_share_value,
    p_merchant_gross + CASE WHEN v_rule.include_packaging THEN p_packaging ELSE 0 END
  ) - v_comm_amt - v_gst - v_tds;

  IF v_merchant_net < 0 THEN v_merchant_net := 0; END IF;

  SELECT
    COALESCE(NULLIF(osb.item_total, 0), GREATEST(p_merchant_gross - COALESCE(NULLIF(osb.packaging_charge, 0), p_packaging, 0), 0)),
    COALESCE(NULLIF(osb.packaging_charge, 0), p_packaging, 0),
    COALESCE(NULLIF(osb.promo_discount, 0), osb.coupon_discount, 0),
    COALESCE(NULLIF(osb.other_restaurant_discount, 0), osb.merchant_funded_discount, 0),
    COALESCE(NULLIF(osb.delivery_charge_discount, 0), osb.delivery_fee, 0),
    COALESCE(NULLIF(osb.payment_mechanism_fee, 0), v_comm_amt, 0),
    COALESCE(osb.customer_compensation, 0)
  INTO
    v_item_subtotal,
    v_packaging,
    v_promo_discount,
    v_other_discount,
    v_delivery_discount,
    v_mechanism_fee,
    v_customer_comp
  FROM public.order_settlement_breakdown osb
  WHERE osb.order_id = p_order_id;

  IF v_item_subtotal IS NULL THEN
    v_packaging := COALESCE(p_packaging, 0);
    v_item_subtotal := GREATEST(p_merchant_gross - v_packaging, 0);
    v_promo_discount := 0;
    v_other_discount := 0;
    v_delivery_discount := 0;
    v_mechanism_fee := COALESCE(v_comm_amt, 0);
    v_customer_comp := 0;
  END IF;

  v_payout_meta := jsonb_build_object(
    'settlement_id', NULL,
    'orders_core_id', p_order_id,
    'item_subtotal', v_item_subtotal,
    'item_total', v_item_subtotal,
    'packaging_charge', v_packaging,
    'packaging_charges', v_packaging,
    'merchant_gross', p_merchant_gross,
    'promo_discount', v_promo_discount,
    'restaurant_discount_promo', v_promo_discount,
    'other_restaurant_discount', v_other_discount,
    'merchant_funded_discount', v_other_discount,
    'delivery_charge_discount', v_delivery_discount,
    'payment_mechanism_fee', v_mechanism_fee,
    'mechanism_fee', v_mechanism_fee,
    'customer_compensation', v_customer_comp,
    'order_status', 'DELIVERED',
    'fulfillment_status', 'DELIVERED'
  );

  INSERT INTO public.payment_order_settlements (
    order_id, orders_food_id, wallet_id, settlement_rule_id,
    lifecycle_status, merchant_net, platform_commission, gst_amount, tds_amount,
    packaging_amount, surge_amount, tips_amount, released_at, idempotency_key, metadata
  ) VALUES (
    p_order_id, p_orders_food_id, v_wallet_id, v_rule.id,
    'AVAILABLE', v_merchant_net, v_comm_amt, v_gst, v_tds,
    p_packaging, p_surge, p_tips, NOW(), v_key,
    jsonb_build_object('rule_code', v_rule.rule_code, 'direct_wallet_credit', true)
  )
  RETURNING id INTO v_settlement_id;

  v_payout_meta := v_payout_meta || jsonb_build_object('settlement_id', v_settlement_id);

  v_ledger_id := public.merchant_wallet_credit(
    v_wallet_id, v_merchant_net, 'ORDER_EARNING'::wallet_transaction_category,
    'AVAILABLE'::wallet_balance_type, 'ORDER'::wallet_reference_type,
    COALESCE(p_orders_food_id, p_order_id),
    v_key || ':credit',
    'Order delivered', v_payout_meta
  );

  UPDATE public.payment_order_settlements
  SET credit_ledger_id = v_ledger_id, lifecycle_status = 'AVAILABLE', updated_at = NOW()
  WHERE id = v_settlement_id;

  UPDATE public.order_settlement_breakdown
  SET
    merchant_net = v_merchant_net,
    commission_amount = v_comm_amt,
    tds_amount = v_tds,
    gst_amount = v_gst,
    promo_discount = v_promo_discount,
    other_restaurant_discount = v_other_discount,
    delivery_charge_discount = v_delivery_discount,
    payment_mechanism_fee = v_mechanism_fee,
    customer_compensation = v_customer_comp,
    fulfillment_status = 'DELIVERED',
    settled = TRUE,
    settled_at = NOW(),
    ledger_id = v_ledger_id,
    wallet_id = v_wallet_id,
    payment_settlement_id = v_settlement_id,
    settlement_rule_id = v_rule.id,
    updated_at = NOW()
  WHERE order_id = p_order_id;

  UPDATE public.merchant_wallet_ledger
  SET
    commission_amount = v_comm_amt,
    gst_amount = v_gst,
    tds_amount = v_tds
  WHERE id = v_ledger_id;

  PERFORM public.payment_audit_log(
    'RULE_UPDATED'::payment_audit_action,
    'payment_order_settlements', v_settlement_id, p_actor_system_user_id,
    NULL, jsonb_build_object('merchant_net', v_merchant_net, 'ledger_id', v_ledger_id)
  );

  RETURN jsonb_build_object(
    'ok', true, 'settlement_id', v_settlement_id,
    'ledger_id', v_ledger_id, 'merchant_net', v_merchant_net
  );
END;
$$;

-- 4) Backfill ORDER_EARNING ledger metadata from order_settlement_breakdown
UPDATE public.merchant_wallet_ledger l
SET metadata = COALESCE(l.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'item_subtotal', COALESCE(NULLIF(osb.item_total, 0), GREATEST(osb.merchant_gross - COALESCE(osb.packaging_charge, 0), 0)),
  'item_total', COALESCE(NULLIF(osb.item_total, 0), GREATEST(osb.merchant_gross - COALESCE(osb.packaging_charge, 0), 0)),
  'packaging_charge', COALESCE(osb.packaging_charge, 0),
  'packaging_charges', COALESCE(osb.packaging_charge, 0),
  'merchant_gross', COALESCE(osb.merchant_gross, 0),
  'promo_discount', COALESCE(NULLIF(osb.promo_discount, 0), osb.coupon_discount, 0),
  'restaurant_discount_promo', COALESCE(NULLIF(osb.promo_discount, 0), osb.coupon_discount, 0),
  'other_restaurant_discount', COALESCE(NULLIF(osb.other_restaurant_discount, 0), osb.merchant_funded_discount, 0),
  'merchant_funded_discount', COALESCE(NULLIF(osb.other_restaurant_discount, 0), osb.merchant_funded_discount, 0),
  'delivery_charge_discount', COALESCE(NULLIF(osb.delivery_charge_discount, 0), osb.delivery_fee, 0),
  'payment_mechanism_fee', COALESCE(NULLIF(osb.payment_mechanism_fee, 0), osb.commission_amount, 0),
  'mechanism_fee', COALESCE(NULLIF(osb.payment_mechanism_fee, 0), osb.commission_amount, 0),
  'customer_compensation', COALESCE(osb.customer_compensation, 0),
  'order_status', COALESCE(osb.fulfillment_status, 'DELIVERED'),
  'fulfillment_status', COALESCE(osb.fulfillment_status, 'DELIVERED')
))
FROM public.orders_food f
INNER JOIN public.order_settlement_breakdown osb ON osb.order_id = f.order_id
WHERE l.category = 'ORDER_EARNING'::wallet_transaction_category
  AND l.direction = 'CREDIT'
  AND l.reference_type = 'ORDER'::wallet_reference_type
  AND l.reference_id = f.id
  AND NOT COALESCE(l.metadata, '{}'::jsonb) ? 'item_subtotal';

UPDATE public.merchant_wallet_ledger l
SET
  commission_amount = COALESCE(l.commission_amount, osb.commission_amount),
  gst_amount = COALESCE(l.gst_amount, osb.gst_amount),
  tds_amount = COALESCE(l.tds_amount, osb.tds_amount)
FROM public.orders_food f
INNER JOIN public.order_settlement_breakdown osb ON osb.order_id = f.order_id
WHERE l.category = 'ORDER_EARNING'::wallet_transaction_category
  AND l.direction = 'CREDIT'
  AND l.reference_type = 'ORDER'::wallet_reference_type
  AND l.reference_id = f.id;
