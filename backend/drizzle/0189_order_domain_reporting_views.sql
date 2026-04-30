-- Order domain: reporting views + documentation comments (additive, idempotent).
-- Canonical key for app orders: orders_core.order_id (text, e.g. GM10000001).

COMMENT ON TABLE pending_orders IS
  'Pre-payment checkout session: cart snapshot, billing_snapshot, Razorpay amount; finalized_order_id → orders_core.order_id when paid.';

COMMENT ON TABLE orders_core IS
  'Canonical order header after payment: text order_id, money fields, billing_snapshot JSON, status lifecycle.';

COMMENT ON TABLE orders_core_items IS
  'Normalized line items for orders_core.order_id; addons in orders_core_item_addons.';

COMMENT ON TABLE orders_core_payments IS
  'Gateway payment rows (e.g. Razorpay) linked by orders_core.order_id.';

COMMENT ON TABLE orders_food IS
  'Food vertical extension: synced from orders_core via triggers; join on core_order_id = orders_core.order_id or order_id = orders_core.id.';

COMMENT ON TABLE orders_parcel IS
  'Parcel vertical extension; FK to orders_core.id.';

COMMENT ON TABLE orders_ride IS
  'Ride vertical extension; FK to orders_core.id.';

COMMENT ON TABLE order_events IS
  'Append-only status/timeline events; order_id = orders_core.order_id.';

-- Unified read model for dashboards (food only; safe LEFT JOIN)
CREATE OR REPLACE VIEW v_order_domain_food AS
SELECT
  oc.id AS orders_core_pk,
  oc.order_id AS canonical_order_id,
  oc.order_uuid,
  oc.order_type,
  oc.order_source,
  oc.customer_id,
  oc.merchant_store_id,
  oc.merchant_parent_id,
  oc.status AS core_status,
  oc.current_status,
  oc.item_total,
  oc.addon_total,
  oc.grand_total,
  oc.tip_amount,
  oc.payment_status,
  oc.payment_method,
  oc.billing_ruleset_version,
  oc.placed_at,
  oc.cancelled_at,
  oc.distance_km AS route_distance_km,
  of.id AS orders_food_pk,
  of.order_status AS food_vertical_status,
  of.restaurant_name,
  of.food_items_count,
  of.food_items_total_value,
  of.core_order_id
FROM orders_core oc
LEFT JOIN orders_food of
  ON of.core_order_id = oc.order_id
  OR of.order_id = oc.id
WHERE oc.order_type = 'food';

COMMENT ON VIEW v_order_domain_food IS
  'Reporting: orders_core + orders_food. Legacy public.orders (wide table) is separate; do not mix without a migration plan.';

-- Latest payment row per canonical order (when multiple attempts exist)
CREATE OR REPLACE VIEW v_order_core_payments_latest AS
SELECT DISTINCT ON (p.order_id)
  p.order_id AS canonical_order_id,
  p.id AS payment_row_id,
  p.payment_gateway,
  p.payment_method,
  p.transaction_id,
  p.amount,
  p.currency,
  p.payment_status,
  p.paid_at,
  p.created_at
FROM orders_core_payments p
WHERE p.order_id IS NOT NULL
ORDER BY p.order_id, p.paid_at DESC NULLS LAST, p.id DESC;

COMMENT ON VIEW v_order_core_payments_latest IS
  'Latest orders_core_payments row per order_id for support dashboards.';
