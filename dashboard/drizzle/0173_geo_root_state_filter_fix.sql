-- Fix: root tree + search respect p_state_id so "State filter" narrows to one state.

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

-- Search: state hits respect p_state_id
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
