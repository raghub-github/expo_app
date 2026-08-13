-- Rollback for 0527_dynamic_pricing_vehicle_type.sql

CREATE OR REPLACE FUNCTION dynamic_pricing_rules_effective(
  p_level   geo_pricing_level,
  p_id      uuid,
  p_service text
) RETURNS SETOF dynamic_pricing_rules
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (r.mode, r.service_type) r.*
  FROM geo_pricing_chain_steps(p_level, p_id) c
  JOIN dynamic_pricing_rules r
    ON r.geo_level = c.step_level AND r.geo_ref_id = c.step_id
  WHERE r.is_active = true
    AND (r.service_type = p_service OR r.service_type = 'all')
    AND (r.active_from IS NULL OR r.active_from <= now())
    AND (r.active_to   IS NULL OR r.active_to   >  now())
  ORDER BY r.mode, r.service_type, c.step_ord ASC, r.priority DESC, r.id ASC;
$$;

DROP INDEX IF EXISTS dyn_pricing_vehicle_idx;
DROP INDEX IF EXISTS dyn_pricing_uniq_all_vehicles_idx;
DROP INDEX IF EXISTS dyn_pricing_uniq_vehicle_idx;

-- Restores the original constraint. Will FAIL if vehicle-specific rows were added in the
-- meantime (duplicate (node,service,mode) rows would violate it) — remove them first.
ALTER TABLE dynamic_pricing_rules
  ADD CONSTRAINT dyn_pricing_uniq UNIQUE (geo_level, geo_ref_id, service_type, mode);

ALTER TABLE dynamic_pricing_rules DROP COLUMN IF EXISTS vehicle_type;
