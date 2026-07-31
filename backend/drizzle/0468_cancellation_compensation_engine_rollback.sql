-- Rollback 0468
DELETE FROM service_cancellation_compensation_rules
WHERE metadata->>'source' = 'cancel_comp_seed_v1';
DROP TABLE IF EXISTS service_cancellation_settlements;
DROP INDEX IF EXISTS svc_cancel_comp_rules_geo_idx;
DROP INDEX IF EXISTS svc_cancel_comp_rules_svc_idx;
DROP TABLE IF EXISTS service_cancellation_compensation_rules;
