UPDATE billing_pricing_rules
SET
  value_numeric = 12,
  updated_at = NOW()
WHERE upper(trim(service_type)) = 'RIDE'
  AND charge_subtype = 'RIDE_BIKE_LITE_DISCOUNT';

DELETE FROM ride_catalog_vehicle_type_assignments
WHERE vehicle_type_code = 'ev_auto'
  AND catalog_code = 'ev_auto';

DELETE FROM customer_ride_service_catalog
WHERE code = 'ev_auto';

DELETE FROM billing_pricing_rules
WHERE upper(trim(service_type)) = 'RIDE'
  AND charge_subtype = 'RIDE_EV_AUTO_DISCOUNT';

UPDATE billing_ruleset_version SET version = version + 1, updated_at = now() WHERE id = 1;
