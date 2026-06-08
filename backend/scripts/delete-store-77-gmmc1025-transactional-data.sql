-- =============================================================================
-- PURGE transactional data for merchant store id=77 / public store_id GMMC1025
-- =============================================================================
-- NO temp tables — safe for Supabase SQL Editor (pooled connections).
-- Select the ENTIRE file and Run once.
--
-- KEEPS: merchant_stores row, menu, hours, bank accounts, staff, wallet shell.
-- DELETES: orders, payments ledger, tickets, reviews, complaints, pending carts.
--
-- 1) First run ends with ROLLBACK (dry run).
-- 2) When counts look correct, comment ROLLBACK and uncomment COMMIT.
--
-- WARNING: Irreversible. Does NOT delete customers or riders.
-- =============================================================================

BEGIN;

-- Target store (change both if needed)
-- internal id: 77 | public id: GMMC1025

-- ---------------------------------------------------------------------------
-- Validate store exists
-- ---------------------------------------------------------------------------
SELECT
  ms.id,
  ms.store_id,
  ms.store_name,
  ms.status
FROM public.merchant_stores ms
WHERE ms.id = 77
  AND ms.store_id = 'GMMC1025'
  AND ms.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Preview counts
-- ---------------------------------------------------------------------------
SELECT 'orders_core' AS tbl, COUNT(*)::bigint AS cnt
FROM public.orders_core c
WHERE c.merchant_store_id = 77
UNION ALL
SELECT 'orders_food', COUNT(*)::bigint
FROM public.orders_food f
WHERE f.merchant_store_id = 77
   OR f.order_id IN (SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77)
UNION ALL
SELECT 'pending_orders', COUNT(*)::bigint
FROM public.pending_orders po
WHERE po.merchant_store_id = 77
UNION ALL
SELECT 'unified_tickets (order-linked)', COUNT(*)::bigint
FROM public.unified_tickets t
WHERE t.order_id IN (SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77)
UNION ALL
SELECT 'unified_tickets (store-linked)', COUNT(*)::bigint
FROM public.unified_tickets t
WHERE t.merchant_store_id = 77
UNION ALL
SELECT 'merchant_store_ratings', COUNT(*)::bigint
FROM public.merchant_store_ratings msr
WHERE msr.store_id = 77
UNION ALL
SELECT 'restaurant_reports', COUNT(*)::bigint
FROM public.restaurant_reports rr
WHERE rr.store_id = 77
UNION ALL
SELECT 'customer_ratings_given', COUNT(*)::bigint
FROM public.customer_ratings_given crg
WHERE crg.order_id IN (SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77)
   OR (crg.target_type ILIKE '%merchant%' AND crg.target_id = 77);

-- ---------------------------------------------------------------------------
-- Step 1: Pending checkouts + store-level reviews / complaints
-- ---------------------------------------------------------------------------
DELETE FROM public.pending_orders po
WHERE po.merchant_store_id = 77;

DELETE FROM public.restaurant_reports rr
WHERE rr.store_id = 77;

DELETE FROM public.merchant_store_ratings msr
WHERE msr.store_id = 77;

DELETE FROM public.customer_ratings_given crg
WHERE crg.order_id IN (SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77)
   OR (crg.target_type ILIKE '%merchant%' AND crg.target_id = 77);

-- ---------------------------------------------------------------------------
-- Step 2: Tickets BEFORE orders_core
-- ---------------------------------------------------------------------------
DELETE FROM public.unified_tickets t
WHERE t.order_id IN (SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77);

DELETE FROM public.unified_tickets t
WHERE t.merchant_store_id = 77;

DELETE FROM public.unified_tickets t
WHERE t.service_type::text IN ('FOOD', 'food')
  AND t.ticket_type::text = 'ORDER_RELATED'
  AND EXISTS (
    SELECT 1
    FROM public.orders_core oc
    WHERE oc.merchant_store_id = 77
      AND (
        t.metadata->'customer_help'->>'order_id_app' = oc.id::text
        OR (oc.order_id IS NOT NULL AND t.metadata->'customer_help'->>'order_id_app' = oc.order_id)
        OR (oc.formatted_order_id IS NOT NULL AND t.metadata->'customer_help'->>'order_id_app' = oc.formatted_order_id)
      )
  );

-- ---------------------------------------------------------------------------
-- Step 3–4: Wallet + optional satellites (single DO block, inline subqueries)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.withdrawal_invoices') IS NOT NULL THEN
    DELETE FROM public.withdrawal_invoices wi
    WHERE wi.payout_request_id IN (
      SELECT pr.id FROM public.merchant_payout_requests pr
      WHERE pr.wallet_id IN (
        SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
      )
    );
  END IF;

  IF to_regclass('public.payment_payout_retries') IS NOT NULL THEN
    DELETE FROM public.payment_payout_retries ppr
    WHERE ppr.payout_approval_id IN (
      SELECT ppa.id FROM public.payment_payout_approvals ppa
      WHERE ppa.payout_request_id IN (
        SELECT pr.id FROM public.merchant_payout_requests pr
        WHERE pr.wallet_id IN (
          SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
        )
      )
    );
  END IF;

  IF to_regclass('public.payment_payout_approvals') IS NOT NULL THEN
    DELETE FROM public.payment_payout_approvals ppa
    WHERE ppa.payout_request_id IN (
      SELECT pr.id FROM public.merchant_payout_requests pr
      WHERE pr.wallet_id IN (
        SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
      )
    );
  END IF;

  IF to_regclass('public.merchant_payout_requests') IS NOT NULL THEN
    DELETE FROM public.merchant_payout_requests pr
    WHERE pr.wallet_id IN (
      SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.merchant_wallet_credit_requests') IS NOT NULL THEN
    DELETE FROM public.merchant_wallet_credit_requests cr
    WHERE cr.merchant_store_id = 77
       OR cr.wallet_id IN (
         SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
       );
  END IF;

  IF to_regclass('public.merchant_penalties') IS NOT NULL THEN
    DELETE FROM public.merchant_penalties mp
    WHERE mp.wallet_id IN (
      SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.payment_reversal_ledger') IS NOT NULL THEN
    DELETE FROM public.payment_reversal_ledger prl
    WHERE prl.wallet_id IN (
            SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
          )
       OR prl.order_id IN (
            SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
          );
  END IF;

  IF to_regclass('public.payment_refund_ledger') IS NOT NULL THEN
    DELETE FROM public.payment_refund_ledger prf
    WHERE prf.wallet_id IN (
            SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
          )
       OR prf.order_id IN (
            SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
          );
  END IF;

  IF to_regclass('public.payment_order_settlements') IS NOT NULL THEN
    DELETE FROM public.payment_order_settlements pos
    WHERE pos.wallet_id IN (
            SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
          )
       OR pos.order_id IN (
            SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
          );
  END IF;

  IF to_regclass('public.order_settlement_breakdown') IS NOT NULL THEN
    DELETE FROM public.order_settlement_breakdown osb
    WHERE osb.order_id IN (
            SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
          )
       OR osb.wallet_id IN (
            SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
          );
  END IF;

  IF to_regclass('public.merchant_settlement_batches') IS NOT NULL THEN
    DELETE FROM public.merchant_settlement_batches msb
    WHERE msb.merchant_store_id = 77;
  END IF;

  IF to_regclass('public.merchant_commission_invoices') IS NOT NULL THEN
    DELETE FROM public.merchant_commission_invoices mci
    WHERE mci.merchant_store_id = 77;
  END IF;

  IF to_regclass('public.merchant_wallet_transactions') IS NOT NULL THEN
    DELETE FROM public.merchant_wallet_transactions mwt
    WHERE mwt.wallet_id IN (
      SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.merchant_wallet_ledger') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_merchant_wallet_ledger_no_delete'
        AND tgrelid = 'public.merchant_wallet_ledger'::regclass
    ) THEN
      ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_merchant_wallet_ledger_no_update'
        AND tgrelid = 'public.merchant_wallet_ledger'::regclass
    ) THEN
      ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_update;
    END IF;

    DELETE FROM public.merchant_wallet_ledger mwl
    WHERE mwl.wallet_id IN (
            SELECT w.id FROM public.merchant_wallet w WHERE w.merchant_store_id = 77
          )
       OR (
         mwl.reference_type = 'ORDER'
         AND mwl.reference_id IN (
           SELECT f.id FROM public.orders_food f
           WHERE f.merchant_store_id = 77
              OR f.order_id IN (
                SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
              )
         )
       );

    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_merchant_wallet_ledger_no_delete'
        AND tgrelid = 'public.merchant_wallet_ledger'::regclass
    ) THEN
      ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_merchant_wallet_ledger_no_update'
        AND tgrelid = 'public.merchant_wallet_ledger'::regclass
    ) THEN
      ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_update;
    END IF;
  END IF;

  IF to_regclass('public.merchant_wallet') IS NOT NULL THEN
    UPDATE public.merchant_wallet w
    SET
      available_balance = 0,
      pending_balance = 0,
      hold_balance = 0,
      reserve_balance = 0,
      locked_balance = 0,
      pending_settlement = 0,
      total_earned = 0,
      total_withdrawn = 0,
      total_penalty = 0,
      total_commission_deducted = 0,
      lifetime_credit = 0,
      lifetime_debit = 0,
      settlement_paused = FALSE,
      frozen_reason = NULL,
      status = 'ACTIVE',
      updated_at = NOW()
    WHERE w.merchant_store_id = 77;
  END IF;

  IF to_regclass('public.gm_rule_execution_log') IS NOT NULL THEN
    DELETE FROM public.gm_rule_execution_log gel
    WHERE gel.order_id IN (
            SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
          )
       OR gel.core_order_id IN (
            SELECT c.order_id FROM public.orders_core c
            WHERE c.merchant_store_id = 77 AND c.order_id IS NOT NULL
          )
       OR gel.orders_food_id IN (
            SELECT f.id FROM public.orders_food f
            WHERE f.merchant_store_id = 77
               OR f.order_id IN (
                 SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
               )
          );
  END IF;

  IF to_regclass('public.ledger_entries') IS NOT NULL THEN
    DELETE FROM public.ledger_entries le
    WHERE le.order_id IN (
      SELECT c.order_id FROM public.orders_core c
      WHERE c.merchant_store_id = 77 AND c.order_id IS NOT NULL
      UNION
      SELECT c.formatted_order_id FROM public.orders_core c
      WHERE c.merchant_store_id = 77 AND c.formatted_order_id IS NOT NULL
    );
  END IF;

  IF to_regclass('public.ledger_journals') IS NOT NULL THEN
    DELETE FROM public.ledger_journals lj
    WHERE lj.order_id IN (
      SELECT c.order_id FROM public.orders_core c
      WHERE c.merchant_store_id = 77 AND c.order_id IS NOT NULL
      UNION
      SELECT c.formatted_order_id FROM public.orders_core c
      WHERE c.merchant_store_id = 77 AND c.formatted_order_id IS NOT NULL
    );
  END IF;

  IF to_regclass('public.order_dispatch_rider_notifications') IS NOT NULL
     AND to_regclass('public.order_dispatch_sessions') IS NOT NULL THEN
    DELETE FROM public.order_dispatch_rider_notifications n
    USING public.order_dispatch_sessions s
    WHERE n.session_id = s.id
      AND s.order_core_id IN (
        SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
      );

    DELETE FROM public.order_dispatch_sessions s
    WHERE s.order_core_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.order_rider_dispatch_exclusions') IS NOT NULL THEN
    DELETE FROM public.order_rider_dispatch_exclusions e
    WHERE e.order_core_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.order_rider_dispatch_assignment_audit') IS NOT NULL THEN
    DELETE FROM public.order_rider_dispatch_assignment_audit a
    WHERE a.order_core_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.order_rider_ride_unassignments') IS NOT NULL THEN
    DELETE FROM public.order_rider_ride_unassignments u
    WHERE u.order_core_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.offer_order_applications') IS NOT NULL THEN
    DELETE FROM public.offer_order_applications ooa
    WHERE ooa.order_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.merchant_offer_usages') IS NOT NULL THEN
    DELETE FROM public.merchant_offer_usages mou
    WHERE mou.order_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.merchant_order_food_actions') IS NOT NULL THEN
    DELETE FROM public.merchant_order_food_actions mofa
    WHERE mofa.orders_core_id IN (
            SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
          )
       OR mofa.orders_food_id IN (
            SELECT f.id FROM public.orders_food f
            WHERE f.merchant_store_id = 77
               OR f.order_id IN (
                 SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
               )
          );
  END IF;

  IF to_regclass('public.merchant_store_orders') IS NOT NULL THEN
    DELETE FROM public.merchant_store_orders mso
    WHERE mso.store_id = 77;
  END IF;

  IF to_regclass('public.order_item_addons') IS NOT NULL
     AND to_regclass('public.order_items') IS NOT NULL THEN
    DELETE FROM public.order_item_addons oia
    WHERE oia.order_item_id IN (
      SELECT oi.id FROM public.order_items oi
      WHERE oi.order_id IN (
        SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
      )
    );
  END IF;

  IF to_regclass('public.order_items') IS NOT NULL THEN
    DELETE FROM public.order_items oi
    WHERE oi.order_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.order_food_items') IS NOT NULL THEN
    DELETE FROM public.order_food_items ofi
    WHERE ofi.order_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.order_payments') IS NOT NULL THEN
    DELETE FROM public.order_payments op
    WHERE op.order_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.order_tickets') IS NOT NULL THEN
    DELETE FROM public.order_tickets ot
    WHERE ot.order_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;

  IF to_regclass('public.order_remarks') IS NOT NULL THEN
    DELETE FROM public.order_remarks orm
    WHERE orm.order_id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 5: Delete orders_core (CASCADE → orders_food, timelines, billing, OTPs…)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    DELETE FROM public.orders o
    WHERE o.id IN (
      SELECT c.id FROM public.orders_core c WHERE c.merchant_store_id = 77
    );
  END IF;
END $$;

DELETE FROM public.orders_core c
WHERE c.merchant_store_id = 77;

DELETE FROM public.orders_food f
WHERE f.merchant_store_id = 77;

-- ---------------------------------------------------------------------------
-- Post-check — expect all zeros
-- ---------------------------------------------------------------------------
SELECT 'orders_core left' AS check_label, COUNT(*)::bigint AS cnt
FROM public.orders_core c
WHERE c.merchant_store_id = 77
UNION ALL
SELECT 'orders_food left', COUNT(*)::bigint
FROM public.orders_food f
WHERE f.merchant_store_id = 77
UNION ALL
SELECT 'pending_orders left', COUNT(*)::bigint
FROM public.pending_orders po
WHERE po.merchant_store_id = 77
UNION ALL
SELECT 'unified_tickets (store) left', COUNT(*)::bigint
FROM public.unified_tickets t
WHERE t.merchant_store_id = 77
UNION ALL
SELECT 'merchant_store_ratings left', COUNT(*)::bigint
FROM public.merchant_store_ratings msr
WHERE msr.store_id = 77
UNION ALL
SELECT 'restaurant_reports left', COUNT(*)::bigint
FROM public.restaurant_reports rr
WHERE rr.store_id = 77;

-- >>> PERMANENT DELETE — COMMIT is ON. Run entire file once. Cannot undo. <<<
-- ROLLBACK;
COMMIT;
