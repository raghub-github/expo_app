-- Quick verify: person_ride transactional data should all be 0 after purge.
SELECT 'orders_core person_ride' AS check_label, COUNT(*)::bigint AS cnt
FROM public.orders_core
WHERE order_type = 'person_ride'
UNION ALL
SELECT 'orders_ride rows', COUNT(*)::bigint
FROM public.orders_ride
UNION ALL
SELECT 'unified_tickets ride+order_id', COUNT(*)::bigint
FROM public.unified_tickets ut
WHERE ut.service_type::text IN ('RIDE', 'ride', 'person_ride')
  AND ut.order_id IS NOT NULL
UNION ALL
SELECT 'unified_tickets ORDER_RELATED ride', COUNT(*)::bigint
FROM public.unified_tickets ut
WHERE ut.service_type::text IN ('RIDE', 'ride', 'person_ride')
  AND ut.ticket_type::text = 'ORDER_RELATED'
UNION ALL
SELECT 'order_dispatch_sessions (ride)', COUNT(*)::bigint
FROM public.order_dispatch_sessions s
WHERE s.order_core_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
)
UNION ALL
SELECT 'order_timelines (ride)', COUNT(*)::bigint
FROM public.order_timelines t
WHERE t.order_id IN (
  SELECT oc.id FROM public.orders_core oc WHERE oc.order_type = 'person_ride'
);
