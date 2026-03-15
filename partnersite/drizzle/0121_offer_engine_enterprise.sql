-- ============================================================================
-- ENTERPRISE OFFER ENGINE
-- Migration: 0121_offer_engine_enterprise
-- Adds: merchant_offers new columns, applicability extension, conditions,
--       usage tracking, offer type constraint, and evaluation index.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 — Upgrade merchant_offers
-- ----------------------------------------------------------------------------
ALTER TABLE public.merchant_offers
  ADD COLUMN IF NOT EXISTS coupon_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS auto_apply BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_stackable BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_order_limit INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_order_only BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS new_user_only BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS user_segment JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS max_discount_per_order NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS usage_reset_period TEXT NULL;

COMMENT ON COLUMN public.merchant_offers.coupon_code IS 'Optional coupon code; when set, offer applies only when code is entered.';
COMMENT ON COLUMN public.merchant_offers.auto_apply IS 'When true, offer can apply automatically; when false, requires coupon code.';
COMMENT ON COLUMN public.merchant_offers.is_stackable IS 'When true, this offer can be combined with other stackable offers.';
COMMENT ON COLUMN public.merchant_offers.priority IS 'Higher value = higher priority when resolving non-stackable offers.';
COMMENT ON COLUMN public.merchant_offers.per_order_limit IS 'Max times this offer can apply in a single order (e.g. 1 = once per order).';
COMMENT ON COLUMN public.merchant_offers.first_order_only IS 'When true, only applicable to user''s first order.';
COMMENT ON COLUMN public.merchant_offers.new_user_only IS 'When true, only for new users (segment).';
COMMENT ON COLUMN public.merchant_offers.user_segment IS 'JSON filter for user segments (e.g. tags, order count).';
COMMENT ON COLUMN public.merchant_offers.max_discount_per_order IS 'Cap on discount amount per order (e.g. for percentage offers).';
COMMENT ON COLUMN public.merchant_offers.usage_reset_period IS 'e.g. DAILY, WEEKLY, MONTHLY for per-user limit reset.';

-- ----------------------------------------------------------------------------
-- STEP 2 — Normalize offer types (allow legacy + new)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_offers_offer_type_check'
    AND conrelid = 'public.merchant_offers'::regclass
  ) THEN
    ALTER TABLE public.merchant_offers
    ADD CONSTRAINT merchant_offers_offer_type_check
    CHECK (offer_type IN (
      'PERCENTAGE', 'FLAT', 'BUY_X_GET_Y', 'BUY_N_GET_M',
      'FREE_ITEM', 'FREE_DELIVERY', 'CART_PERCENTAGE', 'CART_FLAT',
      'TIERED', 'BOGO', 'BUNDLE', 'COUPON'
    ));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- STEP 3 — Extend merchant_offer_applicability
-- ----------------------------------------------------------------------------
ALTER TABLE public.merchant_offer_applicability
  ADD COLUMN IF NOT EXISTS applies_to_variants BOOLEAN DEFAULT FALSE;

-- Drop old check and add extended one (ITEM, CATEGORY, ALL, CART, DELIVERY, SPECIFIC_ITEMS_SET)
ALTER TABLE public.merchant_offer_applicability
  DROP CONSTRAINT IF EXISTS check_item_or_category;

ALTER TABLE public.merchant_offer_applicability
  ADD CONSTRAINT check_applicability_scope CHECK (
    (menu_item_id IS NOT NULL AND category_id IS NULL) OR
    (menu_item_id IS NULL AND category_id IS NOT NULL) OR
    (menu_item_id IS NULL AND category_id IS NULL AND applicability_type IN ('ALL', 'CART', 'DELIVERY', 'SPECIFIC_ITEMS_SET'))
  );

COMMENT ON COLUMN public.merchant_offer_applicability.applies_to_variants IS 'When true, offer applies to item variants (e.g. size) as well.';

-- ----------------------------------------------------------------------------
-- STEP 4 — Create merchant_offer_conditions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_offer_conditions (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES public.merchant_offers(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL,
  condition_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_offer_conditions_offer_id_idx
  ON public.merchant_offer_conditions(offer_id);

COMMENT ON TABLE public.merchant_offer_conditions IS 'Dynamic conditions: MIN_CART_VALUE, MAX_CART_VALUE, MIN_ITEM_QUANTITY, USER_ORDER_COUNT, PAYMENT_METHOD, DELIVERY_TYPE, LOCATION, TIME_WINDOW, USER_TAG, ITEM_COMBINATION.';

-- ----------------------------------------------------------------------------
-- STEP 5 — Offer usage tracking (CRITICAL for limits)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_offer_usage (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES public.merchant_offers(id) ON DELETE CASCADE,
  user_id BIGINT,
  order_id BIGINT,
  used_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_usage_offer_user
  ON public.merchant_offer_usage(offer_id, user_id);

CREATE INDEX IF NOT EXISTS idx_offer_usage_offer_id
  ON public.merchant_offer_usage(offer_id);

COMMENT ON TABLE public.merchant_offer_usage IS 'Tracks offer redemptions for max_uses_total, max_uses_per_user, first_order_only.';

-- ----------------------------------------------------------------------------
-- STEP 6 — Performance: active offer lookup index
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_active_offer_lookup
  ON public.merchant_offers(store_id, is_active, valid_from, valid_till)
  WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- STEP 7 — Offer evaluation function (returns applicable offers + totals)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_offers(
  p_store_id BIGINT,
  p_user_id BIGINT,
  p_cart JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  r RECORD;
  cart_value NUMERIC := (p_cart->>'cart_total')::NUMERIC;
  result JSONB := '{"applied_offers": [], "total_discount": 0, "free_items": [], "delivery_discount": 0}'::JSONB;
  applied_ids BIGINT[] := '{}';
  acc_discount NUMERIC := 0;
  acc_delivery NUMERIC := 0;
  user_order_count INT := 0;
BEGIN
  -- Optional: get user order count for first_order_only / USER_ORDER_COUNT conditions
  IF p_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders_food') THEN
      SELECT COUNT(*) INTO user_order_count
      FROM public.orders_food o
      WHERE o.customer_id = p_user_id
        AND (o.status IS NULL OR o.status NOT IN ('cancelled', 'rejected'));
    END IF;
  END IF;

  FOR r IN
    SELECT o.id, o.offer_id, o.offer_title, o.offer_type, o.is_stackable, o.priority,
           o.discount_value, o.discount_percentage, o.max_discount_amount, o.max_discount_per_order,
           o.min_order_amount, o.first_order_only, o.per_order_limit,
           o.offer_metadata
    FROM public.merchant_offers o
    WHERE o.store_id = p_store_id
      AND o.is_active = TRUE
      AND o.valid_from <= NOW()
      AND o.valid_till >= NOW()
      AND (o.min_order_amount IS NULL OR cart_value >= o.min_order_amount)
      AND (o.first_order_only IS NOT TRUE OR user_order_count = 0)
    ORDER BY o.priority DESC NULLS LAST, o.id
  LOOP
    -- Non-stackable: stop after first match
    IF (SELECT NOT COALESCE(r.is_stackable, FALSE)) AND array_length(applied_ids, 1) > 0 THEN
      EXIT;
    END IF;

    applied_ids := applied_ids || r.id;
    result := jsonb_set(
      result,
      '{applied_offers}',
      (result->'applied_offers') || jsonb_build_object(
        'offer_id', r.offer_id, 'offer_title', r.offer_title, 'offer_type', r.offer_type,
        'discount_value', r.discount_value, 'discount_percentage', r.discount_percentage
      )
    );

    -- Simple discount accumulation (percentage/flat)
    IF r.offer_type IN ('PERCENTAGE', 'CART_PERCENTAGE') AND r.discount_percentage IS NOT NULL THEN
      acc_discount := acc_discount + LEAST(
        cart_value * (r.discount_percentage / 100),
        COALESCE(r.max_discount_per_order, r.max_discount_amount, 999999)
      );
    ELSIF r.offer_type IN ('FLAT', 'CART_FLAT', 'COUPON') AND r.discount_value IS NOT NULL THEN
      acc_discount := acc_discount + r.discount_value;
    ELSIF r.offer_type = 'FREE_DELIVERY' THEN
      acc_delivery := COALESCE((p_cart->>'delivery_fee')::NUMERIC, 0);
    END IF;
  END LOOP;

  result := jsonb_set(result, '{total_discount}', to_jsonb(acc_discount::TEXT::NUMERIC));
  result := jsonb_set(result, '{delivery_discount}', to_jsonb(acc_delivery::TEXT::NUMERIC));
  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.evaluate_offers IS 'Evaluates active offers for a store/user/cart. p_cart: { cart_total, delivery_fee }. Returns applied_offers, total_discount, free_items, delivery_discount.';
