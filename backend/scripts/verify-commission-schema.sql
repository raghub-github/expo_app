-- One-shot verification: shows that every new column/table is in place.
SELECT 'merchant_plans.commission_percent_override' AS check_name,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='merchant_plans' AND column_name='commission_percent_override') AS ok
UNION ALL
SELECT 'merchant_plans.commission_benefit_active',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='merchant_plans' AND column_name='commission_benefit_active')
UNION ALL
SELECT 'merchant_store_commission_rules.source_kind',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='merchant_store_commission_rules' AND column_name='source_kind')
UNION ALL
SELECT 'merchant_store_commission_rules.priority',
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name='merchant_store_commission_rules' AND column_name='priority')
UNION ALL
SELECT 'order_item_commission_snapshots (table)',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name='order_item_commission_snapshots')
UNION ALL
SELECT 'commission_audit_log (table)',
       EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_name='commission_audit_log')
UNION ALL
SELECT 'store_onboarding_commission_config.base_service_fee_percent (seeded >= 15)',
       (SELECT base_service_fee_percent >= 15 FROM store_onboarding_commission_config WHERE id=1);
