-- Migration: Subscription Downgrade → Item Locking System
-- Purpose: Soft-lock menu items/categories exceeding plan limits on downgrade.
--          Never deletes data. Fully reversible. Idempotent. Concurrency-safe.
-- Date: 2026-02-28

-- ============================================
-- STEP 1: Add plan-lock columns to merchant_menu_items
-- ============================================

ALTER TABLE public.merchant_menu_items
  ADD COLUMN IF NOT EXISTS is_locked_by_plan BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS merchant_menu_items_plan_locked_idx
  ON public.merchant_menu_items (store_id)
  WHERE is_locked_by_plan = TRUE;

CREATE INDEX IF NOT EXISTS merchant_menu_items_store_unlocked_active_idx
  ON public.merchant_menu_items (store_id)
  WHERE is_deleted = FALSE AND is_locked_by_plan = FALSE;

-- ============================================
-- STEP 2: Add plan-lock columns to merchant_menu_categories
-- ============================================

ALTER TABLE public.merchant_menu_categories
  ADD COLUMN IF NOT EXISTS is_locked_by_plan BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS merchant_menu_categories_plan_locked_idx
  ON public.merchant_menu_categories (store_id)
  WHERE is_locked_by_plan = TRUE;

-- ============================================
-- STEP 3: merchant_plan_usage view
-- ============================================

CREATE OR REPLACE VIEW public.merchant_plan_usage AS
SELECT
  mi.store_id,
  COUNT(*) FILTER (WHERE mi.is_deleted = FALSE)                                          AS total_items,
  COUNT(*) FILTER (WHERE mi.is_deleted = FALSE AND mi.is_locked_by_plan = FALSE)         AS unlocked_items,
  COUNT(*) FILTER (WHERE mi.is_deleted = FALSE AND mi.is_locked_by_plan = TRUE)          AS locked_items,
  (SELECT COUNT(*) FROM merchant_menu_categories mc
     WHERE mc.store_id = mi.store_id AND mc.is_deleted = FALSE)                          AS total_categories,
  (SELECT COUNT(*) FROM merchant_menu_categories mc
     WHERE mc.store_id = mi.store_id AND mc.is_deleted = FALSE AND mc.is_locked_by_plan = FALSE) AS unlocked_categories,
  (SELECT COUNT(*) FROM merchant_menu_categories mc
     WHERE mc.store_id = mi.store_id AND mc.is_deleted = FALSE AND mc.is_locked_by_plan = TRUE)  AS locked_categories
FROM public.merchant_menu_items mi
GROUP BY mi.store_id;

-- ============================================
-- STEP 4: Core enforcement function
-- ============================================

CREATE OR REPLACE FUNCTION public.enforce_plan_limits(p_store_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_merchant_id   BIGINT;
  v_max_items     INTEGER;
  v_max_categories INTEGER;
  v_plan_code     TEXT;
  v_items_locked  INTEGER := 0;
  v_items_unlocked INTEGER := 0;
  v_cats_locked   INTEGER := 0;
  v_cats_unlocked INTEGER := 0;
BEGIN
  -- Get merchant_id for this store
  SELECT parent_id INTO v_merchant_id
  FROM public.merchant_stores
  WHERE id = p_store_id;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'store_not_found', 'store_id', p_store_id);
  END IF;

  -- Get active subscription plan limits
  SELECT mp.max_menu_items, mp.max_menu_categories, mp.plan_code
  INTO v_max_items, v_max_categories, v_plan_code
  FROM public.merchant_subscriptions ms
  JOIN public.merchant_plans mp ON mp.id = ms.plan_id
  WHERE ms.merchant_id = v_merchant_id
    AND (ms.store_id IS NULL OR ms.store_id = p_store_id)
    AND ms.is_active = TRUE
    AND ms.subscription_status = 'ACTIVE'
    AND ms.expiry_date > NOW()
  ORDER BY ms.expiry_date DESC
  LIMIT 1;

  -- No active subscription → fall back to FREE plan limits
  IF v_plan_code IS NULL THEN
    SELECT mp.max_menu_items, mp.max_menu_categories, mp.plan_code
    INTO v_max_items, v_max_categories, v_plan_code
    FROM public.merchant_plans mp
    WHERE mp.plan_code = 'FREE' AND mp.is_active = TRUE
    LIMIT 1;
  END IF;

  -- If still NULL (no FREE plan exists), use safe defaults
  IF v_max_items IS NULL THEN v_max_items := 15; END IF;
  IF v_max_categories IS NULL THEN v_max_categories := 5; END IF;

  -- NULL in plan means unlimited → skip locking, unlock everything
  -- (Premium/Enterprise have NULL = unlimited)

  -- ========== ENFORCE ITEM LIMITS ==========

  IF v_max_items IS NOT NULL THEN
    -- Lock items beyond the limit (keep oldest N unlocked)
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
      FROM public.merchant_menu_items
      WHERE store_id = p_store_id
        AND is_deleted = FALSE
    )
    UPDATE public.merchant_menu_items m
    SET is_locked_by_plan = TRUE,
        locked_reason = 'plan_item_limit_exceeded',
        locked_at = NOW()
    FROM ranked r
    WHERE m.id = r.id
      AND r.rn > v_max_items
      AND m.is_locked_by_plan = FALSE;

    GET DIAGNOSTICS v_items_locked = ROW_COUNT;

    -- Unlock items within the limit that were previously locked
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
      FROM public.merchant_menu_items
      WHERE store_id = p_store_id
        AND is_deleted = FALSE
    )
    UPDATE public.merchant_menu_items m
    SET is_locked_by_plan = FALSE,
        locked_reason = NULL,
        locked_at = NULL
    FROM ranked r
    WHERE m.id = r.id
      AND r.rn <= v_max_items
      AND m.is_locked_by_plan = TRUE;

    GET DIAGNOSTICS v_items_unlocked = ROW_COUNT;
  ELSE
    -- Unlimited plan: unlock all locked items
    UPDATE public.merchant_menu_items
    SET is_locked_by_plan = FALSE,
        locked_reason = NULL,
        locked_at = NULL
    WHERE store_id = p_store_id
      AND is_locked_by_plan = TRUE;

    GET DIAGNOSTICS v_items_unlocked = ROW_COUNT;
  END IF;

  -- ========== ENFORCE CATEGORY LIMITS ==========

  IF v_max_categories IS NOT NULL THEN
    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
      FROM public.merchant_menu_categories
      WHERE store_id = p_store_id
        AND is_deleted = FALSE
    )
    UPDATE public.merchant_menu_categories m
    SET is_locked_by_plan = TRUE,
        locked_reason = 'plan_category_limit_exceeded',
        locked_at = NOW()
    FROM ranked r
    WHERE m.id = r.id
      AND r.rn > v_max_categories
      AND m.is_locked_by_plan = FALSE;

    GET DIAGNOSTICS v_cats_locked = ROW_COUNT;

    WITH ranked AS (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
      FROM public.merchant_menu_categories
      WHERE store_id = p_store_id
        AND is_deleted = FALSE
    )
    UPDATE public.merchant_menu_categories m
    SET is_locked_by_plan = FALSE,
        locked_reason = NULL,
        locked_at = NULL
    FROM ranked r
    WHERE m.id = r.id
      AND r.rn <= v_max_categories
      AND m.is_locked_by_plan = TRUE;

    GET DIAGNOSTICS v_cats_unlocked = ROW_COUNT;
  ELSE
    UPDATE public.merchant_menu_categories
    SET is_locked_by_plan = FALSE,
        locked_reason = NULL,
        locked_at = NULL
    WHERE store_id = p_store_id
      AND is_locked_by_plan = TRUE;

    GET DIAGNOSTICS v_cats_unlocked = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'plan_code', COALESCE(v_plan_code, 'FREE'),
    'max_items', v_max_items,
    'max_categories', v_max_categories,
    'items_locked', v_items_locked,
    'items_unlocked', v_items_unlocked,
    'categories_locked', v_cats_locked,
    'categories_unlocked', v_cats_unlocked
  );
END;
$$;

-- ============================================
-- STEP 5: Bulk enforcement for all stores (cron/nightly)
-- ============================================

CREATE OR REPLACE FUNCTION public.enforce_plan_limits_all_stores()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_store RECORD;
  v_results JSONB := '[]'::JSONB;
  v_result JSONB;
BEGIN
  FOR v_store IN
    SELECT DISTINCT store_id
    FROM public.merchant_menu_items
    WHERE is_deleted = FALSE
  LOOP
    v_result := public.enforce_plan_limits(v_store.store_id);
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;

  RETURN v_results;
END;
$$;

-- ============================================
-- STEP 6: Unlock all items for a store (on upgrade)
-- ============================================

CREATE OR REPLACE FUNCTION public.unlock_all_plan_locks(p_store_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_items_unlocked INTEGER := 0;
  v_cats_unlocked  INTEGER := 0;
BEGIN
  UPDATE public.merchant_menu_items
  SET is_locked_by_plan = FALSE,
      locked_reason = NULL,
      locked_at = NULL
  WHERE store_id = p_store_id
    AND is_locked_by_plan = TRUE;
  GET DIAGNOSTICS v_items_unlocked = ROW_COUNT;

  UPDATE public.merchant_menu_categories
  SET is_locked_by_plan = FALSE,
      locked_reason = NULL,
      locked_at = NULL
  WHERE store_id = p_store_id
    AND is_locked_by_plan = TRUE;
  GET DIAGNOSTICS v_cats_unlocked = ROW_COUNT;

  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'items_unlocked', v_items_unlocked,
    'categories_unlocked', v_cats_unlocked
  );
END;
$$;
