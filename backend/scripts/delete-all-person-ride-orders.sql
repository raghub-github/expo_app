-- =============================================================================
-- DELETE ALL person_ride ORDERS + related data (dev / reset only)
-- =============================================================================
-- Supabase: select the ENTIRE file and Run once (one transaction).
-- Do NOT run step-by-step — temp tables are not used; everything is inline.
--
-- Why tickets failed before:
--   unified_tickets: ORDER_RELATED requires order_id IS NOT NULL.
--   Delete tickets BEFORE orders_core (not SET order_id = NULL).
--
-- WARNING: Irreversible. Does NOT delete riders/customers/vehicles.
-- End: change ROLLBACK to COMMIT when counts look correct.
-- =============================================================================

BEGIN;

-- Step 0: Preview
SELECT 'person_ride orders to delete' AS label, COUNT(*)::bigint AS n
FROM public.orders_core
WHERE order_type = 'person_ride';

-- Step 1: Support tickets (BEFORE orders_core delete)
DELETE FROM public.unified_tickets ut
WHERE ut.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.unified_tickets ut
WHERE ut.service_type::text IN ('RIDE', 'ride')
  AND ut.ticket_type::text = 'ORDER_RELATED'
  AND EXISTS (
    SELECT 1
    FROM public.orders_core oc
    WHERE oc.order_type = 'person_ride'
      AND (
        ut.metadata->'customer_help'->>'order_id_app' = oc.id::text
        OR (oc.order_id IS NOT NULL AND ut.metadata->'customer_help'->>'order_id_app' = oc.order_id)
      )
  );

-- Step 2: Dispatch
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

-- Step 3: Rider assignment / timeline
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

-- Step 4: Satellite rows (orders_core.id bigint)
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

-- Step 5: Rows keyed by business order_id TEXT (GM… / GMP…)
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

-- Step 6: orders_ride + orders_core
DELETE FROM public.orders_ride r
WHERE r.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);

DELETE FROM public.orders_core oc
WHERE oc.order_type = 'person_ride';

-- Step 7: Verify
SELECT 'remaining person_ride orders_core' AS label, COUNT(*)::bigint AS n
FROM public.orders_core
WHERE order_type = 'person_ride';

SELECT 'remaining orders_ride orphans' AS label, COUNT(*)::bigint AS n
FROM public.orders_ride r
LEFT JOIN public.orders_core oc ON oc.id = r.order_id
WHERE oc.id IS NULL;

SELECT 'remaining ride tickets with order_id' AS label, COUNT(*)::bigint AS n
FROM public.unified_tickets
WHERE service_type::text IN ('RIDE', 'ride')
  AND order_id IS NOT NULL;

-- Dry run: nothing saved until you swap to COMMIT.
ROLLBACK;
-- COMMIT;
