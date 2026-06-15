-- =============================================================================
-- PURGE ALL person_ride orders + related data (dev / pre-go-live reset)
-- =============================================================================
-- Run in Supabase SQL Editor: select ENTIRE file → Run once.
--
-- WHY Supabase "Delete row" on orders_core FAILS with:
--   unified_tickets_order_check (ORDER_RELATED requires order_id IS NOT NULL)
-- The FK on unified_tickets uses ON DELETE SET NULL — Postgres tries to NULL
-- order_id when you delete the order, which violates the check constraint.
-- Fix: DELETE tickets FIRST (this script), never delete orders_core from the UI.
--
-- KEEPS: customers, riders, vehicles, pricing config, ticket catalog.
-- DELETES: every orders_core row where order_type = 'person_ride', plus
--          orders_ride, dispatch, payments/ledger rows, support tickets, etc.
--
-- 1) First run: leave COMMIT commented, use ROLLBACK (dry run).
-- 2) When preview counts look correct: comment ROLLBACK, uncomment COMMIT.
--
-- WARNING: Irreversible.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Preview
-- ---------------------------------------------------------------------------
SELECT 'person_ride orders_core' AS label, COUNT(*)::bigint AS n
FROM public.orders_core
WHERE order_type = 'person_ride';

SELECT 'orders_ride' AS label, COUNT(*)::bigint AS n
FROM public.orders_ride r
WHERE r.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

SELECT 'unified_tickets (order_id link)' AS label, COUNT(*)::bigint AS n
FROM public.unified_tickets ut
WHERE ut.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

SELECT 'unified_tickets (ride metadata link)' AS label, COUNT(*)::bigint AS n
FROM public.unified_tickets ut
WHERE ut.service_type::text IN ('RIDE', 'ride', 'person_ride')
  AND (
    ut.metadata->'customer_help'->>'section_id' = 'rides'
    OR ut.metadata->'customer_help'->>'order_id_app' IN (
      SELECT oc.id::text FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    )
    OR ut.metadata->'customer_help'->>'order_id_app' IN (
      SELECT oc.order_id FROM public.orders_core oc
      WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
    )
    OR ut.metadata->'customer_help'->>'order_id_app' IN (
      SELECT oc.formatted_order_id FROM public.orders_core oc
      WHERE oc.order_type = 'person_ride' AND oc.formatted_order_id IS NOT NULL
    )
  );

-- ---------------------------------------------------------------------------
-- Step 1: Support tickets BEFORE orders_core (mandatory)
-- unified_ticket_messages / activities CASCADE on ticket delete.
-- ---------------------------------------------------------------------------
DELETE FROM public.unified_tickets ut
WHERE ut.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.unified_tickets ut
WHERE ut.service_type::text IN ('RIDE', 'ride', 'person_ride')
  AND ut.ticket_type::text = 'ORDER_RELATED'
  AND (
    ut.metadata->'customer_help'->>'section_id' = 'rides'
    OR EXISTS (
      SELECT 1
      FROM public.orders_core oc
      WHERE oc.order_type = 'person_ride'
        AND (
          ut.metadata->'customer_help'->>'order_id_app' = oc.id::text
          OR (oc.order_id IS NOT NULL AND ut.metadata->'customer_help'->>'order_id_app' = oc.order_id)
          OR (oc.formatted_order_id IS NOT NULL AND ut.metadata->'customer_help'->>'order_id_app' = oc.formatted_order_id)
        )
    )
    OR ut.subject ILIKE '%GMP%'
    OR ut.description ILIKE '%Ride #GMP%'
  );

-- Legacy order_tickets table (if present)
DO $$
BEGIN
  IF to_regclass('public.order_tickets') IS NOT NULL THEN
    DELETE FROM public.order_tickets ot
    WHERE ot.order_id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Step 2–N: Satellites + ledger (optional tables guarded)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.order_timelines') IS NOT NULL THEN
    DELETE FROM public.order_timelines t
    WHERE t.order_id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    );
  END IF;

  IF to_regclass('public.order_weather_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_weather_snapshots w
    WHERE w.order_core_id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    );
  END IF;

  IF to_regclass('public.rider_customer_delivery_feedback') IS NOT NULL THEN
    DELETE FROM public.rider_customer_delivery_feedback f
    WHERE f.order_core_id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    );
  END IF;

  IF to_regclass('public.order_item_addon_commission_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_item_addon_commission_snapshots s
    WHERE s.order_id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    );
  END IF;

  IF to_regclass('public.order_item_commission_snapshots') IS NOT NULL THEN
    DELETE FROM public.order_item_commission_snapshots s
    WHERE s.order_id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    );
  END IF;

  IF to_regclass('public.orders_core_item_addons') IS NOT NULL
     AND to_regclass('public.orders_core_items') IS NOT NULL THEN
    DELETE FROM public.orders_core_item_addons a
    WHERE a.order_item_id IN (
      SELECT i.id FROM public.orders_core_items i
      WHERE i.order_id IN (
        SELECT oc.order_id FROM public.orders_core oc
        WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
      )
    );
  END IF;

  IF to_regclass('public.gm_rule_execution_log') IS NOT NULL THEN
    DELETE FROM public.gm_rule_execution_log gel
    WHERE gel.order_id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    )
       OR gel.core_order_id IN (
      SELECT oc.order_id FROM public.orders_core oc
      WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
    );
  END IF;

  IF to_regclass('public.customer_ratings_given') IS NOT NULL THEN
    DELETE FROM public.customer_ratings_given crg
    WHERE crg.order_id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    );
  END IF;

  IF to_regclass('public.offer_order_applications') IS NOT NULL THEN
    DELETE FROM public.offer_order_applications ooa
    WHERE ooa.order_id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    );
  END IF;

  IF to_regclass('public.payment_events') IS NOT NULL THEN
    DELETE FROM public.payment_events pe
    WHERE pe.order_id IN (
      SELECT oc.order_id FROM public.orders_core oc
      WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
    );
  END IF;
END $$;

-- Dispatch
DELETE FROM public.order_dispatch_rider_notifications n
USING public.order_dispatch_sessions s
WHERE n.session_id = s.id
  AND s.order_core_id IN (
    SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
  );

DELETE FROM public.order_dispatch_sessions s
WHERE s.order_core_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_rider_dispatch_exclusions e
WHERE e.order_core_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_rider_dispatch_assignment_audit a
WHERE a.order_core_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_rider_ride_unassignments u
WHERE u.order_core_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

-- Rider assignment / timeline
DELETE FROM public.order_rider_assignment_timeline_events e
WHERE e.order_core_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_rider_assignments a
WHERE a.order_core_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
)
   OR a.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

-- Satellite rows keyed by orders_core.id (bigint)
DELETE FROM public.order_otps o
WHERE o.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_delivery_images i
WHERE i.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_route_snapshots r
WHERE r.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_provider_mapping m
WHERE m.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_eta_history h
WHERE h.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_donations d
WHERE d.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.merchant_store_ratings msr
WHERE msr.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

-- Rows keyed by business order_id TEXT (GM… / GMP…)
DELETE FROM public.order_events e
WHERE e.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
)
   OR e.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.order_notifications n
WHERE n.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
)
   OR n.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.order_rider_tracking t
WHERE t.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
)
   OR t.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.delivery_assignments d
WHERE d.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
)
   OR d.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.order_tracking_tokens tok
WHERE tok.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
)
   OR tok.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.rider_location_history h
WHERE h.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
)
   OR h.order_id IN (
  SELECT oc.formatted_order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.formatted_order_id IS NOT NULL
);

DELETE FROM public.orders_core_items i
WHERE i.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.orders_core_payments pay
WHERE pay.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.order_version_snapshots s
WHERE s.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.order_charge_lines c
WHERE c.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.order_tax_lines t
WHERE t.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.order_discount_lines d
WHERE d.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.order_bill_summary_versions b
WHERE b.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.payment_intents pi
WHERE pi.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.payment_transactions pt
WHERE pt.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.refund_intents ri
WHERE ri.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.refund_transactions rt
WHERE rt.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.refund_line_items rli
WHERE rli.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.tax_reversal_lines trl
WHERE trl.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.rider_tracking_points rtp
WHERE rtp.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
);

DELETE FROM public.order_rider_assignment_events e
WHERE e.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
)
   OR e.order_id::text IN (
  SELECT oc.id::text FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.order_rider_assignments_current c
WHERE c.order_id IN (
  SELECT oc.order_id FROM public.orders_core oc
  WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
)
   OR c.order_id::text IN (
  SELECT oc.id::text FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DO $$
BEGIN
  IF to_regclass('public.ledger_entries') IS NOT NULL THEN
    DELETE FROM public.ledger_entries le
    WHERE le.order_id IN (
      SELECT oc.order_id FROM public.orders_core oc
      WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
      UNION
      SELECT oc.formatted_order_id FROM public.orders_core oc
      WHERE oc.order_type = 'person_ride' AND oc.formatted_order_id IS NOT NULL
    );
  END IF;

  IF to_regclass('public.ledger_journals') IS NOT NULL THEN
    DELETE FROM public.ledger_journals lj
    WHERE lj.order_id IN (
      SELECT oc.order_id FROM public.orders_core oc
      WHERE oc.order_type = 'person_ride' AND oc.order_id IS NOT NULL
      UNION
      SELECT oc.formatted_order_id FROM public.orders_core oc
      WHERE oc.order_type = 'person_ride' AND oc.formatted_order_id IS NOT NULL
    );
  END IF;

  -- Legacy orders table (unified_tickets.order_id may still reference orders.id)
  IF to_regclass('public.orders') IS NOT NULL THEN
    DELETE FROM public.orders o
    WHERE o.id IN (
      SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
    );
  END IF;
END $$;

-- orders_ride + orders_core
DELETE FROM public.orders_ride r
WHERE r.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.orders_core oc
WHERE oc.order_type = 'person_ride';

-- ---------------------------------------------------------------------------
-- Post-check — expect zeros
-- ---------------------------------------------------------------------------
SELECT 'remaining person_ride orders_core' AS label, COUNT(*)::bigint AS n
FROM public.orders_core
WHERE order_type = 'person_ride';

SELECT 'remaining orders_ride orphans' AS label, COUNT(*)::bigint AS n
FROM public.orders_ride r
LEFT JOIN public.orders_core oc ON oc.id = r.order_id
WHERE oc.id IS NULL;

SELECT 'remaining ride tickets (order_id set)' AS label, COUNT(*)::bigint AS n
FROM public.unified_tickets
WHERE service_type::text IN ('RIDE', 'ride', 'person_ride')
  AND order_id IS NOT NULL;

SELECT 'remaining ride ORDER_RELATED tickets' AS label, COUNT(*)::bigint AS n
FROM public.unified_tickets
WHERE service_type::text IN ('RIDE', 'ride', 'person_ride')
  AND ticket_type::text = 'ORDER_RELATED';

-- Dry run first:
ROLLBACK;
-- When counts above are all 0, swap to:
-- COMMIT;
