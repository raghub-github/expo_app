-- Rollback for 0531_drop_stale_dynamic_pricing_effective_overload.sql
-- Recreates the original 3-arg overload exactly as 0522 first defined it.
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
