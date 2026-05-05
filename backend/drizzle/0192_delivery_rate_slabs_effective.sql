-- Effective progressive slabs for a geo node (closest ancestor wins).
-- Returns the first ancestor step (including self) that has any active slabs
-- for (service_type, actor_type), ordered for deterministic computation.

CREATE OR REPLACE FUNCTION delivery_rate_slabs_effective(
  p_level geo_pricing_level,
  p_id uuid,
  p_service order_type,
  p_actor delivery_actor_type
) RETURNS SETOF delivery_rate_slabs
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  rec record;
  has_rows boolean;
BEGIN
  FOR rec IN
    SELECT * FROM geo_pricing_chain_steps(p_level, p_id) ORDER BY step_ord ASC
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM delivery_rate_slabs s
      WHERE s.geo_level = rec.step_level
        AND s.geo_ref_id = rec.step_id
        AND s.service_type = p_service
        AND s.actor_type = p_actor
        AND s.is_active = true
    ) INTO has_rows;

    IF has_rows THEN
      RETURN QUERY
      SELECT *
      FROM delivery_rate_slabs s
      WHERE s.geo_level = rec.step_level
        AND s.geo_ref_id = rec.step_id
        AND s.service_type = p_service
        AND s.actor_type = p_actor
        AND s.is_active = true
      ORDER BY s.min_km ASC, s.max_km ASC NULLS LAST, s.priority DESC, s.id ASC;
      RETURN;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

