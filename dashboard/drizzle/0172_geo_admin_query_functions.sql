-- Geo Super Admin: hierarchy children, search, resolve, upsert.
-- Run after 0171_geo_admin_functions.sql

CREATE OR REPLACE FUNCTION geo_row_matches_service_filters(
  p_food boolean,
  p_parcel boolean,
  p_ride boolean,
  f boolean,
  pa boolean,
  r boolean
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p_food IS NULL OR f = p_food)
    AND (p_parcel IS NULL OR pa = p_parcel)
    AND (p_ride IS NULL OR r = p_ride);
$$;

CREATE OR REPLACE FUNCTION geo_get_children(
  p_parent_level text,
  p_parent_id uuid,
  p_limit int DEFAULT 80,
  p_after_name text DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_state_id uuid DEFAULT NULL,
  p_food boolean DEFAULT NULL,
  p_parcel boolean DEFAULT NULL,
  p_ride boolean DEFAULT NULL
) RETURNS TABLE (
  kind text,
  id uuid,
  name text,
  pincode text,
  path text,
  latitude numeric,
  longitude numeric,
  is_food_enabled boolean,
  is_parcel_enabled boolean,
  is_ride_enabled boolean,
  food_override boolean,
  parcel_override boolean,
  ride_override boolean,
  has_children boolean
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_parent_level = 'root' THEN
    RETURN QUERY
    SELECT
      'state'::text,
      s.id,
      s.name,
      NULL::text,
      s.name::text,
      NULL::numeric,
      NULL::numeric,
      s.is_food_enabled,
      s.is_parcel_enabled,
      s.is_ride_enabled,
      s.food_override,
      s.parcel_override,
      s.ride_override,
      EXISTS (SELECT 1 FROM regions r WHERE r.state_id = s.id LIMIT 1)
    FROM states s
    WHERE s.is_active
      AND (p_state_id IS NULL OR s.id = p_state_id)
      AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, s.is_food_enabled, s.is_parcel_enabled, s.is_ride_enabled)
      AND (
        p_after_name IS NULL OR p_after_id IS NULL
        OR (lower(s.name), s.id) > (lower(p_after_name), p_after_id)
      )
    ORDER BY lower(s.name), s.id
    LIMIT p_limit;
    RETURN;
  END IF;

  IF p_parent_level = 'state' THEN
    RETURN QUERY
    SELECT
      'region'::text,
      r.id,
      r.name,
      NULL::text,
      (s.name || ' / ' || r.name)::text,
      NULL::numeric,
      NULL::numeric,
      r.is_food_enabled,
      r.is_parcel_enabled,
      r.is_ride_enabled,
      r.food_override,
      r.parcel_override,
      r.ride_override,
      EXISTS (SELECT 1 FROM districts d WHERE d.region_id = r.id LIMIT 1)
    FROM regions r
    JOIN states s ON s.id = r.state_id
    WHERE r.state_id = p_parent_id AND r.is_active
      AND (p_state_id IS NULL OR r.state_id = p_state_id)
      AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, r.is_food_enabled, r.is_parcel_enabled, r.is_ride_enabled)
      AND (
        p_after_name IS NULL OR p_after_id IS NULL
        OR (lower(r.name), r.id) > (lower(p_after_name), p_after_id)
      )
    ORDER BY lower(r.name), r.id
    LIMIT p_limit;
    RETURN;
  END IF;

  IF p_parent_level = 'region' THEN
    RETURN QUERY
    SELECT
      'district'::text,
      d.id,
      d.name,
      NULL::text,
      (s.name || ' / ' || r.name || ' / ' || d.name)::text,
      NULL::numeric,
      NULL::numeric,
      d.is_food_enabled,
      d.is_parcel_enabled,
      d.is_ride_enabled,
      d.food_override,
      d.parcel_override,
      d.ride_override,
      EXISTS (SELECT 1 FROM divisions dv WHERE dv.district_id = d.id LIMIT 1)
    FROM districts d
    JOIN regions r ON r.id = d.region_id
    JOIN states s ON s.id = r.state_id
    WHERE d.region_id = p_parent_id AND d.is_active
      AND (p_state_id IS NULL OR r.state_id = p_state_id)
      AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, d.is_food_enabled, d.is_parcel_enabled, d.is_ride_enabled)
      AND (
        p_after_name IS NULL OR p_after_id IS NULL
        OR (lower(d.name), d.id) > (lower(p_after_name), p_after_id)
      )
    ORDER BY lower(d.name), d.id
    LIMIT p_limit;
    RETURN;
  END IF;

  IF p_parent_level = 'district' THEN
    RETURN QUERY
    SELECT
      'division'::text,
      dv.id,
      dv.name,
      NULL::text,
      (s.name || ' / ' || r.name || ' / ' || d.name || ' / ' || dv.name)::text,
      NULL::numeric,
      NULL::numeric,
      dv.is_food_enabled,
      dv.is_parcel_enabled,
      dv.is_ride_enabled,
      dv.food_override,
      dv.parcel_override,
      dv.ride_override,
      EXISTS (SELECT 1 FROM post_offices po WHERE po.division_id = dv.id LIMIT 1)
    FROM divisions dv
    JOIN districts d ON d.id = dv.district_id
    JOIN regions r ON r.id = d.region_id
    JOIN states s ON s.id = r.state_id
    WHERE dv.district_id = p_parent_id AND dv.is_active
      AND (p_state_id IS NULL OR r.state_id = p_state_id)
      AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, dv.is_food_enabled, dv.is_parcel_enabled, dv.is_ride_enabled)
      AND (
        p_after_name IS NULL OR p_after_id IS NULL
        OR (lower(dv.name), dv.id) > (lower(p_after_name), p_after_id)
      )
    ORDER BY lower(dv.name), dv.id
    LIMIT p_limit;
    RETURN;
  END IF;

  IF p_parent_level = 'division' THEN
    RETURN QUERY
    SELECT
      'post_office'::text,
      po.id,
      po.name,
      NULL::text,
      (s.name || ' / ' || r.name || ' / ' || d.name || ' / ' || dv.name || ' / ' || po.name)::text,
      po.latitude,
      po.longitude,
      po.is_food_enabled,
      po.is_parcel_enabled,
      po.is_ride_enabled,
      po.food_override,
      po.parcel_override,
      po.ride_override,
      EXISTS (SELECT 1 FROM pincode_post_offices ppo WHERE ppo.post_office_id = po.id LIMIT 1)
    FROM post_offices po
    JOIN divisions dv ON dv.id = po.division_id
    JOIN districts d ON d.id = dv.district_id
    JOIN regions r ON r.id = d.region_id
    JOIN states s ON s.id = r.state_id
    WHERE po.division_id = p_parent_id AND po.is_active
      AND (p_state_id IS NULL OR r.state_id = p_state_id)
      AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, po.is_food_enabled, po.is_parcel_enabled, po.is_ride_enabled)
      AND (
        p_after_name IS NULL OR p_after_id IS NULL
        OR (lower(po.name), po.id) > (lower(p_after_name), p_after_id)
      )
    ORDER BY lower(po.name), po.id
    LIMIT p_limit;
    RETURN;
  END IF;

  IF p_parent_level = 'post_office' THEN
    RETURN QUERY
    SELECT
      'pincode'::text,
      p.id,
      p.pincode,
      p.pincode,
      (s.name || ' / ' || r.name || ' / ' || d.name || ' / ' || dv.name || ' / ' || po.name || ' / ' || p.pincode)::text,
      NULL::numeric,
      NULL::numeric,
      p.is_food_enabled,
      p.is_parcel_enabled,
      p.is_ride_enabled,
      p.food_override,
      p.parcel_override,
      p.ride_override,
      false
    FROM pincodes p
    JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
    JOIN post_offices po ON po.id = ppo.post_office_id
    LEFT JOIN divisions dv ON dv.id = po.division_id
    LEFT JOIN districts d ON d.id = dv.district_id
    LEFT JOIN regions r ON r.id = d.region_id
    LEFT JOIN states s ON s.id = r.state_id
    WHERE ppo.post_office_id = p_parent_id AND p.is_active
      AND (p_state_id IS NULL OR r.state_id = p_state_id OR r.state_id IS NULL)
      AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, p.is_food_enabled, p.is_parcel_enabled, p.is_ride_enabled)
      AND (
        p_after_name IS NULL OR p_after_id IS NULL
        OR (p.pincode, p.id) > (p_after_name, p_after_id)
      )
    ORDER BY p.pincode, p.id
    LIMIT p_limit;
    RETURN;
  END IF;

  RAISE EXCEPTION 'invalid parent_level %', p_parent_level;
END;
$$;

CREATE OR REPLACE FUNCTION geo_search_locations(
  p_query text,
  p_types text[] DEFAULT ARRAY['state','region','district','division','post_office','pincode']::text[],
  p_limit int DEFAULT 60,
  p_after_sort text DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_state_id uuid DEFAULT NULL,
  p_food boolean DEFAULT NULL,
  p_parcel boolean DEFAULT NULL,
  p_ride boolean DEFAULT NULL
) RETURNS TABLE (
  kind text,
  id uuid,
  name text,
  pincode text,
  state_name text,
  region_name text,
  district_name text,
  division_name text,
  po_name text,
  path text,
  latitude numeric,
  longitude numeric,
  is_food_enabled boolean,
  is_parcel_enabled boolean,
  is_ride_enabled boolean,
  food_override boolean,
  parcel_override boolean,
  ride_override boolean,
  sort_key text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  vq text := trim(lower(coalesce(p_query, '')));
  vpat text;
BEGIN
  IF length(vq) < 1 THEN
    RETURN;
  END IF;
  vpat := '%' || vq || '%';

  RETURN QUERY
  WITH hits AS (
    SELECT * FROM (
      SELECT
        'state'::text AS k,
        s.id AS i,
        s.name AS n,
        NULL::text AS pc,
        s.name AS sn,
        NULL::text AS rn,
        NULL::text AS dn,
        NULL::text AS dvn,
        NULL::text AS pon,
        s.name AS pth,
        NULL::numeric AS la,
        NULL::numeric AS lo,
        s.is_food_enabled AS fe,
        s.is_parcel_enabled AS pe,
        s.is_ride_enabled AS re,
        s.food_override AS fo,
        s.parcel_override AS po,
        s.ride_override AS ro,
        lower(s.name) AS sk
      FROM states s
      WHERE s.is_active
        AND 'state' = ANY (p_types)
        AND (p_state_id IS NULL OR s.id = p_state_id)
        AND lower(s.name) LIKE vpat
        AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, s.is_food_enabled, s.is_parcel_enabled, s.is_ride_enabled)

      UNION ALL

      SELECT
        'region',
        r.id,
        r.name,
        NULL::text,
        s.name,
        r.name,
        NULL::text,
        NULL::text,
        NULL::text,
        s.name || ' / ' || r.name,
        NULL::numeric,
        NULL::numeric,
        r.is_food_enabled,
        r.is_parcel_enabled,
        r.is_ride_enabled,
        r.food_override,
        r.parcel_override,
        r.ride_override,
        lower(r.name)
      FROM regions r
      JOIN states s ON s.id = r.state_id
      WHERE r.is_active
        AND 'region' = ANY (p_types)
        AND (p_state_id IS NULL OR r.state_id = p_state_id)
        AND lower(r.name) LIKE vpat
        AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, r.is_food_enabled, r.is_parcel_enabled, r.is_ride_enabled)

      UNION ALL

      SELECT
        'district',
        d.id,
        d.name,
        NULL::text,
        s.name,
        r.name,
        d.name,
        NULL::text,
        NULL::text,
        s.name || ' / ' || r.name || ' / ' || d.name,
        NULL::numeric,
        NULL::numeric,
        d.is_food_enabled,
        d.is_parcel_enabled,
        d.is_ride_enabled,
        d.food_override,
        d.parcel_override,
        d.ride_override,
        lower(d.name)
      FROM districts d
      JOIN regions r ON r.id = d.region_id
      JOIN states s ON s.id = r.state_id
      WHERE d.is_active
        AND 'district' = ANY (p_types)
        AND (p_state_id IS NULL OR r.state_id = p_state_id)
        AND lower(d.name) LIKE vpat
        AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, d.is_food_enabled, d.is_parcel_enabled, d.is_ride_enabled)

      UNION ALL

      SELECT
        'division',
        dv.id,
        dv.name,
        NULL::text,
        s.name,
        r.name,
        d.name,
        dv.name,
        NULL::text,
        s.name || ' / ' || r.name || ' / ' || d.name || ' / ' || dv.name,
        NULL::numeric,
        NULL::numeric,
        dv.is_food_enabled,
        dv.is_parcel_enabled,
        dv.is_ride_enabled,
        dv.food_override,
        dv.parcel_override,
        dv.ride_override,
        lower(dv.name)
      FROM divisions dv
      JOIN districts d ON d.id = dv.district_id
      JOIN regions r ON r.id = d.region_id
      JOIN states s ON s.id = r.state_id
      WHERE dv.is_active
        AND 'division' = ANY (p_types)
        AND (p_state_id IS NULL OR r.state_id = p_state_id)
        AND lower(dv.name) LIKE vpat
        AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, dv.is_food_enabled, dv.is_parcel_enabled, dv.is_ride_enabled)

      UNION ALL

      SELECT
        'post_office',
        po.id,
        po.name,
        NULL::text,
        s.name,
        r.name,
        d.name,
        dv.name,
        po.name,
        s.name || ' / ' || r.name || ' / ' || d.name || ' / ' || dv.name || ' / ' || po.name,
        po.latitude,
        po.longitude,
        po.is_food_enabled,
        po.is_parcel_enabled,
        po.is_ride_enabled,
        po.food_override,
        po.parcel_override,
        po.ride_override,
        lower(po.name)
      FROM post_offices po
      JOIN divisions dv ON dv.id = po.division_id
      JOIN districts d ON d.id = dv.district_id
      JOIN regions r ON r.id = d.region_id
      JOIN states s ON s.id = r.state_id
      WHERE po.is_active
        AND 'post_office' = ANY (p_types)
        AND (p_state_id IS NULL OR r.state_id = p_state_id)
        AND lower(po.name) LIKE vpat
        AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, po.is_food_enabled, po.is_parcel_enabled, po.is_ride_enabled)

      UNION ALL

      SELECT
        'pincode',
        p.id,
        p.pincode,
        p.pincode,
        s.name,
        r.name,
        d.name,
        dv.name,
        po.name,
        s.name || ' / ' || r.name || ' / ' || d.name || ' / ' || dv.name || ' / ' || po.name || ' / ' || p.pincode,
        po.latitude,
        po.longitude,
        p.is_food_enabled,
        p.is_parcel_enabled,
        p.is_ride_enabled,
        p.food_override,
        p.parcel_override,
        p.ride_override,
        p.pincode
      FROM pincodes p
      JOIN pincode_post_offices ppo ON ppo.pincode_id = p.id
      JOIN post_offices po ON po.id = ppo.post_office_id
      JOIN divisions dv ON dv.id = po.division_id
      JOIN districts d ON d.id = dv.district_id
      JOIN regions r ON r.id = d.region_id
      JOIN states s ON s.id = r.state_id
      WHERE p.is_active
        AND 'pincode' = ANY (p_types)
        AND (p_state_id IS NULL OR r.state_id = p_state_id)
        AND p.pincode LIKE vpat
        AND geo_row_matches_service_filters(p_food, p_parcel, p_ride, p.is_food_enabled, p.is_parcel_enabled, p.is_ride_enabled)
    ) u
    WHERE p_after_sort IS NULL OR p_after_id IS NULL OR (u.sk, u.i) > (p_after_sort, p_after_id)
  )
  SELECT
    h.k,
    h.i,
    h.n,
    h.pc,
    h.sn,
    h.rn,
    h.dn,
    h.dvn,
    h.pon,
    h.pth,
    h.la,
    h.lo,
    h.fe,
    h.pe,
    h.re,
    h.fo,
    h.po,
    h.ro,
    h.sk::text
  FROM hits h
  ORDER BY h.sk, h.i
  LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION geo_resolve_pincode(
  p_pincode text,
  p_service text,
  p_user_lat numeric DEFAULT NULL,
  p_user_lng numeric DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pc record;
  v_po_id uuid;
  v_po_name text;
  v_po_lat numeric;
  v_po_lng numeric;
  v_sid uuid;
  v_rid uuid;
  v_did uuid;
  v_dvid uuid;
  v_avail boolean;
  v_rule record;
  v_best jsonb;
BEGIN
  IF p_service NOT IN ('food', 'parcel', 'ride') THEN
    RETURN jsonb_build_object('error', 'invalid service');
  END IF;

  SELECT * INTO v_pc FROM pincodes p WHERE p.pincode = trim(p_pincode) AND p.is_active LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF p_service = 'food' THEN
    v_avail := v_pc.is_food_enabled;
  ELSIF p_service = 'parcel' THEN
    v_avail := v_pc.is_parcel_enabled;
  ELSE
    v_avail := v_pc.is_ride_enabled;
  END IF;

  SELECT po.id, po.name, po.latitude, po.longitude, s.id, r.id, d.id, dv.id
  INTO v_po_id, v_po_name, v_po_lat, v_po_lng, v_sid, v_rid, v_did, v_dvid
  FROM pincode_post_offices ppo
  JOIN post_offices po ON po.id = ppo.post_office_id AND po.is_active
  JOIN divisions dv ON dv.id = po.division_id
  JOIN districts d ON d.id = dv.district_id
  JOIN regions r ON r.id = d.region_id
  JOIN states s ON s.id = r.state_id
  WHERE ppo.pincode_id = v_pc.id
  ORDER BY po.id
  LIMIT 1;

  v_best := NULL;
  IF p_user_lat IS NOT NULL AND p_user_lng IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', po.id,
      'name', po.name,
      'latitude', po.latitude,
      'longitude', po.longitude,
      'distanceKm', (
        6371 * acos(
          least(1::float, greatest(-1::float,
            cos(radians(p_user_lat::double precision)) * cos(radians(po.latitude::double precision))
            * cos(radians(po.longitude::double precision) - radians(p_user_lng::double precision))
            + sin(radians(p_user_lat::double precision)) * sin(radians(po.latitude::double precision))
          ))
        )
      )
    )
    INTO v_best
    FROM pincode_post_offices ppo
    JOIN post_offices po ON po.id = ppo.post_office_id AND po.is_active
      AND po.latitude IS NOT NULL AND po.longitude IS NOT NULL
    WHERE ppo.pincode_id = v_pc.id
    ORDER BY (
      6371 * acos(
        least(1::float, greatest(-1::float,
          cos(radians(p_user_lat::double precision)) * cos(radians(po.latitude::double precision))
          * cos(radians(po.longitude::double precision) - radians(p_user_lng::double precision))
          + sin(radians(p_user_lat::double precision)) * sin(radians(po.latitude::double precision))
        ))
      )
    )
    LIMIT 1;
  ELSIF v_po_id IS NOT NULL THEN
    v_best := jsonb_build_object(
      'id', v_po_id,
      'name', v_po_name,
      'latitude', v_po_lat,
      'longitude', v_po_lng
    );
  END IF;

  SELECT g.* INTO v_rule
  FROM geo_service_pricing_rules g
  WHERE g.is_active
    AND g.service = p_service::geo_service
    AND (
      (g.level = 'pincode'::geo_pricing_level AND g.ref_id = v_pc.id)
      OR (v_po_id IS NOT NULL AND g.level = 'post_office'::geo_pricing_level AND g.ref_id = v_po_id)
      OR (v_dvid IS NOT NULL AND g.level = 'division'::geo_pricing_level AND g.ref_id = v_dvid)
      OR (v_did IS NOT NULL AND g.level = 'district'::geo_pricing_level AND g.ref_id = v_did)
      OR (v_rid IS NOT NULL AND g.level = 'region'::geo_pricing_level AND g.ref_id = v_rid)
      OR (v_sid IS NOT NULL AND g.level = 'state'::geo_pricing_level AND g.ref_id = v_sid)
    )
  ORDER BY
    CASE g.level
      WHEN 'pincode'::geo_pricing_level THEN 6
      WHEN 'post_office'::geo_pricing_level THEN 5
      WHEN 'division'::geo_pricing_level THEN 4
      WHEN 'district'::geo_pricing_level THEN 3
      WHEN 'region'::geo_pricing_level THEN 2
      ELSE 1
    END DESC,
    g.priority DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'found', true,
    'pincodeId', v_pc.id,
    'pincode', v_pc.pincode,
    'service', p_service,
    'available', v_avail,
    'nearestPostOffice', v_best,
    'pricingRule', CASE WHEN v_rule.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_rule.id,
      'level', v_rule.level::text,
      'refId', v_rule.ref_id,
      'ruleType', v_rule.rule_type,
      'valueNumeric', v_rule.value_numeric,
      'valueJson', v_rule.value_json,
      'priority', v_rule.priority
    ) END
  );
END;
$$;

CREATE OR REPLACE FUNCTION geo_upsert_location(
  p_state text,
  p_region text,
  p_district text,
  p_division text,
  p_post_office text,
  p_pincode text,
  p_branch_type text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL,
  p_is_food boolean DEFAULT true,
  p_is_parcel boolean DEFAULT true,
  p_is_ride boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_state_id uuid;
  v_region_id uuid;
  v_district_id uuid;
  v_division_id uuid;
  v_po_id uuid;
  v_pc_id uuid;
  v_st text := trim(p_state);
  v_rg text := nullif(trim(coalesce(p_region, '')), '');
  v_ds text := nullif(trim(coalesce(p_district, '')), '');
  v_dv text := nullif(trim(coalesce(p_division, '')), '');
  v_po text := trim(p_post_office);
  v_pc text := trim(p_pincode);
BEGIN
  IF v_st = '' OR v_po = '' OR v_pc = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'state, post_office, pincode required');
  END IF;

  INSERT INTO states (name, is_food_enabled, is_parcel_enabled, is_ride_enabled)
  VALUES (v_st, p_is_food, p_is_parcel, p_is_ride)
  ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_state_id;
  IF v_state_id IS NULL THEN
    SELECT id INTO v_state_id FROM states WHERE name = v_st;
  END IF;

  IF v_rg IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'region required for hierarchy');
  END IF;

  INSERT INTO regions (name, state_id, is_food_enabled, is_parcel_enabled, is_ride_enabled)
  VALUES (v_rg, v_state_id, p_is_food, p_is_parcel, p_is_ride)
  ON CONFLICT (state_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_region_id;
  IF v_region_id IS NULL THEN
    SELECT id INTO v_region_id FROM regions WHERE state_id = v_state_id AND name = v_rg;
  END IF;

  IF v_ds IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'district required for hierarchy');
  END IF;

  INSERT INTO districts (name, region_id, is_food_enabled, is_parcel_enabled, is_ride_enabled)
  VALUES (v_ds, v_region_id, p_is_food, p_is_parcel, p_is_ride)
  ON CONFLICT (region_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_district_id;
  IF v_district_id IS NULL THEN
    SELECT id INTO v_district_id FROM districts WHERE region_id = v_region_id AND name = v_ds;
  END IF;

  IF v_dv IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'division required for hierarchy');
  END IF;

  INSERT INTO divisions (name, district_id, is_food_enabled, is_parcel_enabled, is_ride_enabled)
  VALUES (v_dv, v_district_id, p_is_food, p_is_parcel, p_is_ride)
  ON CONFLICT (district_id, name) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_division_id;
  IF v_division_id IS NULL THEN
    SELECT id INTO v_division_id FROM divisions WHERE district_id = v_district_id AND name = v_dv;
  END IF;

  SELECT id INTO v_po_id FROM post_offices WHERE division_id = v_division_id AND name = v_po LIMIT 1;
  IF v_po_id IS NULL THEN
    INSERT INTO post_offices (name, division_id, branch_type, latitude, longitude, is_food_enabled, is_parcel_enabled, is_ride_enabled)
    VALUES (v_po, v_division_id, p_branch_type, p_latitude, p_longitude, p_is_food, p_is_parcel, p_is_ride)
    RETURNING id INTO v_po_id;
  ELSE
    UPDATE post_offices SET
      branch_type = coalesce(p_branch_type, branch_type),
      latitude = coalesce(p_latitude, latitude),
      longitude = coalesce(p_longitude, longitude)
    WHERE id = v_po_id;
  END IF;

  INSERT INTO pincodes (pincode, is_food_enabled, is_parcel_enabled, is_ride_enabled)
  VALUES (v_pc, p_is_food, p_is_parcel, p_is_ride)
  ON CONFLICT (pincode) DO UPDATE SET pincode = EXCLUDED.pincode
  RETURNING id INTO v_pc_id;
  IF v_pc_id IS NULL THEN
    SELECT id INTO v_pc_id FROM pincodes WHERE pincode = v_pc;
  END IF;

  INSERT INTO pincode_post_offices (pincode_id, post_office_id)
  VALUES (v_pc_id, v_po_id)
  ON CONFLICT DO NOTHING;

  PERFORM geo_recompute_service_subtree('state', v_state_id, 'food');
  PERFORM geo_recompute_service_subtree('state', v_state_id, 'parcel');
  PERFORM geo_recompute_service_subtree('state', v_state_id, 'ride');

  RETURN jsonb_build_object(
    'ok', true,
    'stateId', v_state_id,
    'regionId', v_region_id,
    'districtId', v_district_id,
    'divisionId', v_division_id,
    'postOfficeId', v_po_id,
    'pincodeId', v_pc_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
