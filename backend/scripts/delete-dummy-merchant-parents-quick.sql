-- =============================================================================
-- QUICK: delete dummy merchant_parents (run in Supabase SQL Editor)
-- =============================================================================
-- UI delete fails: merchant_stores.parent_id → ON DELETE RESTRICT (id=63 etc.)
-- Copy ENTIRE file → SQL Editor → Run once.
-- Edit the id array if your selection changes.
-- =============================================================================

BEGIN;

-- ① Dummy parent ids to remove (keep real partners OUT of this list)
CREATE TEMP TABLE _del ON COMMIT DROP AS
SELECT unnest(ARRAY[41, 43, 52, 55, 63]::bigint[]) AS parent_id;

CREATE TEMP TABLE _del_stores ON COMMIT DROP AS
SELECT ms.id AS store_id
FROM public.merchant_stores ms
WHERE ms.parent_id IN (SELECT parent_id FROM _del);

-- ② Onboarding / bank / subscription (RESTRICT on parent)
DELETE FROM public.merchant_onboarding_payments
WHERE merchant_parent_id IN (SELECT parent_id FROM _del)
   OR merchant_store_id IN (SELECT store_id FROM _del_stores);

DO $$ BEGIN
  IF to_regclass('public.merchant_bank_verification_payouts') IS NOT NULL THEN
    DELETE FROM public.merchant_bank_verification_payouts
    WHERE merchant_parent_id IN (SELECT parent_id FROM _del)
       OR merchant_store_id IN (SELECT store_id FROM _del_stores);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.subscription_payments') IS NOT NULL THEN
    DELETE FROM public.subscription_payments
    WHERE merchant_id IN (SELECT parent_id FROM _del);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.merchant_subscriptions') IS NOT NULL THEN
    DELETE FROM public.merchant_subscriptions
    WHERE merchant_id IN (SELECT parent_id FROM _del);
  END IF;
END $$;

-- ③ Detach orders / tickets from these stores & parents
UPDATE public.orders_core
SET merchant_store_id = NULL, merchant_parent_id = NULL, updated_at = NOW()
WHERE merchant_parent_id IN (SELECT parent_id FROM _del)
   OR merchant_store_id IN (SELECT store_id FROM _del_stores);

DO $$ BEGIN
  IF to_regclass('public.orders_food') IS NOT NULL THEN
    UPDATE public.orders_food SET merchant_store_id = NULL, updated_at = NOW()
    WHERE merchant_store_id IN (SELECT store_id FROM _del_stores);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    UPDATE public.orders
    SET merchant_store_id = NULL, merchant_parent_id = NULL, updated_at = NOW()
    WHERE merchant_parent_id IN (SELECT parent_id FROM _del)
       OR merchant_store_id IN (SELECT store_id FROM _del_stores);
  END IF;
END $$;

UPDATE public.unified_tickets
SET merchant_parent_id = NULL, merchant_store_id = NULL, updated_at = NOW()
WHERE merchant_parent_id IN (SELECT parent_id FROM _del)
   OR merchant_store_id IN (SELECT store_id FROM _del_stores);

-- ④ Registration progress + store-scoped rows
DELETE FROM public.merchant_store_registration_progress
WHERE parent_id IN (SELECT parent_id FROM _del)
   OR store_id IN (SELECT store_id FROM _del_stores);

DO $$ BEGIN
  IF to_regclass('public.merchant_store_orders') IS NOT NULL THEN
    DELETE FROM public.merchant_store_orders
    WHERE merchant_id IN (SELECT parent_id FROM _del)
       OR store_id IN (SELECT store_id FROM _del_stores);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.merchant_sessions') IS NOT NULL THEN
    DELETE FROM public.merchant_sessions
    WHERE merchant_id IN (SELECT parent_id FROM _del);
  END IF;
END $$;

-- ⑤ Delete child stores FIRST (blocks parent delete via RESTRICT)
DELETE FROM public.merchant_stores
WHERE id IN (SELECT store_id FROM _del_stores);

-- ⑥ Delete dummy parents
DELETE FROM public.merchant_parents
WHERE id IN (SELECT parent_id FROM _del);

COMMIT;

-- Verify — should return 0 rows
SELECT id, parent_merchant_id, parent_name
FROM public.merchant_parents
WHERE id IN (41, 43, 52, 55, 63);
