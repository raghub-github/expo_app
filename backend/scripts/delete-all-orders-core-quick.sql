-- =============================================================================
-- QUICK: delete ALL orders_core + every related row (Supabase SQL Editor)
-- =============================================================================
-- UI "Delete row" on orders_core FAILS because unified_tickets.order_id FK is
-- ON DELETE SET NULL, but check constraint unified_tickets_order_check requires
-- ORDER_RELATED tickets to keep order_id NOT NULL.
--
-- Fix: run this ENTIRE file once (tickets deleted BEFORE orders_core).
-- Edit nothing unless you want a dry run (use ROLLBACK at bottom).
--
-- KEEPS: customers, riders, merchants, menus, pricing, non-order config.
-- WARNING: Irreversible.
-- =============================================================================

BEGIN;

-- Preview
SELECT 'orders_core' AS tbl, COUNT(*)::bigint AS n FROM public.orders_core;
SELECT 'unified_tickets (order-linked)' AS tbl, COUNT(*)::bigint AS n
FROM public.unified_tickets WHERE order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1) Tickets FIRST (mandatory — do not delete orders_core from Table Editor)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.unified_ticket_messages') IS NOT NULL THEN
    DELETE FROM public.unified_ticket_messages m
    WHERE m.ticket_id IN (
      SELECT ut.id FROM public.unified_tickets ut
      WHERE ut.order_id IS NOT NULL OR ut.ticket_type::text = 'ORDER_RELATED'
    );
  END IF;
  IF to_regclass('public.unified_ticket_activities') IS NOT NULL THEN
    DELETE FROM public.unified_ticket_activities a
    WHERE a.ticket_id IN (
      SELECT ut.id FROM public.unified_tickets ut
      WHERE ut.order_id IS NOT NULL OR ut.ticket_type::text = 'ORDER_RELATED'
    );
  END IF;
  IF to_regclass('public.unified_ticket_activity_audit') IS NOT NULL THEN
    DELETE FROM public.unified_ticket_activity_audit a
    WHERE a.ticket_id IN (
      SELECT ut.id FROM public.unified_tickets ut
      WHERE ut.order_id IS NOT NULL OR ut.ticket_type::text = 'ORDER_RELATED'
    );
  END IF;
  IF to_regclass('public.unified_ticket_merges') IS NOT NULL THEN
    DELETE FROM public.unified_ticket_merges m
    WHERE m.primary_ticket_id IN (
      SELECT ut.id FROM public.unified_tickets ut
      WHERE ut.order_id IS NOT NULL OR ut.ticket_type::text = 'ORDER_RELATED'
    )
    OR m.merged_ticket_id IN (
      SELECT ut.id FROM public.unified_tickets ut
      WHERE ut.order_id IS NOT NULL OR ut.ticket_type::text = 'ORDER_RELATED'
    );
  END IF;
END $$;

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
  IF to_regclass('public.order_tickets') IS NOT NULL THEN DELETE FROM public.order_tickets; END IF;
  IF to_regclass('public.tickets') IS NOT NULL THEN DELETE FROM public.tickets WHERE order_id IS NOT NULL; END IF;
  IF to_regclass('public.pending_orders') IS NOT NULL THEN DELETE FROM public.pending_orders; END IF;
  IF to_regclass('public.group_order_items') IS NOT NULL THEN DELETE FROM public.group_order_items; END IF;
  IF to_regclass('public.group_order_members') IS NOT NULL THEN DELETE FROM public.group_order_members; END IF;
  IF to_regclass('public.group_orders') IS NOT NULL THEN DELETE FROM public.group_orders; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Ratings, offers, merchant order links
-- ---------------------------------------------------------------------------
DELETE FROM public.customer_ratings_given WHERE order_id IN (SELECT id FROM public.orders_core);
DELETE FROM public.merchant_store_ratings WHERE order_id IN (SELECT id FROM public.orders_core);
DELETE FROM public.offer_order_applications WHERE order_id IN (SELECT id FROM public.orders_core);

DO $$
BEGIN
  IF to_regclass('public.merchant_offer_usages') IS NOT NULL THEN
    DELETE FROM public.merchant_offer_usages WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.merchant_store_orders') IS NOT NULL THEN DELETE FROM public.merchant_store_orders; END IF;
  IF to_regclass('public.rider_penalties') IS NOT NULL THEN
    DELETE FROM public.rider_penalties WHERE order_id IS NOT NULL;
  END IF;
  IF to_regclass('public.customer_order_fraud_reports') IS NOT NULL THEN
    DELETE FROM public.customer_order_fraud_reports
    WHERE order_core_id IN (SELECT id FROM public.orders_core);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Wallet / settlement (order-linked)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.payment_order_settlements') IS NOT NULL THEN
    DELETE FROM public.payment_order_settlements WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.payment_refund_ledger') IS NOT NULL THEN
    DELETE FROM public.payment_refund_ledger WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.payment_reversal_ledger') IS NOT NULL THEN
    DELETE FROM public.payment_reversal_ledger WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_settlement_breakdown') IS NOT NULL THEN
    DELETE FROM public.order_settlement_breakdown WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.merchant_wallet_ledger') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_merchant_wallet_ledger_no_delete') THEN
      ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_merchant_wallet_ledger_no_update') THEN
      ALTER TABLE public.merchant_wallet_ledger DISABLE TRIGGER trg_merchant_wallet_ledger_no_update;
    END IF;
    DELETE FROM public.merchant_wallet_ledger
    WHERE reference_type = 'ORDER'
       OR order_id IN (SELECT id FROM public.orders_core);
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_merchant_wallet_ledger_no_delete') THEN
      ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_delete;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_merchant_wallet_ledger_no_update') THEN
      ALTER TABLE public.merchant_wallet_ledger ENABLE TRIGGER trg_merchant_wallet_ledger_no_update;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Order satellites + dispatch + rider assignment
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.order_timelines') IS NOT NULL THEN
    DELETE FROM public.order_timelines WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_partner_chat_messages') IS NOT NULL THEN
    DELETE FROM public.order_partner_chat_messages
    WHERE order_core_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_weather_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_weather_snapshots WHERE order_core_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.food_order_pickup_verifications') IS NOT NULL THEN
    DELETE FROM public.food_order_pickup_verifications WHERE order_core_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.rider_customer_delivery_feedback') IS NOT NULL THEN
    DELETE FROM public.rider_customer_delivery_feedback WHERE order_core_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.merchant_order_food_actions') IS NOT NULL THEN
    DELETE FROM public.merchant_order_food_actions
    WHERE orders_core_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_item_addons') IS NOT NULL AND to_regclass('public.order_items') IS NOT NULL THEN
    DELETE FROM public.order_item_addons oia
    WHERE oia.order_item_id IN (
      SELECT oi.id FROM public.order_items oi WHERE oi.order_id IN (SELECT id FROM public.orders_core)
    );
  END IF;
  IF to_regclass('public.order_items') IS NOT NULL THEN
    DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_food_items') IS NOT NULL THEN DELETE FROM public.order_food_items; END IF;
  IF to_regclass('public.order_payments') IS NOT NULL THEN DELETE FROM public.order_payments; END IF;
  IF to_regclass('public.order_remarks') IS NOT NULL THEN DELETE FROM public.order_remarks; END IF;
  IF to_regclass('public.order_cancellation_reasons') IS NOT NULL THEN
    DELETE FROM public.order_cancellation_reasons WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_refunds') IS NOT NULL THEN
    DELETE FROM public.order_refunds WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_dispatch_rider_notifications') IS NOT NULL
     AND to_regclass('public.order_dispatch_sessions') IS NOT NULL THEN
    DELETE FROM public.order_dispatch_rider_notifications n
    USING public.order_dispatch_sessions s
    WHERE n.session_id = s.id AND s.order_core_id IN (SELECT id FROM public.orders_core);
    DELETE FROM public.order_dispatch_sessions WHERE order_core_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_rider_assignments') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignments
    WHERE order_core_id IN (SELECT id FROM public.orders_core)
       OR order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_rider_assignments_current') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignments_current;
  END IF;
  IF to_regclass('public.order_rider_assignment_timeline_events') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignment_timeline_events
    WHERE order_core_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_rider_assignment_events') IS NOT NULL THEN
    DELETE FROM public.order_rider_assignment_events;
  END IF;
  IF to_regclass('public.order_otps') IS NOT NULL THEN
    DELETE FROM public.order_otps WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
  IF to_regclass('public.order_delivery_images') IS NOT NULL THEN
    DELETE FROM public.order_delivery_images WHERE order_id IN (SELECT id FROM public.orders_core);
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
  IF to_regclass('public.orders_core_items') IS NOT NULL THEN
    DELETE FROM public.orders_core_items i
    WHERE i.order_id IN (SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL);
  END IF;
  IF to_regclass('public.orders_core_payments') IS NOT NULL THEN
    DELETE FROM public.orders_core_payments p
    WHERE p.order_id IN (SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL);
  END IF;
  IF to_regclass('public.payment_intents') IS NOT NULL THEN DELETE FROM public.payment_intents; END IF;
  IF to_regclass('public.payment_transactions') IS NOT NULL THEN DELETE FROM public.payment_transactions; END IF;
  IF to_regclass('public.refund_intents') IS NOT NULL THEN DELETE FROM public.refund_intents; END IF;
  IF to_regclass('public.refund_transactions') IS NOT NULL THEN DELETE FROM public.refund_transactions; END IF;
  IF to_regclass('public.orders') IS NOT NULL THEN
    DELETE FROM public.orders WHERE id IN (SELECT id FROM public.orders_core);
  END IF;
END $$;

DELETE FROM public.order_events e
WHERE e.order_id IN (SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL)
   OR e.order_id IN (SELECT oc.formatted_order_id FROM public.orders_core oc WHERE oc.formatted_order_id IS NOT NULL);

DELETE FROM public.order_notifications n
WHERE n.order_core_id IN (SELECT id FROM public.orders_core)
   OR n.order_id IN (SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL);

DELETE FROM public.order_rider_tracking t
WHERE t.order_id IN (SELECT oc.order_id FROM public.orders_core oc WHERE oc.order_id IS NOT NULL);

DELETE FROM public.rider_location_history WHERE order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5) Vertical tables + orders_core
-- ---------------------------------------------------------------------------
DELETE FROM public.orders_ride WHERE order_id IN (SELECT id FROM public.orders_core);
DELETE FROM public.orders_food WHERE order_id IN (SELECT id FROM public.orders_core);

DO $$
BEGIN
  IF to_regclass('public.orders_parcel') IS NOT NULL THEN
    DELETE FROM public.orders_parcel WHERE order_id IN (SELECT id FROM public.orders_core);
  END IF;
END $$;

DELETE FROM public.orders_core;

-- Orphans
DELETE FROM public.orders_food f
WHERE NOT EXISTS (SELECT 1 FROM public.orders_core oc WHERE oc.id = f.order_id);
DELETE FROM public.orders_ride r
WHERE NOT EXISTS (SELECT 1 FROM public.orders_core oc WHERE oc.id = r.order_id);

SELECT setval(pg_get_serial_sequence('public.orders_core', 'id'), 1, false)
WHERE pg_get_serial_sequence('public.orders_core', 'id') IS NOT NULL;

-- Verify
SELECT 'orders_core left' AS tbl, COUNT(*)::bigint AS n FROM public.orders_core;
SELECT 'order-linked tickets left' AS tbl, COUNT(*)::bigint AS n
FROM public.unified_tickets WHERE order_id IS NOT NULL;

COMMIT;
