-- Rollback for 0522_dynamic_pricing_rules.sql
DROP FUNCTION IF EXISTS dynamic_pricing_rules_effective(geo_pricing_level, uuid, text);
DROP TABLE IF EXISTS dynamic_pricing_rules;
