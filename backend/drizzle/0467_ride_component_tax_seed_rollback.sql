-- Rollback 0467
DELETE FROM billing_pricing_rules
WHERE metadata->>'source' = 'ride_component_tax_seed_v1';

DELETE FROM billing_tax_configs
WHERE upper(trim(service_type)) = 'RIDE'
  AND applicable_base::text IN ('WAITING_FEE', 'NIGHT_FEE', 'TOLL_FEE', 'SERVICE_FEE');
