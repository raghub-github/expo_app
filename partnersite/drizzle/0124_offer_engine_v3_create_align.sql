-- ============================================================================
-- OFFER ENGINE V3 repair / align — Partner Site Create Offer
-- Migration: 0124_offer_engine_v3_create_align (mirrors backend 0400)
-- ============================================================================

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
  ADD COLUMN IF NOT EXISTS usage_reset_period TEXT NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_by_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS disabled_reason TEXT NULL;

ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS offer_pricing_cache_version BIGINT NOT NULL DEFAULT 1;

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

ALTER TABLE public.merchant_offers
  DROP CONSTRAINT IF EXISTS merchant_offers_lifecycle_status_check;

ALTER TABLE public.merchant_offers
  ADD CONSTRAINT merchant_offers_lifecycle_status_check
  CHECK (lifecycle_status IN ('DRAFT', 'SCHEDULED', 'ACTIVE', 'DISABLED', 'EXPIRED'));

ALTER TABLE public.merchant_offer_applicability
  ADD COLUMN IF NOT EXISTS applies_to_variants BOOLEAN DEFAULT FALSE;

ALTER TABLE public.merchant_offer_applicability
  DROP CONSTRAINT IF EXISTS check_item_or_category;

ALTER TABLE public.merchant_offer_applicability
  DROP CONSTRAINT IF EXISTS check_applicability_scope;

ALTER TABLE public.merchant_offer_applicability
  ADD CONSTRAINT check_applicability_scope CHECK (
    (menu_item_id IS NOT NULL AND category_id IS NULL) OR
    (menu_item_id IS NULL AND category_id IS NOT NULL) OR
    (menu_item_id IS NULL AND category_id IS NULL AND applicability_type IN ('ALL', 'CART', 'DELIVERY', 'SPECIFIC_ITEMS_SET', 'CATEGORY'))
  );

CREATE OR REPLACE FUNCTION public.sync_offer_applicability_from_metadata(p_offer_id BIGINT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_meta JSONB;
  v_store_id BIGINT;
  v_item_id TEXT;
  v_cat_id BIGINT;
  v_ids JSONB;
  v_cats JSONB;
  v_menu_pk BIGINT;
BEGIN
  SELECT offer_metadata, store_id INTO v_meta, v_store_id
  FROM public.merchant_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM public.merchant_offer_applicability WHERE offer_id = p_offer_id;

  v_ids := COALESCE(v_meta->'menu_item_ids', v_meta->'menuItemIds');
  IF jsonb_typeof(v_ids) = 'array' AND jsonb_array_length(v_ids) > 0 THEN
    FOR v_item_id IN SELECT jsonb_array_elements_text(v_ids)
    LOOP
      SELECT m.id INTO v_menu_pk
      FROM public.merchant_menu_items m
      WHERE m.store_id = v_store_id
        AND (m.id::text = trim(v_item_id) OR m.item_id = trim(v_item_id))
      LIMIT 1;

      IF v_menu_pk IS NOT NULL THEN
        INSERT INTO public.merchant_offer_applicability (offer_id, menu_item_id, applicability_type)
        VALUES (p_offer_id, v_menu_pk, 'SPECIFIC_ITEMS_SET');
      END IF;
    END LOOP;
  END IF;

  v_cats := v_meta->'category_ids';
  IF jsonb_typeof(v_cats) = 'array' AND jsonb_array_length(v_cats) > 0 THEN
    FOR v_cat_id IN SELECT (jsonb_array_elements_text(v_cats))::bigint
    LOOP
      INSERT INTO public.merchant_offer_applicability (offer_id, category_id, applicability_type)
      VALUES (p_offer_id, v_cat_id, 'CATEGORY');
    END LOOP;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_merchant_offers_v3_runtime_lookup
  ON public.merchant_offers (store_id, lifecycle_status, is_active, valid_from, valid_till, priority DESC, display_priority DESC)
  WHERE lifecycle_status IN ('ACTIVE', 'SCHEDULED');

CREATE INDEX IF NOT EXISTS idx_merchant_offers_v3_draft
  ON public.merchant_offers (store_id, lifecycle_status)
  WHERE lifecycle_status = 'DRAFT';
