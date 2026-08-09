-- Rollback for 0521_parcel_billing_rules_seed.sql (removes only the seeded PARCEL rows).
DELETE FROM billing_pricing_rules
WHERE service_type = 'PARCEL' AND name IN (
  'Booking fee','Offer','Tip','Convenience charges','Surge fee','Handling charge',
  'Extra weight charge','Waiting charge',
  'GST on parcel delivery','GST on parcel booking fee','GST on parcel convenience fee','GST on parcel surge'
);
DELETE FROM billing_tax_configs
WHERE service_type = 'PARCEL' AND name IN (
  'GST on parcel delivery','GST on parcel booking fee','GST on parcel convenience fee','GST on parcel surge'
);
