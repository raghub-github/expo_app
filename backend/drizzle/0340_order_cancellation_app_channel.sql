-- Mirror of dashboard/drizzle/0340_order_cancellation_app_channel.sql

ALTER TABLE public.order_cancellation_reason_catalog
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'web';

ALTER TABLE public.order_cancellation_reason_catalog
  ADD COLUMN IF NOT EXISTS service_type TEXT NULL;

UPDATE public.order_cancellation_reason_catalog
SET channel = 'web'
WHERE channel IS NULL OR btrim(channel) = '';

ALTER TABLE public.order_cancellation_reason_catalog
  DROP CONSTRAINT IF EXISTS order_cancellation_reason_catalog_channel_check;

ALTER TABLE public.order_cancellation_reason_catalog
  ADD CONSTRAINT order_cancellation_reason_catalog_channel_check
  CHECK (channel IN ('web', 'app'));

ALTER TABLE public.order_cancellation_reason_catalog
  DROP CONSTRAINT IF EXISTS order_cancellation_reason_catalog_service_type_check;

ALTER TABLE public.order_cancellation_reason_catalog
  ADD CONSTRAINT order_cancellation_reason_catalog_service_type_check
  CHECK (service_type IS NULL OR service_type IN ('food', 'person_ride', 'parcel'));

ALTER TABLE public.order_cancellation_reason_catalog
  DROP CONSTRAINT IF EXISTS order_cancellation_reason_catalog_attr_label_uq;

DROP INDEX IF EXISTS public.order_cancellation_reason_catalog_channel_attr_label_uq;

CREATE UNIQUE INDEX order_cancellation_reason_catalog_channel_attr_label_uq
  ON public.order_cancellation_reason_catalog (channel, attribute, label);

CREATE INDEX IF NOT EXISTS order_cancellation_reason_catalog_channel_idx
  ON public.order_cancellation_reason_catalog (channel);

CREATE INDEX IF NOT EXISTS order_cancellation_reason_catalog_app_active_idx
  ON public.order_cancellation_reason_catalog (channel, attribute, service_type)
  WHERE channel = 'app' AND is_active = TRUE;

COMMENT ON COLUMN public.order_cancellation_reason_catalog.channel IS
  'web = dashboard order cancel/refund; app = rider/merchant/customer mobile apps';
COMMENT ON COLUMN public.order_cancellation_reason_catalog.service_type IS
  'Optional filter: food, person_ride, parcel; NULL applies to all service types';

INSERT INTO public.order_cancellation_reason_catalog (attribute, label, reason_code, sort_order, channel, service_type)
VALUES
  ('RIDER', 'Vehicle breakdown / issue', 'app_rider_vehicle_issue', 1, 'app', NULL),
  ('RIDER', 'Customer not responding', 'app_rider_customer_unreachable', 2, 'app', NULL),
  ('RIDER', 'Wrong pickup location', 'app_rider_wrong_pickup', 3, 'app', NULL),
  ('RIDER', 'Unsafe area', 'app_rider_unsafe_area', 4, 'app', NULL),
  ('RIDER', 'Waiting too long at pickup', 'app_rider_long_wait', 5, 'app', NULL),
  ('RIDER', 'Other reason', 'app_rider_other', 99, 'app', NULL),
  ('RIDER', 'Customer requested cancel', 'app_ride_customer_cancel', 10, 'app', 'person_ride'),
  ('RIDER', 'Route not accessible', 'app_ride_route_blocked', 11, 'app', 'person_ride'),
  ('RIDER', 'Restaurant order not ready', 'app_food_merchant_delay', 10, 'app', 'food'),
  ('RIDER', 'Wrong items / packaging issue', 'app_food_wrong_items', 11, 'app', 'food'),
  ('CUSTOMER', 'Customer denying order', 'app_customer_denying', 1, 'app', NULL),
  ('CUSTOMER', 'Customer wrong address', 'app_customer_wrong_address', 2, 'app', NULL),
  ('CUSTOMER', 'Customer not reachable', 'app_customer_unreachable', 3, 'app', NULL),
  ('MERCHANT', 'Restaurant delaying order', 'app_merchant_delay', 1, 'app', 'food'),
  ('MERCHANT', 'Items out of stock at pickup', 'app_merchant_oos', 2, 'app', 'food'),
  ('MERCHANT', 'Merchant denying order', 'app_merchant_denying', 3, 'app', 'food')
ON CONFLICT (channel, attribute, label) DO NOTHING;

INSERT INTO gm_rider_penalty_reason_rules (scenario_code, catalog_reason_id, applies_penalty)
SELECT s.scenario_code, c.id, FALSE
FROM order_cancellation_reason_catalog c
CROSS JOIN (
  SELECT unnest(ARRAY['AFTER_ACCEPT_DISPATCH', 'AFTER_MARK_PICKUP']::gm_rider_penalty_scenario_code[]) AS scenario_code
) s
WHERE upper(trim(c.attribute)) = 'RIDER'
  AND c.channel = 'app'
  AND c.is_active = TRUE
ON CONFLICT (scenario_code, catalog_reason_id) DO NOTHING;
