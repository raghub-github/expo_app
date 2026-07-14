-- ============================================================================
-- 0407 — Merchant offers canonical (replaces 0399–0406)
--
-- Single migration for merchant offers. Do not re-apply old 0399–0406 files.
--
-- Scope: merchant-offer objects ONLY.
--
-- KEEP:
--   merchant_offers, merchant_offer_applicability, merchant_offer_usages,
--   offer_order_applications, merchant_stores.offer_pricing_cache_version,
--   sync_offer_applicability_from_metadata, bump_store_offer_pricing_cache_version,
--   sync_merchant_offer_lifecycle_batch
--
-- DROP (unused V3 scaffolding — never used by app code):
--   merchant_offer_conditions, merchant_offer_usage
--
-- Product:
--   Boost     → conditions_mode = 'boost'   (menu strike)
--   Precision → conditions_mode = 'precision' (checkout/sheet, whole menu)
--   BOGO      → offer_type BUY_X_GET_Y / BUY_N_GET_M / BOGO
--
-- Safe to re-run. Rollback: 0407_merchant_offers_canonical_cleanup_rollback.sql
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Drop unused merchant-offer tables
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.merchant_offer_conditions CASCADE;
DROP TABLE IF EXISTS public.merchant_offer_usage CASCADE;

-- ----------------------------------------------------------------------------
-- 2) Ensure merchant_offers columns (enterprise + lifecycle)
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
  ADD COLUMN IF NOT EXISTS usage_reset_period TEXT NULL,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS updated_by_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS disabled_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS offer_metadata JSONB DEFAULT '{}'::jsonb;

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

-- Schedule / active-hours columns (from former 0401)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_offers'
      AND column_name = 'applicable_time_start'
  ) THEN
    ALTER TABLE public.merchant_offers
      ADD COLUMN applicable_time_start TIME WITHOUT TIME ZONE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_offers'
      AND column_name = 'applicable_time_end'
  ) THEN
    ALTER TABLE public.merchant_offers
      ADD COLUMN applicable_time_end TIME WITHOUT TIME ZONE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'merchant_offers'
      AND column_name = 'applicable_on_days'
  ) THEN
    ALTER TABLE public.merchant_offers
      ADD COLUMN applicable_on_days TEXT[];
  END IF;
END $$;

UPDATE public.merchant_offers mo
SET applicable_time_start = (
  NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_start'), '')
)::time
WHERE mo.applicable_time_start IS NULL
  AND mo.offer_metadata IS NOT NULL
  AND NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_start'), '') IS NOT NULL
  AND NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_start'), '') ~ '^\d{1,2}:\d{2}';

UPDATE public.merchant_offers mo
SET applicable_time_end = (
  NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_end'), '')
)::time
WHERE mo.applicable_time_end IS NULL
  AND mo.offer_metadata IS NOT NULL
  AND NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_end'), '') IS NOT NULL
  AND NULLIF(BTRIM(mo.offer_metadata->>'applicable_time_end'), '') ~ '^\d{1,2}:\d{2}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'merchant_offers_valid_window_check'
  ) THEN
    ALTER TABLE public.merchant_offers
      ADD CONSTRAINT merchant_offers_valid_window_check
      CHECK (valid_till >= valid_from);
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'merchant_offers_valid_window_check not applied: %', SQLERRM;
END $$;

ALTER TABLE public.merchant_stores
  ADD COLUMN IF NOT EXISTS offer_pricing_cache_version BIGINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.merchant_stores.offer_pricing_cache_version IS
  'Incremented on offer create/update/delete; clients include in cache keys.';

COMMENT ON COLUMN public.merchant_offers.offer_metadata IS
  'JSON: conditions_mode (boost|precision), menu_item_ids[], category_ids[], time windows. Boost = menu strike; Precision = checkout/sheet only, whole menu.';

COMMENT ON COLUMN public.merchant_offers.lifecycle_status IS
  'V3 lifecycle: DRAFT | SCHEDULED | ACTIVE | DISABLED | EXPIRED.';

-- Backfill lifecycle for rows that never got published_at
UPDATE public.merchant_offers
SET lifecycle_status = CASE
  WHEN COALESCE(is_active, false) = false THEN 'DISABLED'
  WHEN valid_till < NOW() THEN 'EXPIRED'
  WHEN valid_from > NOW() THEN 'SCHEDULED'
  ELSE 'ACTIVE'
END,
published_at = COALESCE(published_at, created_at)
WHERE published_at IS NULL
  AND lifecycle_status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_active_offer_lookup
  ON public.merchant_offers(store_id, is_active, valid_from, valid_till)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_merchant_offers_v3_runtime_lookup
  ON public.merchant_offers (store_id, lifecycle_status, is_active, valid_from, valid_till, priority DESC, display_priority DESC)
  WHERE lifecycle_status IN ('ACTIVE', 'SCHEDULED');

CREATE INDEX IF NOT EXISTS idx_merchant_offers_v3_draft
  ON public.merchant_offers (store_id, lifecycle_status)
  WHERE lifecycle_status = 'DRAFT';

CREATE INDEX IF NOT EXISTS idx_merchant_offers_store_valid_window
  ON public.merchant_offers (store_id, valid_from, valid_till)
  WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- 3) Canonical related tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_offer_applicability (
  id BIGSERIAL PRIMARY KEY,
  offer_id BIGINT NOT NULL REFERENCES public.merchant_offers(id) ON DELETE CASCADE,
  menu_item_id BIGINT,
  category_id BIGINT,
  applicability_type TEXT NOT NULL,
  applies_to_variants BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.merchant_offer_applicability
  ADD COLUMN IF NOT EXISTS applies_to_variants BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS merchant_offer_applicability_offer_id_idx
  ON public.merchant_offer_applicability(offer_id);
CREATE INDEX IF NOT EXISTS merchant_offer_applicability_menu_item_id_idx
  ON public.merchant_offer_applicability(menu_item_id);
CREATE INDEX IF NOT EXISTS merchant_offer_applicability_category_id_idx
  ON public.merchant_offer_applicability(category_id);

ALTER TABLE public.merchant_offer_applicability
  DROP CONSTRAINT IF EXISTS check_item_or_category;
ALTER TABLE public.merchant_offer_applicability
  DROP CONSTRAINT IF EXISTS check_applicability_scope;
ALTER TABLE public.merchant_offer_applicability
  ADD CONSTRAINT check_applicability_scope CHECK (
    (menu_item_id IS NOT NULL AND category_id IS NULL) OR
    (menu_item_id IS NULL AND category_id IS NOT NULL) OR
    (menu_item_id IS NULL AND category_id IS NULL AND applicability_type IN (
      'ALL', 'CART', 'DELIVERY', 'SPECIFIC_ITEMS_SET', 'CATEGORY'
    ))
  );

CREATE TABLE IF NOT EXISTS public.merchant_offer_usages (
  id              BIGSERIAL PRIMARY KEY,
  offer_id        BIGINT        NOT NULL REFERENCES public.merchant_offers(id) ON DELETE CASCADE,
  user_id         BIGINT        NOT NULL,
  order_id        BIGINT        NULL,
  used_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_reversed     BOOLEAN       NOT NULL DEFAULT FALSE,
  reversed_at     TIMESTAMPTZ   NULL
);

CREATE INDEX IF NOT EXISTS merchant_offer_usages_offer_id_idx
  ON public.merchant_offer_usages(offer_id);
CREATE INDEX IF NOT EXISTS merchant_offer_usages_user_id_idx
  ON public.merchant_offer_usages(user_id);
CREATE INDEX IF NOT EXISTS merchant_offer_usages_order_id_idx
  ON public.merchant_offer_usages(order_id);
CREATE INDEX IF NOT EXISTS merchant_offer_usages_offer_user_idx
  ON public.merchant_offer_usages(offer_id, user_id);

CREATE TABLE IF NOT EXISTS public.offer_order_applications (
  id                BIGSERIAL     PRIMARY KEY,
  order_id          BIGINT        NOT NULL,
  offer_source      TEXT          NOT NULL,
  merchant_offer_id BIGINT        NULL REFERENCES public.merchant_offers(id) ON DELETE SET NULL,
  platform_offer_id BIGINT        NULL,
  offer_type        TEXT          NOT NULL,
  offer_title       TEXT          NOT NULL,
  coupon_code       TEXT          NULL,
  discount_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  platform_share    NUMERIC(10,2) NOT NULL DEFAULT 0,
  merchant_share    NUMERIC(10,2) NOT NULL DEFAULT 0,
  funding_mode      TEXT          NOT NULL DEFAULT 'MERCHANT_ONLY',
  snapshot_json     JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS offer_order_applications_order_id_idx
  ON public.offer_order_applications(order_id);
CREATE INDEX IF NOT EXISTS offer_order_applications_merchant_offer_id_idx
  ON public.offer_order_applications(merchant_offer_id);
CREATE INDEX IF NOT EXISTS offer_order_applications_offer_source_idx
  ON public.offer_order_applications(offer_source);

-- ----------------------------------------------------------------------------
-- 4) Runtime helpers (from former 0399/0400)
-- ----------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.sync_merchant_offer_lifecycle_batch()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER := 0;
  v_tmp INTEGER;
BEGIN
  UPDATE public.merchant_offers
  SET lifecycle_status = 'EXPIRED', is_active = false, updated_at = NOW()
  WHERE lifecycle_status IN ('ACTIVE', 'SCHEDULED')
    AND valid_till < NOW();
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_count := v_count + v_tmp;

  UPDATE public.merchant_offers
  SET lifecycle_status = 'ACTIVE', is_active = true, updated_at = NOW()
  WHERE lifecycle_status = 'SCHEDULED'
    AND valid_from <= NOW()
    AND valid_till >= NOW();
  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_count := v_count + v_tmp;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.bump_store_offer_pricing_cache_version(p_store_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_ver BIGINT;
BEGIN
  UPDATE public.merchant_stores
  SET offer_pricing_cache_version = offer_pricing_cache_version + 1
  WHERE id = p_store_id
  RETURNING offer_pricing_cache_version INTO v_ver;
  RETURN COALESCE(v_ver, 1);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5) Align existing rows: Boost / Precision / BOGO
-- ----------------------------------------------------------------------------
UPDATE public.merchant_offers o
SET
  offer_metadata = CASE
    WHEN o.offer_metadata IS NULL THEN '{}'::jsonb
    WHEN lower(trim(COALESCE(o.offer_metadata->>'conditions_mode', ''))) IN ('boost', 'precision')
      THEN jsonb_set(
        o.offer_metadata,
        '{conditions_mode}',
        to_jsonb(lower(trim(o.offer_metadata->>'conditions_mode'))),
        true
      )
    WHEN o.offer_metadata ? 'conditions_mode'
      THEN o.offer_metadata - 'conditions_mode'
    ELSE COALESCE(o.offer_metadata, '{}'::jsonb)
  END,
  updated_at = NOW()
WHERE o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON', 'CART_PERCENTAGE', 'CART_FLAT')
  AND (
    o.offer_metadata IS NULL
    OR NOT (o.offer_metadata ? 'conditions_mode')
    OR lower(trim(COALESCE(o.offer_metadata->>'conditions_mode', ''))) NOT IN ('boost', 'precision')
  );

UPDATE public.merchant_offers o
SET
  offer_metadata = jsonb_set(
    COALESCE(o.offer_metadata, '{}'::jsonb),
    '{conditions_mode}',
    to_jsonb(
      CASE
        WHEN o.offer_type IN ('BOGO', 'BUY_X_GET_Y', 'BUY_N_GET_M') THEN 'boost'
        WHEN upper(COALESCE(o.offer_sub_type, '')) IN (
          'SPECIFIC_ITEM', 'SPECIFIC_ITEMS', 'SELECTED_ITEM', 'SELECTED_ITEMS'
        )
          OR (
            jsonb_typeof(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') = 'array'
            AND jsonb_array_length(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') > 0
          )
          OR EXISTS (
            SELECT 1
            FROM public.merchant_offer_applicability a
            WHERE a.offer_id = o.id
              AND a.menu_item_id IS NOT NULL
          )
        THEN 'boost'
        WHEN (o.min_order_amount IS NOT NULL AND o.min_order_amount > 0)
          OR (o.max_discount_amount IS NOT NULL AND o.max_discount_amount > 0)
        THEN 'precision'
        ELSE 'boost'
      END
    ),
    true
  ),
  updated_at = NOW()
WHERE o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON', 'BOGO', 'BUY_X_GET_Y', 'BUY_N_GET_M')
  AND (
    o.offer_metadata IS NULL
    OR o.offer_metadata->>'conditions_mode' IS NULL
    OR trim(COALESCE(o.offer_metadata->>'conditions_mode', '')) = ''
  );

UPDATE public.merchant_offers o
SET
  offer_sub_type = 'ALL_ORDERS',
  offer_metadata = jsonb_set(
    jsonb_set(
      COALESCE(o.offer_metadata, '{}'::jsonb),
      '{conditions_mode}',
      '"precision"'::jsonb,
      true
    ),
    '{menu_item_ids}',
    '[]'::jsonb,
    true
  ),
  updated_at = NOW()
WHERE o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON')
  AND lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) = 'precision';

DELETE FROM public.merchant_offer_applicability a
USING public.merchant_offers o
WHERE a.offer_id = o.id
  AND a.menu_item_id IS NOT NULL
  AND o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON')
  AND lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) = 'precision';

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT o.id
    FROM public.merchant_offers o
    WHERE o.is_active = TRUE
      AND o.offer_type IN ('PERCENTAGE', 'FLAT', 'COUPON', 'BOGO', 'BUY_X_GET_Y', 'BUY_N_GET_M')
      AND lower(COALESCE(o.offer_metadata->>'conditions_mode', '')) <> 'precision'
      AND jsonb_typeof(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') = 'array'
      AND jsonb_array_length(COALESCE(o.offer_metadata, '{}'::jsonb)->'menu_item_ids') > 0
  LOOP
    PERFORM public.sync_offer_applicability_from_metadata(r.id);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6) Bump store offer cache
-- ----------------------------------------------------------------------------
UPDATE public.merchant_stores s
SET offer_pricing_cache_version = COALESCE(s.offer_pricing_cache_version, 1) + 1
WHERE EXISTS (
  SELECT 1
  FROM public.merchant_offers o
  WHERE o.store_id = s.id
    AND o.is_active = TRUE
);

COMMIT;
