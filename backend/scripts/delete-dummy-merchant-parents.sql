-- =============================================================================
-- DELETE dummy merchant_parents (Supabase Table Editor delete WILL FAIL otherwise)
-- =============================================================================
-- Root cause: merchant_onboarding_payments (and other tables) use ON DELETE RESTRICT.
--
-- HOW TO USE (Supabase SQL Editor):
--   1. Edit DELETE_PARENT_IDS below — only ids you SELECTED for deletion (dummy rows).
--   2. Run the PREVIEW section first (SELECT queries).
--   3. Run the whole file. First run uses ROLLBACK (dry run).
--   4. When preview looks correct, comment ROLLBACK and uncomment COMMIT.
--
-- KEEPS: every merchant_parents row NOT listed in DELETE_PARENT_IDS.
-- =============================================================================

BEGIN;

-- ▼▼▼ EDIT THIS LIST — parent ids selected for deletion in Supabase ▼▼▼
-- From your screenshot: 41, 43, 44, 51, 52, 55, 63 (add/remove as needed)
-- DO NOT put real partner ids here.
CREATE TEMP TABLE _delete_merchant_parents ON COMMIT DROP AS
SELECT unnest(ARRAY[
  41, 43, 44, 51, 52, 55, 63
]::bigint[]) AS parent_id;

CREATE TEMP TABLE _delete_merchant_stores ON COMMIT DROP AS
SELECT ms.id AS store_id
FROM public.merchant_stores ms
WHERE ms.parent_id IN (SELECT parent_id FROM _delete_merchant_parents);

-- ---------------------------------------------------------------------------
-- PREVIEW — parents & stores that will be removed
-- ---------------------------------------------------------------------------
SELECT mp.id, mp.parent_merchant_id, mp.parent_name, mp.registered_phone
FROM public.merchant_parents mp
WHERE mp.id IN (SELECT parent_id FROM _delete_merchant_parents)
ORDER BY mp.id;

SELECT ms.id, ms.store_id, ms.store_name, ms.parent_id
FROM public.merchant_stores ms
WHERE ms.id IN (SELECT store_id FROM _delete_merchant_stores)
ORDER BY ms.id;

SELECT 'merchant_onboarding_payments' AS tbl, COUNT(*)::bigint AS cnt
FROM public.merchant_onboarding_payments p
WHERE p.merchant_parent_id IN (SELECT parent_id FROM _delete_merchant_parents)
   OR p.merchant_store_id IN (SELECT store_id FROM _delete_merchant_stores)
UNION ALL
SELECT 'merchant_stores', COUNT(*)::bigint
FROM public.merchant_stores ms
WHERE ms.id IN (SELECT store_id FROM _delete_merchant_stores)
UNION ALL
SELECT 'merchant_users', COUNT(*)::bigint
FROM public.merchant_users mu
WHERE mu.parent_id IN (SELECT parent_id FROM _delete_merchant_parents)
UNION ALL
SELECT 'merchant_store_registration_progress', COUNT(*)::bigint
FROM public.merchant_store_registration_progress rp
WHERE rp.parent_id IN (SELECT parent_id FROM _delete_merchant_parents)
   OR rp.store_id IN (SELECT store_id FROM _delete_merchant_stores);

-- ---------------------------------------------------------------------------
-- Step 1 — onboarding / bank / subscription rows (RESTRICT on merchant_parents)
-- ---------------------------------------------------------------------------
DELETE FROM public.merchant_onboarding_payments p
WHERE p.merchant_parent_id IN (SELECT parent_id FROM _delete_merchant_parents)
   OR p.merchant_store_id IN (SELECT store_id FROM _delete_merchant_stores);

DO $$
BEGIN
  IF to_regclass('public.merchant_bank_verification_payouts') IS NOT NULL THEN
    DELETE FROM public.merchant_bank_verification_payouts
    WHERE merchant_parent_id IN (SELECT parent_id FROM _delete_merchant_parents)
       OR merchant_store_id IN (SELECT store_id FROM _delete_merchant_stores);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.subscription_payments') IS NOT NULL THEN
    DELETE FROM public.subscription_payments sp
    WHERE sp.merchant_id IN (SELECT parent_id FROM _delete_merchant_parents);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.merchant_subscriptions') IS NOT NULL THEN
    DELETE FROM public.merchant_subscriptions ms
    WHERE ms.merchant_id IN (SELECT parent_id FROM _delete_merchant_parents);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 2 — detach orders / tickets so store delete does not fail
-- ---------------------------------------------------------------------------
UPDATE public.orders_core oc
SET merchant_store_id = NULL,
    merchant_parent_id = NULL,
    updated_at = NOW()
WHERE oc.merchant_parent_id IN (SELECT parent_id FROM _delete_merchant_parents)
   OR oc.merchant_store_id IN (SELECT store_id FROM _delete_merchant_stores);

DO $$
BEGIN
  IF to_regclass('public.orders_food') IS NOT NULL THEN
    UPDATE public.orders_food f
    SET merchant_store_id = NULL,
        updated_at = NOW()
    WHERE f.merchant_store_id IN (SELECT store_id FROM _delete_merchant_stores);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    UPDATE public.orders o
    SET merchant_store_id = NULL,
        merchant_parent_id = NULL,
        updated_at = NOW()
    WHERE o.merchant_parent_id IN (SELECT parent_id FROM _delete_merchant_parents)
       OR o.merchant_store_id IN (SELECT store_id FROM _delete_merchant_stores);
  END IF;
END $$;

UPDATE public.unified_tickets t
SET merchant_parent_id = NULL,
    merchant_store_id = NULL,
    updated_at = NOW()
WHERE t.merchant_parent_id IN (SELECT parent_id FROM _delete_merchant_parents)
   OR t.merchant_store_id IN (SELECT store_id FROM _delete_merchant_stores);

-- ---------------------------------------------------------------------------
-- Step 3 — parent / store scoped rows
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.merchant_store_orders') IS NOT NULL THEN
    DELETE FROM public.merchant_store_orders
    WHERE merchant_id IN (SELECT parent_id FROM _delete_merchant_parents);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.merchant_store_payouts') IS NOT NULL THEN
    DELETE FROM public.merchant_store_payouts
    WHERE parent_id IN (SELECT parent_id FROM _delete_merchant_parents);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.merchant_store_commission_rules') IS NOT NULL THEN
    DELETE FROM public.merchant_store_commission_rules
    WHERE parent_id IN (SELECT parent_id FROM _delete_merchant_parents);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.merchant_coupons') IS NOT NULL THEN
    DELETE FROM public.merchant_coupons
    WHERE parent_id IN (SELECT parent_id FROM _delete_merchant_parents);
  END IF;
END $$;

DELETE FROM public.merchant_store_registration_progress rp
WHERE rp.parent_id IN (SELECT parent_id FROM _delete_merchant_parents)
   OR rp.store_id IN (SELECT store_id FROM _delete_merchant_stores);

DELETE FROM public.merchant_users mu
WHERE mu.parent_id IN (SELECT parent_id FROM _delete_merchant_parents);

DO $$
BEGIN
  IF to_regclass('public.merchant_sessions') IS NOT NULL THEN
    DELETE FROM public.merchant_sessions
    WHERE merchant_id IN (SELECT parent_id FROM _delete_merchant_parents);
  END IF;
END $$;

-- Stores (menu / wallet / hours cascade from merchant_stores child FKs in most cases)
DELETE FROM public.merchant_stores ms
WHERE ms.id IN (SELECT store_id FROM _delete_merchant_stores);

-- ---------------------------------------------------------------------------
-- Step 4 — delete merchant_parents (dummy rows only)
-- ---------------------------------------------------------------------------
DELETE FROM public.merchant_parents mp
WHERE mp.id IN (SELECT parent_id FROM _delete_merchant_parents);

-- Should return 0 rows if delete succeeded
SELECT mp.id, mp.parent_merchant_id, mp.parent_name
FROM public.merchant_parents mp
WHERE mp.id IN (SELECT parent_id FROM _delete_merchant_parents);

ROLLBACK;
-- COMMIT;
