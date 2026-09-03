-- Rollback for 0589_rider_service_eligibility_rules.sql
DROP INDEX IF EXISTS rider_svc_elig_service_idx;
DROP INDEX IF EXISTS rider_svc_elig_geo_service_idx;
DROP TABLE IF EXISTS rider_service_eligibility_rules;
