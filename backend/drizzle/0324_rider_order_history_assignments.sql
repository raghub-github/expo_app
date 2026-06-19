-- Rider "My Orders" history: fast lookup for ended assignments + backfill stale rows.

CREATE INDEX IF NOT EXISTS order_rider_assignments_rider_history_idx
  ON public.order_rider_assignments (rider_id, updated_at DESC, id DESC)
  WHERE assignment_status IN ('cancelled', 'unassigned', 'rejected', 'completed');

CREATE INDEX IF NOT EXISTS order_rider_assignments_rider_order_core_idx
  ON public.order_rider_assignments (rider_id, order_core_id, updated_at DESC);

-- Close still-open assignment rows when the parent order is already cancelled.
UPDATE public.order_rider_assignments ora
SET
  assignment_status = 'cancelled'::rider_assignment_status,
  cancelled_at = COALESCE(ora.cancelled_at, oc.cancelled_at, ofood.cancelled_at, NOW()),
  is_active = FALSE,
  updated_at = NOW()
FROM public.orders_core oc
LEFT JOIN public.orders_food ofood ON ofood.order_id = oc.id
WHERE ora.order_core_id = oc.id
  AND ora.assignment_status IN ('pending', 'assigned', 'accepted')
  AND (
    oc.status IN ('cancelled', 'failed')
    OR oc.cancelled_at IS NOT NULL
    OR ofood.order_status IN ('CANCELLED', 'RTO')
    OR ofood.cancelled_at IS NOT NULL
  );
