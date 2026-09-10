-- Backfill: self-pickup (and any food order) already DELIVERED on food/current_status
-- but still stuck on orders_core.status = 'assigned' for Coredash / GMV.

UPDATE orders_core oc
SET
  status = 'delivered',
  actual_delivery_time = COALESCE(
    oc.actual_delivery_time,
    ofood.delivered_at,
    oc.updated_at,
    NOW()
  ),
  updated_at = NOW()
FROM orders_food ofood
WHERE ofood.order_id = oc.id
  AND UPPER(REPLACE(COALESCE(ofood.order_status, ''), 'NEW', 'CREATED')) = 'DELIVERED'
  AND LOWER(COALESCE(oc.status::text, '')) <> 'delivered'
  AND LOWER(COALESCE(oc.status::text, '')) NOT IN ('cancelled', 'canceled');
