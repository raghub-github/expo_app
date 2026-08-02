-- Rollback: remove ride fare component seed rows.
DELETE FROM billing_pricing_rules
WHERE upper(trim(service_type)) = 'RIDE'
  AND charge_subtype IN (
    'RIDE_BIKE_LITE_DISCOUNT',
    'RIDE_WAITING',
    'RIDE_NIGHT',
    'RIDE_PEAK',
    'RIDE_FESTIVAL',
    'RIDE_AIRPORT',
    'RIDE_TOLL',
    'RIDE_EXTRA_STOPS'
  );

UPDATE billing_ruleset_version SET version = version + 1, updated_at = now() WHERE id = 1;
