-- =============================================================================
-- Unified Store Operational Reset — Store PK 77 / public id GMMC1025
-- =============================================================================
-- Resets ALL operational / transactional data so the store behaves like a
-- freshly onboarded outlet that already has menu, timings, documents, and an
-- active subscription — ready for its first order.
--
-- DOES NOT DELETE OR MODIFY (configuration / master):
--   merchant_stores, merchant account, profile, timings, menu (+ modifiers /
--   add-ons), taxes, FSSAI/GST docs, images/banners, store settings, delivery /
--   pricing config, agreements, active merchant_subscriptions, staff / roles,
--   bank & UPI accounts, push tokens, onboarding / verification state.
--
-- DELETES / RESETS (operations):
--   orders + children, tickets, ratings/reviews, complaints, pending carts,
--   wallet ledger / transactions, payouts & settlements, payout cycles /
--   summaries (Payments & Ledger), plan purchase + refund history,
--   merchant offers / coupons, notifications, analytics caches, rider dispatch /
--   assignment for store orders, KOT counter, ops activity logs.
--
-- Prerequisites:
--   1) Apply function migration once (Supabase SQL editor or migrate):
--        backend/drizzle/0483_merchant_store_transactional_reset_v2.sql
--   2) Then run THIS entire file in one session.
--
-- Idempotent: safe to re-run (already-empty tables → 0 deletes).
-- Single transaction. Does NOT disable foreign keys.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Validate target store (abort if mismatch)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id BIGINT;
  v_public TEXT;
  v_name TEXT;
BEGIN
  SELECT ms.id, ms.store_id, ms.store_name
    INTO v_id, v_public, v_name
  FROM public.merchant_stores ms
  WHERE ms.id = 77
    AND ms.store_id = 'GMMC1025'
    AND ms.deleted_at IS NULL
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION
      'Store mismatch: expected merchant_stores.id=77 AND store_id=GMMC1025 (active). Aborting.';
  END IF;

  RAISE NOTICE 'Resetting store % (%) — %', v_public, v_id, v_name;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Preview counts (before)
-- ---------------------------------------------------------------------------
SELECT public.purge_merchant_store_transactional_data(
  p_store_public_id := 'GMMC1025',
  p_merchant_store_id := 77,
  p_execute := FALSE
) AS preview_before;

-- ---------------------------------------------------------------------------
-- 2) Execute purge (dependency-ordered deletes inside the function)
-- ---------------------------------------------------------------------------
SELECT public.purge_merchant_store_transactional_data(
  p_store_public_id := 'GMMC1025',
  p_merchant_store_id := 77,
  p_execute := TRUE
) AS purge_result;

-- ---------------------------------------------------------------------------
-- 3) Verification summary — expect zeros for operational tables
-- ---------------------------------------------------------------------------
SELECT label, cnt
FROM (
  SELECT 1 AS ord, 'orders_core' AS label, COUNT(*)::bigint AS cnt
  FROM public.orders_core WHERE merchant_store_id = 77
  UNION ALL
  SELECT 2, 'orders_food', COUNT(*)::bigint
  FROM public.orders_food WHERE merchant_store_id = 77
  UNION ALL
  SELECT 3, 'pending_orders', COUNT(*)::bigint
  FROM public.pending_orders WHERE merchant_store_id = 77
  UNION ALL
  SELECT 4, 'unified_tickets', COUNT(*)::bigint
  FROM public.unified_tickets WHERE merchant_store_id = 77
  UNION ALL
  SELECT 5, 'merchant_store_ratings', COUNT(*)::bigint
  FROM public.merchant_store_ratings WHERE store_id = 77
  UNION ALL
  SELECT 6, 'restaurant_reports', COUNT(*)::bigint
  FROM public.restaurant_reports WHERE store_id = 77
  UNION ALL
  SELECT 7, 'merchant_wallet_ledger', COUNT(*)::bigint
  FROM public.merchant_wallet_ledger mwl
  WHERE mwl.wallet_id IN (SELECT id FROM public.merchant_wallet WHERE merchant_store_id = 77)
  UNION ALL
  SELECT 8, 'merchant_payout_requests', COUNT(*)::bigint
  FROM public.merchant_payout_requests pr
  WHERE pr.wallet_id IN (SELECT id FROM public.merchant_wallet WHERE merchant_store_id = 77)
  UNION ALL
  SELECT 9, 'merchant_store_notifications', COUNT(*)::bigint
  FROM public.merchant_store_notifications WHERE store_id = 77
) v
ORDER BY ord;

-- Optional tables (skip quietly if absent)
SELECT label, cnt
FROM (
  SELECT 10 AS ord, 'merchant_payout_cycles' AS label,
         CASE WHEN to_regclass('public.merchant_payout_cycles') IS NULL THEN 0
              ELSE (SELECT COUNT(*)::bigint FROM public.merchant_payout_cycles WHERE merchant_store_id = 77)
         END AS cnt
  UNION ALL
  SELECT 11, 'merchant_payout_summaries',
         CASE WHEN to_regclass('public.merchant_payout_summaries') IS NULL THEN 0
              ELSE (
                SELECT COUNT(*)::bigint FROM public.merchant_payout_summaries s
                WHERE s.wallet_id IN (SELECT id FROM public.merchant_wallet WHERE merchant_store_id = 77)
              )
         END
  UNION ALL
  SELECT 12, 'subscription_payments',
         CASE WHEN to_regclass('public.subscription_payments') IS NULL THEN 0
              ELSE (SELECT COUNT(*)::bigint FROM public.subscription_payments WHERE store_id = 77)
         END
  UNION ALL
  SELECT 13, 'merchant_subscription_refunds',
         CASE WHEN to_regclass('public.merchant_subscription_refunds') IS NULL THEN 0
              ELSE (SELECT COUNT(*)::bigint FROM public.merchant_subscription_refunds WHERE store_id = 77)
         END
  UNION ALL
  SELECT 14, 'merchant_store_daily_analytics',
         CASE WHEN to_regclass('public.merchant_store_daily_analytics') IS NULL THEN 0
              ELSE (SELECT COUNT(*)::bigint FROM public.merchant_store_daily_analytics WHERE store_id = 77)
         END
  UNION ALL
  SELECT 15, 'payment_refund_ledger',
         CASE WHEN to_regclass('public.payment_refund_ledger') IS NULL THEN 0
              ELSE (
                SELECT COUNT(*)::bigint FROM public.payment_refund_ledger prf
                WHERE prf.wallet_id IN (SELECT id FROM public.merchant_wallet WHERE merchant_store_id = 77)
              )
         END
) o
ORDER BY ord;

-- Wallet must exist and be zeroed (shell kept)
SELECT
  w.id,
  w.merchant_store_id,
  w.status,
  w.available_balance,
  w.pending_balance,
  w.hold_balance,
  w.total_earned,
  w.total_withdrawn
FROM public.merchant_wallet w
WHERE w.merchant_store_id = 77;

-- Config still present
SELECT label, cnt
FROM (
  SELECT 1 AS ord, 'merchant_stores' AS label, COUNT(*)::bigint AS cnt
  FROM public.merchant_stores WHERE id = 77 AND store_id = 'GMMC1025' AND deleted_at IS NULL
  UNION ALL
  SELECT 2, 'merchant_menu_items',
         CASE WHEN to_regclass('public.merchant_menu_items') IS NULL THEN -1
              ELSE (SELECT COUNT(*)::bigint FROM public.merchant_menu_items WHERE store_id = 77)
         END
  UNION ALL
  SELECT 3, 'merchant_menu_categories',
         CASE WHEN to_regclass('public.merchant_menu_categories') IS NULL THEN -1
              ELSE (SELECT COUNT(*)::bigint FROM public.merchant_menu_categories WHERE store_id = 77)
         END
  UNION ALL
  SELECT 4, 'merchant_store_bank_accounts',
         CASE WHEN to_regclass('public.merchant_store_bank_accounts') IS NULL THEN -1
              ELSE (SELECT COUNT(*)::bigint FROM public.merchant_store_bank_accounts WHERE store_id = 77)
         END
  UNION ALL
  SELECT 5, 'merchant_subscriptions (kept)',
         CASE WHEN to_regclass('public.merchant_subscriptions') IS NULL THEN -1
              ELSE (SELECT COUNT(*)::bigint FROM public.merchant_subscriptions WHERE store_id = 77)
         END
  UNION ALL
  SELECT 6, 'store_staff',
         CASE WHEN to_regclass('public.store_staff') IS NULL THEN -1
              ELSE (SELECT COUNT(*)::bigint FROM public.store_staff WHERE store_id = 77)
         END
) c
ORDER BY ord;

-- KOT counter (optional)
SELECT
  CASE WHEN to_regclass('public.store_kot_counters') IS NULL THEN NULL
       ELSE (SELECT last_value FROM public.store_kot_counters WHERE store_id = 77)
  END AS kot_last_value;

-- >>> PERMANENT — COMMIT is ON. To dry-run: comment COMMIT and uncomment ROLLBACK. <<<
-- ROLLBACK;
COMMIT;
