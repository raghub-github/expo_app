-- Idempotent follow-up if 0573 already ran as Bike Lite ₹5 only.
-- Seeds EV Auto catalog offset (default ₹5) and customer catalog option.

UPDATE billing_pricing_rules
SET
  value_numeric = 5,
  updated_at = NOW()
WHERE upper(trim(service_type)) = 'RIDE'
  AND charge_subtype = 'RIDE_BIKE_LITE_DISCOUNT'
  AND value_numeric IS DISTINCT FROM 5;

DO $$
DECLARE
  next_p int;
BEGIN
  SELECT COALESCE(MAX(priority), 0) + 10 INTO next_p FROM billing_pricing_rules;

  IF NOT EXISTS (
    SELECT 1 FROM billing_pricing_rules
    WHERE upper(trim(service_type)) = 'RIDE'
      AND charge_subtype = 'RIDE_EV_AUTO_DISCOUNT'
  ) THEN
    INSERT INTO billing_pricing_rules (
      name, type, calculation_type, value_numeric, value_json,
      priority, is_active, stackable, applies_to, offer_owner, is_hidden,
      metadata, service_type, discount_applies_on, charge_subtype, tax_config_id
    ) VALUES (
      'EV Auto discount (config only — do not activate)',
      'DISCOUNT'::billing_rule_type,
      'FIXED'::billing_calculation_type,
      5,
      '{}'::jsonb,
      next_p, false, true, 'ORDER'::billing_applies_to,
      'GATIMITRA'::billing_offer_owner, true,
      jsonb_build_object(
        'source', 'ride_catalog_fare_offsets_v1',
        'catalog_code', 'ev_auto',
        'parent_catalog_code', 'auto',
        'consumer', 'loadCatalogFareOffsets',
        'do_not_activate', true,
        'notes', 'Value_numeric is read at quote time. Do NOT set is_active=true or the discount will be applied twice.'
      ),
      'RIDE',
      'ITEMS_TOTAL'::billing_discount_applies_on,
      'RIDE_EV_AUTO_DISCOUNT',
      NULL
    );
  END IF;
END $$;

INSERT INTO public.customer_ride_service_catalog (
  code, label, subtitle, base_fare, eta_mins, capacity, tag, image_key, sort_order, vehicle_types, is_active
)
SELECT
  'ev_auto',
  'EV Auto',
  'Budget EV Auto rides',
  30,
  6,
  3,
  'SAVE',
  'auto',
  4,
  ARRAY['ev_auto']::text[],
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.customer_ride_service_catalog WHERE code = 'ev_auto'
);

UPDATE public.customer_ride_service_catalog
SET sort_order = sort_order + 1
WHERE code IN ('cab-economy', 'cab-premium', 'travel')
  AND sort_order >= 4
  AND EXISTS (SELECT 1 FROM public.customer_ride_service_catalog WHERE code = 'ev_auto' AND sort_order = 4)
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_ride_service_catalog
    WHERE code = 'cab-economy' AND sort_order > 4
  );

INSERT INTO public.ride_catalog_vehicle_type_assignments (
  vehicle_type_code, catalog_code, is_assigned, updated_at
)
SELECT 'ev_auto', 'ev_auto', true, now()
WHERE EXISTS (
  SELECT 1 FROM public.rider_onboarding_vehicle_types WHERE code = 'ev_auto'
)
  AND EXISTS (
    SELECT 1 FROM public.customer_ride_service_catalog WHERE code = 'ev_auto'
  )
ON CONFLICT (vehicle_type_code, catalog_code) DO UPDATE SET
  is_assigned = true,
  updated_at = now();

UPDATE billing_ruleset_version SET version = version + 1, updated_at = now() WHERE id = 1;
