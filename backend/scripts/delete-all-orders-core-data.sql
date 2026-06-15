-- =============================================================================
-- PRODUCTION GO-LIVE: purge ALL order transactional test data
-- =============================================================================
-- Run in Supabase SQL Editor OR:
--   cd backend && npx tsx scripts/run-sql-migration.ts scripts/delete-all-orders-core-data.sql
--
-- DELETES: orders_core + orders_food/ride/parcel, payments, refunds, ledger,
--          dispatch, rider assignment/history/tracking, partner chat, ETA,
--          ratings, offers, group orders, pending checkouts, order tickets,
--          merchant wallet order settlements (balances reset to 0).
--
-- KEEPS: customers, riders, merchants, menus, pricing rules, ticket catalog,
--        addresses, subscriptions shell (non-order billing rows).
--
-- 1) First run with ROLLBACK (default below) — check preview + post-check.
-- 2) Then comment ROLLBACK and uncomment COMMIT for permanent delete.
--
-- WARNING: Irreversible.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Preview (before)
-- ---------------------------------------------------------------------------
SELECT 'orders_core' AS tbl, COUNT(*)::bigint AS n FROM public.orders_core;
SELECT 'orders_food' AS tbl, COUNT(*)::bigint AS n FROM public.orders_food;
SELECT 'orders_ride' AS tbl, COUNT(*)::bigint AS n FROM public.orders_ride;
SELECT 'unified_tickets (order-linked)' AS tbl, COUNT(*)::bigint AS n
FROM public.unified_tickets WHERE order_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.pending_orders') IS NOT NULL THEN
    RAISE NOTICE 'pending_orders: %', (SELECT COUNT(*)::bigint FROM public.pending_orders);
  END IF;
  IF to_regclass('public.payment_intents') IS NOT NULL THEN
    RAISE NOTICE 'payment_intents: %', (SELECT COUNT(*)::bigint FROM public.payment_intents);
  END IF;
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN
    RAISE NOTICE 'payment_transactions: %', (SELECT COUNT(*)::bigint FROM public.payment_transactions);
  END IF;
  IF to_regclass('public.group_orders') IS NOT NULL THEN
    RAISE NOTICE 'group_orders: %', (SELECT COUNT(*)::bigint FROM public.group_orders);
  END IF;
  IF to_regclass('public.rider_location_history') IS NOT NULL THEN
    RAISE NOTICE 'rider_location_history (with order): %',
      (SELECT COUNT(*)::bigint FROM public.rider_location_history WHERE order_id IS NOT NULL);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 1: Group orders + abandoned checkouts (full wipe)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.group_order_items') IS NOT NULL THEN
    DELETE FROM public.group_order_items;
  END IF;
  IF to_regclass('public.group_order_members') IS NOT NULL THEN
    DELETE FROM public.group_order_members;
  END IF;
  IF to_regclass('public.group_orders') IS NOT NULL THEN
    DELETE FROM public.group_orders;
  END IF;
  IF to_regclass('public.pending_orders') IS NOT NULL THEN
    DELETE FROM public.pending_orders;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 2: Support tickets BEFORE orders_core (mandatory — UI delete fails)
-- ---------------------------------------------------------------------------
DELETE FROM public.unified_tickets ut
WHERE ut.order_id IS NOT NULL
   OR ut.ticket_type::text = 'ORDER_RELATED';

DELETE FROM public.unified_tickets ut
WHERE EXISTS (
  SELECT 1 FROM public.orders_core oc
  WHERE ut.metadata->'customer_help'->>'order_id_app' = oc.id::text
     OR (oc.order_id IS NOT NULL AND ut.metadata->'customer_help'->>'order_id_app' = oc.order_id)
     OR (oc.formatted_order_id IS NOT NULL AND ut.metadata->'customer_help'->>'order_id_app' = oc.formatted_order_id)
);

DO $$
BEGIN
  IF to_regclass('public.order_tickets') IS NOT NULL THEN
    DELETE FROM public.order_tickets;
  END IF;
  IF to_regclass('public.tickets') IS NOT NULL THEN
    DELETE FROM public.tickets WHERE order_id IS NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 3: Ratings, offers, fraud reports, merchant order views
-- ---------------------------------------------------------------------------
DELETE FROM public.customer_ratings_given crg
WHERE crg.order_id IN (SELECT oc.id FROM public.orders_core oc);

DELETE FROM public.merchant_store_ratings msr
WHERE msr.order_id IN (SELECT oc.id FROM public.orders_core oc);

DELETE FROM public.offer_order_applications ooa
WHERE ooa.order_id IN (SELECT oc.id FROM public.orders_core oc);

DO $$
BEGIN
  IF to_regclass('public.merchant_offer_usages') IS NOT NULL THEN
    DELETE FROM public.merchant_offer_usages mou
    WHERE mou.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;
  IF to_regclass('public.restaurant_reports') IS NOT NULL THEN
    DELETE FROM public.restaurant_reports;
  END IF;
  IF to_regclass('public.merchant_store_orders') IS NOT NULL THEN
    DELETE FROM public.merchant_store_orders;
  END IF;
  IF to_regclass('public.rider_penalties') IS NOT NULL THEN
    DELETE FROM public.rider_penalties rp WHERE rp.order_id IS NOT NULL;
  END IF;
  IF to_regclass('public.ratings') IS NOT NULL THEN
    DELETE FROM public.ratings r WHERE r.order_id IS NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 4: Merchant wallet / settlement rows tied to orders (all stores)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.payment_order_settlements') IS NOT NULL THEN
    DELETE FROM public.payment_order_settlements pos
    WHERE pos.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.payment_refund_ledger') IS NOT NULL THEN
    DELETE FROM public.payment_refund_ledger prf
    WHERE prf.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.payment_reversal_ledger') IS NOT NULL THEN
    DELETE FROM public.payment_reversal_ledger prl
    WHERE prl.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_settlement_breakdown') IS NOT NULL THEN
    DELETE FROM public.order_settlement_breakdown osb
    WHERE osb.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.merchant_settlement_batches') IS NOT NULL THEN
    DELETE FROM public.merchant_settlement_batches;
  END IF;

  IF to_regclass('public.merchant_commission_invoices') IS NOT NULL THEN
    DELETE FROM public.merchant_commission_invoices;
  END IF;

  IF to_regclass('public.merchant_wallet_transactions') IS NOT NULL THEN
    DELETE FROM public.merchant_wallet_transactions;
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

    DELETE FROM public.merchant_wallet_ledger;

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
      updated_at = NOW();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 5: Order satellites (guarded)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.order_timelines') IS NOT NULL THEN
    DELETE FROM public.order_timelines t
    WHERE t.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_timeline') IS NOT NULL THEN
    DELETE FROM public.order_timeline;
  END IF;

  IF to_regclass('public.order_weather_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_weather_snapshots w
    WHERE w.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.rider_customer_delivery_feedback') IS NOT NULL THEN
    DELETE FROM public.rider_customer_delivery_feedback f
    WHERE f.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.rider_merchant_pickup_feedback') IS NOT NULL THEN
    DELETE FROM public.rider_merchant_pickup_feedback f
    WHERE f.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.food_order_pickup_verifications') IS NOT NULL THEN
    DELETE FROM public.food_order_pickup_verifications f
    WHERE f.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_eta_accuracy_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_eta_accuracy_snapshots e
    WHERE e.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_rider_wait_escalations') IS NOT NULL THEN
    DELETE FROM public.order_rider_wait_escalations e
    WHERE e.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_kitchen_timeline') IS NOT NULL THEN
    DELETE FROM public.order_kitchen_timeline;
  END IF;

  IF to_regclass('public.order_eta_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_eta_snapshots;
  END IF;

  IF to_regclass('public.order_partner_chat_messages') IS NOT NULL THEN
    DELETE FROM public.order_partner_chat_messages m
    WHERE m.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_item_addon_commission_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_item_addon_commission_snapshots s
    WHERE s.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_item_commission_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_item_commission_snapshots s
    WHERE s.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.orders_core_item_addons') IS NOT NULL
     AND to_regclass('public.orders_core_items') IS NOT NULL THEN
    DELETE FROM public.orders_core_item_addons a
    WHERE a.order_item_id IN (
      SELECT i.id FROM public.orders_core_items i
      WHERE i.order_id IN (
        SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
      )
    );
  END IF;

  IF to_regclass('public.gm_rule_execution_log') IS NOT NULL THEN
    DELETE FROM public.gm_rule_execution_log gel
    WHERE gel.order_id IN (SELECT oc.id FROM public.orders_core oc)
       OR gel.core_order_id IN (
         SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
       )
       OR gel.orders_food_id IN (SELECT f.id FROM public.orders_food f);
  END IF;

  IF to_regclass('public.merchant_order_food_actions') IS NOT NULL THEN
    DELETE FROM public.merchant_order_food_actions mofa
    WHERE mofa.orders_core_id IN (SELECT oc.id FROM public.orders_core oc)
       OR mofa.orders_food_id IN (SELECT f.id FROM public.orders_food f);
  END IF;

  IF to_regclass('public.order_actions') IS NOT NULL THEN
    DELETE FROM public.order_actions oa
    WHERE oa.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_food_items') IS NOT NULL THEN
    DELETE FROM public.order_food_items;
  END IF;

  IF to_regclass('public.order_items') IS NOT NULL THEN
    DELETE FROM public.order_items oi
    WHERE oi.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_item_addons') IS NOT NULL THEN
    DELETE FROM public.order_item_addons;
  END IF;

  IF to_regclass('public.order_payments') IS NOT NULL THEN
    DELETE FROM public.order_payments;
  END IF;

  IF to_regclass('public.order_status_history') IS NOT NULL THEN
    DELETE FROM public.order_status_history;
  END IF;

  IF to_regclass('public.order_remarks') IS NOT NULL THEN
    DELETE FROM public.order_remarks;
  END IF;

  IF to_regclass('public.core_orders') IS NOT NULL THEN
    DELETE FROM public.core_order_item_addons;
    DELETE FROM public.core_order_items;
    DELETE FROM public.core_payments;
    DELETE FROM public.core_orders;
  END IF;
END $$;

-- Dispatch + rider assignment
DO $$
BEGIN
  IF to_regclass('public.order_dispatch_rider_notifications') IS NOT NULL
     AND to_regclass('public.order_dispatch_sessions') IS NOT NULL THEN
    DELETE FROM public.order_dispatch_rider_notifications n
    USING public.order_dispatch_sessions s
    WHERE n.session_id = s.id
      AND s.order_core_id IN (SELECT oc.id FROM public.orders_core oc);

    DELETE FROM public.order_dispatch_sessions s
    WHERE s.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_rider_dispatch_exclusions') IS NOT NULL THEN
    DELETE FROM public.order_rider_dispatch_exclusions e
    WHERE e.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_rider_dispatch_assignment_audit') IS NOT NULL THEN
    DELETE FROM public.order_rider_dispatch_assignment_audit a
    WHERE a.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_rider_ride_unassignments') IS NOT NULL THEN
    DELETE FROM public.order_rider_ride_unassignments u
    WHERE u.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_rider_assignment_timeline_events') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignment_timeline_events e
    WHERE e.order_core_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_rider_assignments') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignments a
    WHERE a.order_core_id IN (SELECT oc.id FROM public.orders_core oc)
       OR a.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_otps') IS NOT NULL THEN
    DELETE FROM public.order_otps o
    WHERE o.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_delivery_images') IS NOT NULL THEN
    DELETE FROM public.order_delivery_images i
    WHERE i.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_route_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_route_snapshots r
    WHERE r.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_provider_mapping') IS NOT NULL THEN
    DELETE FROM public.order_provider_mapping m
    WHERE m.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_eta_history') IS NOT NULL THEN
    DELETE FROM public.order_eta_history h
    WHERE h.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_donations') IS NOT NULL THEN
    DELETE FROM public.order_donations d
    WHERE d.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.delivery_assignments') IS NOT NULL THEN
    DELETE FROM public.delivery_assignments d
    WHERE d.order_id IN (
      SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
    )
       OR d.order_id IN (
      SELECT oc.formatted_order_id FROM public.orders_core oc WHERE oc.formatted_order_id IS NOT NULL
    );
  END IF;

  IF to_regclass('public.order_rider_assignment_events') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignment_events e
    WHERE e.order_id IN (
      SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
    )
       OR e.order_id::text IN (SELECT oc.id::text FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.order_rider_assignments_current') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignments_current c
    WHERE c.order_id IN (
      SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
    )
       OR c.order_id::text IN (SELECT oc.id::text FROM public.orders_core oc);
  END IF;

  IF to_regclass('public.orders_parcel') IS NOT NULL THEN
    DELETE FROM public.orders_parcel p
    WHERE p.order_id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;
END $$;

-- Text order_id keys (GM… / GMF…)
DELETE FROM public.order_events e
WHERE e.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
)
   OR e.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc WHERE oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.order_notifications n
WHERE n.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
)
   OR n.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc WHERE oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.order_rider_tracking t
WHERE t.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
)
   OR t.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc WHERE oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.order_tracking_tokens tok
WHERE tok.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
)
   OR tok.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc WHERE oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.rider_location_history h
WHERE h.order_id IS NOT NULL;

DELETE FROM public.orders_core_items i
WHERE i.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
);

DELETE FROM public.orders_core_payments pay
WHERE pay.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL
);

-- Billing / payment pipeline (full wipe — all rows are order checkout data)
DO $$
BEGIN
  IF to_regclass('public.order_version_snapshots') IS NOT NULL THEN DELETE FROM public.order_version_snapshots; END IF;
  IF to_regclass('public.order_charge_lines') IS NOT NULL THEN DELETE FROM public.order_charge_lines; END IF;
  IF to_regclass('public.order_tax_lines') IS NOT NULL THEN DELETE FROM public.order_tax_lines; END IF;
  IF to_regclass('public.order_discount_lines') IS NOT NULL THEN DELETE FROM public.order_discount_lines; END IF;
  IF to_regclass('public.order_bill_summary_versions') IS NOT NULL THEN DELETE FROM public.order_bill_summary_versions; END IF;
  IF to_regclass('public.tax_reversal_lines') IS NOT NULL THEN DELETE FROM public.tax_reversal_lines; END IF;
  IF to_regclass('public.refund_line_items') IS NOT NULL THEN DELETE FROM public.refund_line_items; END IF;
  IF to_regclass('public.refund_transactions') IS NOT NULL THEN DELETE FROM public.refund_transactions; END IF;
  IF to_regclass('public.refund_intents') IS NOT NULL THEN DELETE FROM public.refund_intents; END IF;
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN DELETE FROM public.payment_transactions; END IF;
  IF to_regclass('public.payment_intents') IS NOT NULL THEN DELETE FROM public.payment_intents; END IF;
  IF to_regclass('public.payment_events') IS NOT NULL THEN DELETE FROM public.payment_events; END IF;
  IF to_regclass('public.ledger_entries') IS NOT NULL THEN DELETE FROM public.ledger_entries; END IF;
  IF to_regclass('public.ledger_journals') IS NOT NULL THEN DELETE FROM public.ledger_journals; END IF;
  IF to_regclass('public.rider_tracking_points') IS NOT NULL THEN DELETE FROM public.rider_tracking_points; END IF;

  IF to_regclass('public.orders') IS NOT NULL THEN
    DELETE FROM public.orders o
    WHERE o.id IN (SELECT oc.id FROM public.orders_core oc);
  END IF;
END $$;

-- Vertical extensions + core
DELETE FROM public.orders_ride r
WHERE r.order_id IN (SELECT oc.id FROM public.orders_core oc);

DELETE FROM public.orders_food f
WHERE f.order_id IN (SELECT oc.id FROM public.orders_core oc);

DELETE FROM public.orders_core;

-- Orphan cleanup
DELETE FROM public.orders_food f
WHERE NOT EXISTS (SELECT 1 FROM public.orders_core oc WHERE oc.id = f.order_id);

DELETE FROM public.orders_ride r
WHERE NOT EXISTS (SELECT 1 FROM public.orders_core oc WHERE oc.id = r.order_id);

DO $$
BEGIN
  IF to_regclass('public.orders_parcel') IS NOT NULL THEN
    DELETE FROM public.orders_parcel p
    WHERE NOT EXISTS (SELECT 1 FROM public.orders_core oc WHERE oc.id = p.order_id);
  END IF;
END $$;

-- Reset sequences (next order starts fresh)
SELECT setval(pg_get_serial_sequence('public.orders_core', 'id'), 1, false)
WHERE pg_get_serial_sequence('public.orders_core', 'id') IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Post-check — expect zeros
-- ---------------------------------------------------------------------------
SELECT 'orders_core left' AS tbl, COUNT(*)::bigint AS n FROM public.orders_core;
SELECT 'orders_food left' AS tbl, COUNT(*)::bigint AS n FROM public.orders_food;
SELECT 'orders_ride left' AS tbl, COUNT(*)::bigint AS n FROM public.orders_ride;
SELECT 'order-linked tickets left' AS tbl, COUNT(*)::bigint AS n
FROM public.unified_tickets WHERE order_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.pending_orders') IS NOT NULL THEN
    RAISE NOTICE 'pending_orders left: %', (SELECT COUNT(*)::bigint FROM public.pending_orders);
  END IF;
  IF to_regclass('public.payment_intents') IS NOT NULL THEN
    RAISE NOTICE 'payment_intents left: %', (SELECT COUNT(*)::bigint FROM public.payment_intents);
  END IF;
  IF to_regclass('public.rider_location_history') IS NOT NULL THEN
    RAISE NOTICE 'rider_location_history left: %',
      (SELECT COUNT(*)::bigint FROM public.rider_location_history WHERE order_id IS NOT NULL);
  END IF;
END $$;

-- Dry run first:
ROLLBACK;
-- Permanent delete — comment ROLLBACK above and uncomment:
-- COMMIT;
