-- Migration: Subscription plan locking + Super Admin manual override
-- Adds plan-lock columns, audit trail, and admin override precedence over auto-lock rules.
-- Idempotent — safe to run on databases that already applied partnersite 0117.

-- ============================================
-- STEP 1: Plan-lock columns on menu items
-- ============================================

ALTER TABLE public.merchant_menu_items
  ADD COLUMN IF NOT EXISTS is_locked_by_plan BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS locked_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS unlocked_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS admin_lock_override BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS merchant_menu_items_plan_locked_idx
  ON public.merchant_menu_items (store_id)
  WHERE is_locked_by_plan = TRUE;

CREATE INDEX IF NOT EXISTS merchant_menu_items_store_unlocked_active_idx
  ON public.merchant_menu_items (store_id)
  WHERE is_deleted = FALSE AND is_locked_by_plan = FALSE;

CREATE INDEX IF NOT EXISTS merchant_menu_items_admin_override_idx
  ON public.merchant_menu_items (store_id)
  WHERE admin_lock_override = TRUE;

-- ============================================
-- STEP 2: Plan-lock columns on categories
-- ============================================

ALTER TABLE public.merchant_menu_categories
  ADD COLUMN IF NOT EXISTS is_locked_by_plan BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS locked_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS unlocked_by TEXT NULL,
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS admin_lock_override BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS merchant_menu_categories_plan_locked_idx
  ON public.merchant_menu_categories (store_id)
  WHERE is_locked_by_plan = TRUE;

-- ============================================
-- STEP 3: Lock audit log
-- ============================================

CREATE TABLE IF NOT EXISTS public.merchant_menu_item_lock_audit (
  id BIGSERIAL PRIMARY KEY,
  menu_item_id BIGINT NOT NULL REFERENCES public.merchant_menu_items(id) ON DELETE CASCADE,
  store_id BIGINT NOT NULL,
  item_id TEXT NULL,
  item_name TEXT NULL,
  action TEXT NOT NULL CHECK (action IN ('LOCK', 'UNLOCK')),
  lock_reason TEXT NULL,
  performed_by TEXT NOT NULL,
  performed_by_id BIGINT NULL,
  performed_by_type TEXT NOT NULL CHECK (performed_by_type IN ('SYSTEM', 'ADMIN')),
  previous_state JSONB NULL,
  new_state JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_menu_item_lock_audit_item_idx
  ON public.merchant_menu_item_lock_audit (menu_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS merchant_menu_item_lock_audit_store_idx
  ON public.merchant_menu_item_lock_audit (store_id, created_at DESC);

-- ============================================
-- STEP 4: Plan usage view
-- ============================================

CREATE OR REPLACE VIEW public.merchant_plan_usage AS
SELECT
  mi.store_id,
  COUNT(*) FILTER (WHERE mi.is_deleted = FALSE) AS total_items,
  COUNT(*) FILTER (WHERE mi.is_deleted = FALSE AND mi.is_locked_by_plan = FALSE) AS unlocked_items,
  COUNT(*) FILTER (WHERE mi.is_deleted = FALSE AND mi.is_locked_by_plan = TRUE) AS locked_items,
  (SELECT COUNT(*) FROM merchant_menu_categories mc
     WHERE mc.store_id = mi.store_id AND mc.is_deleted = FALSE) AS total_categories,
  (SELECT COUNT(*) FROM merchant_menu_categories mc
     WHERE mc.store_id = mi.store_id AND mc.is_deleted = FALSE AND mc.is_locked_by_plan = FALSE) AS unlocked_categories,
  (SELECT COUNT(*) FROM merchant_menu_categories mc
     WHERE mc.store_id = mi.store_id AND mc.is_deleted = FALSE AND mc.is_locked_by_plan = TRUE) AS locked_categories
FROM public.merchant_menu_items mi
GROUP BY mi.store_id;

-- ============================================
-- STEP 5: Core enforcement (respects admin_lock_override)
-- ============================================

CREATE OR REPLACE FUNCTION public.enforce_plan_limits(p_store_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_merchant_id    BIGINT;
  v_max_items      INTEGER;
  v_max_categories INTEGER;
  v_plan_code      TEXT;
  v_items_locked   INTEGER := 0;
  v_items_unlocked INTEGER := 0;
  v_cats_locked    INTEGER := 0;
  v_cats_unlocked  INTEGER := 0;
BEGIN
  SELECT parent_id INTO v_merchant_id
  FROM public.merchant_stores
  WHERE id = p_store_id;

  IF v_merchant_id IS NULL THEN
    RETURN jsonb_build_object('error', 'store_not_found', 'store_id', p_store_id);
  END IF;

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

  IF v_plan_code IS NULL THEN
    SELECT mp.max_menu_items, mp.max_menu_categories, mp.plan_code
    INTO v_max_items, v_max_categories, v_plan_code
    FROM public.merchant_plans mp
    WHERE mp.plan_code = 'FREE' AND mp.is_active = TRUE
    LIMIT 1;
  END IF;

  IF v_max_items IS NULL THEN v_max_items := 15; END IF;
  IF v_max_categories IS NULL THEN v_max_categories := 5; END IF;

  -- ========== ENFORCE ITEM LIMITS ==========
  -- Keep oldest N items unlocked; lock all newer items (never random picks).
  IF v_max_items IS NOT NULL THEN
    WITH keep_ids AS (
      SELECT id
      FROM public.merchant_menu_items
      WHERE store_id = p_store_id
        AND is_deleted = FALSE
        AND admin_lock_override = FALSE
      ORDER BY created_at ASC NULLS LAST, id ASC
      LIMIT v_max_items
    ),
    lock_ids AS (
      SELECT m.id
      FROM public.merchant_menu_items m
      WHERE m.store_id = p_store_id
        AND m.is_deleted = FALSE
        AND m.admin_lock_override = FALSE
        AND m.id NOT IN (SELECT id FROM keep_ids)
    )
    UPDATE public.merchant_menu_items m
    SET is_locked_by_plan = TRUE,
        locked_reason = 'plan_item_limit_exceeded',
        locked_by = 'system',
        locked_at = NOW(),
        unlocked_by = NULL,
        unlocked_at = NULL
    FROM lock_ids l
    WHERE m.id = l.id
      AND m.is_locked_by_plan = FALSE;

    GET DIAGNOSTICS v_items_locked = ROW_COUNT;

    WITH keep_ids AS (
      SELECT id
      FROM public.merchant_menu_items
      WHERE store_id = p_store_id
        AND is_deleted = FALSE
        AND admin_lock_override = FALSE
      ORDER BY created_at ASC NULLS LAST, id ASC
      LIMIT v_max_items
    )
    UPDATE public.merchant_menu_items m
    SET is_locked_by_plan = FALSE,
        locked_reason = NULL,
        locked_by = NULL,
        locked_at = NULL,
        unlocked_by = 'system',
        unlocked_at = NOW()
    FROM keep_ids k
    WHERE m.id = k.id
      AND m.is_locked_by_plan = TRUE
      AND COALESCE(m.locked_by, 'system') = 'system';

    GET DIAGNOSTICS v_items_unlocked = ROW_COUNT;
  ELSE
    UPDATE public.merchant_menu_items
    SET is_locked_by_plan = FALSE,
        locked_reason = NULL,
        locked_by = NULL,
        locked_at = NULL,
        unlocked_by = 'system',
        unlocked_at = NOW()
    WHERE store_id = p_store_id
      AND is_locked_by_plan = TRUE
      AND admin_lock_override = FALSE
      AND COALESCE(locked_by, 'system') = 'system';

    GET DIAGNOSTICS v_items_unlocked = ROW_COUNT;
  END IF;

  -- ========== ENFORCE CATEGORY LIMITS ==========
  IF v_max_categories IS NOT NULL THEN
    WITH keep_ids AS (
      SELECT id
      FROM public.merchant_menu_categories
      WHERE store_id = p_store_id
        AND is_deleted = FALSE
        AND admin_lock_override = FALSE
      ORDER BY created_at ASC NULLS LAST, id ASC
      LIMIT v_max_categories
    ),
    lock_ids AS (
      SELECT m.id
      FROM public.merchant_menu_categories m
      WHERE m.store_id = p_store_id
        AND m.is_deleted = FALSE
        AND m.admin_lock_override = FALSE
        AND m.id NOT IN (SELECT id FROM keep_ids)
    )
    UPDATE public.merchant_menu_categories m
    SET is_locked_by_plan = TRUE,
        locked_reason = 'plan_category_limit_exceeded',
        locked_by = 'system',
        locked_at = NOW(),
        unlocked_by = NULL,
        unlocked_at = NULL
    FROM lock_ids l
    WHERE m.id = l.id
      AND m.is_locked_by_plan = FALSE;

    GET DIAGNOSTICS v_cats_locked = ROW_COUNT;

    WITH keep_ids AS (
      SELECT id
      FROM public.merchant_menu_categories
      WHERE store_id = p_store_id
        AND is_deleted = FALSE
        AND admin_lock_override = FALSE
      ORDER BY created_at ASC NULLS LAST, id ASC
      LIMIT v_max_categories
    )
    UPDATE public.merchant_menu_categories m
    SET is_locked_by_plan = FALSE,
        locked_reason = NULL,
        locked_by = NULL,
        locked_at = NULL,
        unlocked_by = 'system',
        unlocked_at = NOW()
    FROM keep_ids k
    WHERE m.id = k.id
      AND m.is_locked_by_plan = TRUE
      AND COALESCE(m.locked_by, 'system') = 'system';

    GET DIAGNOSTICS v_cats_unlocked = ROW_COUNT;
  ELSE
    UPDATE public.merchant_menu_categories
    SET is_locked_by_plan = FALSE,
        locked_reason = NULL,
        locked_by = NULL,
        locked_at = NULL,
        unlocked_by = 'system',
        unlocked_at = NOW()
    WHERE store_id = p_store_id
      AND is_locked_by_plan = TRUE
      AND admin_lock_override = FALSE
      AND COALESCE(locked_by, 'system') = 'system';

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
-- STEP 6: Bulk enforcement for all stores
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
-- STEP 7: Super Admin manual lock / unlock
-- ============================================

CREATE OR REPLACE FUNCTION public.admin_set_menu_item_lock(
  p_menu_item_pk BIGINT,
  p_lock BOOLEAN,
  p_admin_identifier TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_item RECORD;
  v_reason TEXT;
  v_prev JSONB;
  v_new JSONB;
BEGIN
  SELECT id, store_id, item_id, item_name, is_locked_by_plan, locked_reason, locked_by, locked_at, admin_lock_override
  INTO v_item
  FROM public.merchant_menu_items
  WHERE id = p_menu_item_pk AND is_deleted = FALSE;

  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('error', 'item_not_found', 'menu_item_pk', p_menu_item_pk);
  END IF;

  v_prev := jsonb_build_object(
    'is_locked_by_plan', v_item.is_locked_by_plan,
    'locked_reason', v_item.locked_reason,
    'locked_by', v_item.locked_by,
    'locked_at', v_item.locked_at,
    'admin_lock_override', v_item.admin_lock_override
  );

  IF p_lock THEN
    v_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'manual_admin_lock');
    UPDATE public.merchant_menu_items
    SET is_locked_by_plan = TRUE,
        locked_reason = v_reason,
        locked_by = 'admin',
        locked_at = NOW(),
        unlocked_by = NULL,
        unlocked_at = NULL,
        admin_lock_override = TRUE,
        updated_at = NOW()
    WHERE id = p_menu_item_pk;
  ELSE
    UPDATE public.merchant_menu_items
    SET is_locked_by_plan = FALSE,
        locked_reason = NULL,
        locked_by = NULL,
        locked_at = NULL,
        unlocked_by = p_admin_identifier,
        unlocked_at = NOW(),
        admin_lock_override = TRUE,
        updated_at = NOW()
    WHERE id = p_menu_item_pk;
    v_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'manual_admin_unlock');
  END IF;

  SELECT jsonb_build_object(
    'is_locked_by_plan', is_locked_by_plan,
    'locked_reason', locked_reason,
    'locked_by', locked_by,
    'locked_at', locked_at,
    'unlocked_by', unlocked_by,
    'unlocked_at', unlocked_at,
    'admin_lock_override', admin_lock_override
  )
  INTO v_new
  FROM public.merchant_menu_items
  WHERE id = p_menu_item_pk;

  INSERT INTO public.merchant_menu_item_lock_audit (
    menu_item_id, store_id, item_id, item_name, action, lock_reason,
    performed_by, performed_by_type, previous_state, new_state
  ) VALUES (
    p_menu_item_pk,
    v_item.store_id,
    v_item.item_id,
    v_item.item_name,
    CASE WHEN p_lock THEN 'LOCK' ELSE 'UNLOCK' END,
    v_reason,
    p_admin_identifier,
    'ADMIN',
    v_prev,
    v_new
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'menu_item_pk', p_menu_item_pk,
    'store_id', v_item.store_id,
    'item_id', v_item.item_id,
    'locked', p_lock,
    'state', v_new
  );
END;
$$;

COMMENT ON FUNCTION public.enforce_plan_limits(BIGINT) IS
  'Locks/unlocks menu items and categories per active subscription plan. Skips rows with admin_lock_override=TRUE.';
COMMENT ON FUNCTION public.admin_set_menu_item_lock(BIGINT, BOOLEAN, TEXT, TEXT) IS
  'Super Admin manual lock/unlock. Sets admin_lock_override=TRUE so plan enforcement cannot override.';
