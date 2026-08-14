-- Rollback for 0532_service_payout_rules_waiting_vehicle_and_food_default.sql

UPDATE service_payout_rules
   SET waiting_funding_mode = 'CUSTOMER_100',
       waiting_customer_share_pct = 100,
       waiting_company_share_pct = 0
 WHERE service_type = 'food'
   AND waiting_funding_mode = 'COMPANY_100'
   AND waiting_customer_share_pct = 0
   AND waiting_company_share_pct = 100;

DROP INDEX IF EXISTS service_payout_rules_vehicle_idx;

ALTER TABLE service_payout_rules DROP COLUMN IF EXISTS vehicle_type;
