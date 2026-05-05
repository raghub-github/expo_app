-- Geo hierarchy inheritance helper (backend copy).
-- Required by other backend migrations (e.g. geo_platform_offer_bindings) and by delivery_rate_slabs_effective.
--
-- NOTE: This is mirrored from dashboard migration 0174_geo_effective_base_fee.sql.
-- It is safe to CREATE OR REPLACE; function is STABLE and depends only on geo tables.

CREATE OR REPLACE FUNCTION geo_pricing_chain_steps(
  p_level geo_pricing_level,
  p_id uuid
) RETURNS TABLE(step_ord int, step_level geo_pricing_level, step_id uuid)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_level = 'state' THEN
    RETURN QUERY SELECT 1, 'state'::geo_pricing_level, p_id;
    RETURN;
  END IF;

  IF p_level = 'region' THEN
    RETURN QUERY SELECT 1, 'region'::geo_pricing_level, r.id FROM regions r WHERE r.id = p_id;
    RETURN QUERY SELECT 2, 'state'::geo_pricing_level, r.state_id FROM regions r WHERE r.id = p_id;
    RETURN;
  END IF;

  IF p_level = 'district' THEN
    RETURN QUERY SELECT 1, 'district'::geo_pricing_level, d.id FROM districts d WHERE d.id = p_id;
    RETURN QUERY SELECT 2, 'region'::geo_pricing_level, r.id
      FROM districts d JOIN regions r ON r.id = d.region_id WHERE d.id = p_id;
    RETURN QUERY SELECT 3, 'state'::geo_pricing_level, s.id
      FROM districts d JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id WHERE d.id = p_id;
    RETURN;
  END IF;

  IF p_level = 'division' THEN
    RETURN QUERY SELECT 1, 'division'::geo_pricing_level, dv.id FROM divisions dv WHERE dv.id = p_id;
    RETURN QUERY SELECT 2, 'district'::geo_pricing_level, d.id
      FROM divisions dv JOIN districts d ON d.id = dv.district_id WHERE dv.id = p_id;
    RETURN QUERY SELECT 3, 'region'::geo_pricing_level, r.id
      FROM divisions dv JOIN districts d ON d.id = dv.district_id JOIN regions r ON r.id = d.region_id WHERE dv.id = p_id;
    RETURN QUERY SELECT 4, 'state'::geo_pricing_level, s.id
      FROM divisions dv JOIN districts d ON d.id = dv.district_id JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id WHERE dv.id = p_id;
    RETURN;
  END IF;

  IF p_level = 'post_office' THEN
    RETURN QUERY SELECT 1, 'post_office'::geo_pricing_level, po.id FROM post_offices po WHERE po.id = p_id;
    RETURN QUERY SELECT 2, 'division'::geo_pricing_level, dv.id
      FROM post_offices po JOIN divisions dv ON dv.id = po.division_id WHERE po.id = p_id;
    RETURN QUERY SELECT 3, 'district'::geo_pricing_level, d.id
      FROM post_offices po JOIN divisions dv ON dv.id = po.division_id JOIN districts d ON d.id = dv.district_id WHERE po.id = p_id;
    RETURN QUERY SELECT 4, 'region'::geo_pricing_level, r.id
      FROM post_offices po JOIN divisions dv ON dv.id = po.division_id JOIN districts d ON d.id = dv.district_id JOIN regions r ON r.id = d.region_id WHERE po.id = p_id;
    RETURN QUERY SELECT 5, 'state'::geo_pricing_level, s.id
      FROM post_offices po JOIN divisions dv ON dv.id = po.division_id JOIN districts d ON d.id = dv.district_id JOIN regions r ON r.id = d.region_id JOIN states s ON s.id = r.state_id WHERE po.id = p_id;
    RETURN;
  END IF;

  -- pincode: pick one linked post office (same as admin ancestor chain)
  RETURN QUERY
  SELECT 1, 'pincode'::geo_pricing_level, p.id
  FROM pincodes p WHERE p.id = p_id;

  RETURN QUERY
  SELECT 2, 'post_office'::geo_pricing_level, x.po_id
  FROM (
    SELECT po.id AS po_id
    FROM pincodes p
    JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
    JOIN post_offices po ON po.id = ppo.post_office_id
    WHERE p.id = p_id
    LIMIT 1
  ) x;

  RETURN QUERY
  SELECT 3, 'division'::geo_pricing_level, x.dv_id
  FROM (
    SELECT dv.id AS dv_id
    FROM pincodes p
    JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
    JOIN post_offices po ON po.id = ppo.post_office_id
    JOIN divisions dv ON dv.id = po.division_id
    WHERE p.id = p_id
    LIMIT 1
  ) x;

  RETURN QUERY
  SELECT 4, 'district'::geo_pricing_level, x.d_id
  FROM (
    SELECT d.id AS d_id
    FROM pincodes p
    JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
    JOIN post_offices po ON po.id = ppo.post_office_id
    JOIN divisions dv ON dv.id = po.division_id
    JOIN districts d ON d.id = dv.district_id
    WHERE p.id = p_id
    LIMIT 1
  ) x;

  RETURN QUERY
  SELECT 5, 'region'::geo_pricing_level, x.r_id
  FROM (
    SELECT r.id AS r_id
    FROM pincodes p
    JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
    JOIN post_offices po ON po.id = ppo.post_office_id
    JOIN divisions dv ON dv.id = po.division_id
    JOIN districts d ON d.id = dv.district_id
    JOIN regions r ON r.id = d.region_id
    WHERE p.id = p_id
    LIMIT 1
  ) x;

  RETURN QUERY
  SELECT 6, 'state'::geo_pricing_level, x.s_id
  FROM (
    SELECT s.id AS s_id
    FROM pincodes p
    JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
    JOIN post_offices po ON po.id = ppo.post_office_id
    JOIN divisions dv ON dv.id = po.division_id
    JOIN districts d ON d.id = dv.district_id
    JOIN regions r ON r.id = d.region_id
    JOIN states s ON s.id = r.state_id
    WHERE p.id = p_id
    LIMIT 1
  ) x;

  RETURN;
END;
$$;

