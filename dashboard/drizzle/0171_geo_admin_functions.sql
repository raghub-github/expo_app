-- Geo Super Admin: recompute (must load before toggle) + toggle cascade.
-- Depends on 0170_geo_admin_schema.sql

CREATE OR REPLACE FUNCTION geo_recompute_service_subtree(
  p_root_level text,
  p_root_id uuid,
  p_service text
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_service NOT IN ('food', 'parcel', 'ride') THEN
    RAISE EXCEPTION 'invalid service %', p_service;
  END IF;

  IF p_service = 'food' THEN
    IF p_root_level = 'state' THEN
      UPDATE regions reg SET is_food_enabled = CASE WHEN reg.food_override THEN reg.is_food_enabled ELSE s.is_food_enabled END
      FROM states s WHERE reg.state_id = s.id AND s.id = p_root_id;
      UPDATE districts d SET is_food_enabled = CASE WHEN d.food_override THEN d.is_food_enabled ELSE r.is_food_enabled END
      FROM regions r WHERE d.region_id = r.id AND r.state_id = p_root_id;
      UPDATE divisions dv SET is_food_enabled = CASE WHEN dv.food_override THEN dv.is_food_enabled ELSE d.is_food_enabled END
      FROM districts d JOIN regions r ON r.id = d.region_id WHERE dv.district_id = d.id AND r.state_id = p_root_id;
      UPDATE post_offices po SET is_food_enabled = CASE WHEN po.food_override THEN po.is_food_enabled ELSE dv.is_food_enabled END
      FROM divisions dv JOIN districts d ON d.id = dv.district_id JOIN regions r ON r.id = d.region_id
      WHERE po.division_id = dv.id AND r.state_id = p_root_id;
      UPDATE pincodes p SET is_food_enabled = CASE WHEN p.food_override THEN p.is_food_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_food_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        JOIN districts d ON d.id = dv.district_id
        JOIN regions r ON r.id = d.region_id
        WHERE r.state_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'region' THEN
      UPDATE districts d SET is_food_enabled = CASE WHEN d.food_override THEN d.is_food_enabled ELSE r.is_food_enabled END
      FROM regions r WHERE d.region_id = r.id AND r.id = p_root_id;
      UPDATE divisions dv SET is_food_enabled = CASE WHEN dv.food_override THEN dv.is_food_enabled ELSE d.is_food_enabled END
      FROM districts d WHERE dv.district_id = d.id AND d.region_id = p_root_id;
      UPDATE post_offices po SET is_food_enabled = CASE WHEN po.food_override THEN po.is_food_enabled ELSE dv.is_food_enabled END
      FROM divisions dv JOIN districts d ON d.id = dv.district_id WHERE po.division_id = dv.id AND d.region_id = p_root_id;
      UPDATE pincodes p SET is_food_enabled = CASE WHEN p.food_override THEN p.is_food_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_food_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        JOIN districts d ON d.id = dv.district_id
        WHERE d.region_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'district' THEN
      UPDATE divisions dv SET is_food_enabled = CASE WHEN dv.food_override THEN dv.is_food_enabled ELSE d.is_food_enabled END
      FROM districts d WHERE dv.district_id = d.id AND d.id = p_root_id;
      UPDATE post_offices po SET is_food_enabled = CASE WHEN po.food_override THEN po.is_food_enabled ELSE dv.is_food_enabled END
      FROM divisions dv WHERE po.division_id = dv.id AND dv.district_id = p_root_id;
      UPDATE pincodes p SET is_food_enabled = CASE WHEN p.food_override THEN p.is_food_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_food_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        WHERE dv.district_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'division' THEN
      UPDATE post_offices po SET is_food_enabled = CASE WHEN po.food_override THEN po.is_food_enabled ELSE dv.is_food_enabled END
      FROM divisions dv WHERE po.division_id = dv.id AND dv.id = p_root_id;
      UPDATE pincodes p SET is_food_enabled = CASE WHEN p.food_override THEN p.is_food_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_food_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        WHERE po.division_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'post_office' THEN
      UPDATE pincodes p SET is_food_enabled = CASE WHEN p.food_override THEN p.is_food_enabled ELSE po.is_food_enabled END
      FROM pincode_post_offices ppo
      JOIN post_offices po ON po.id = ppo.post_office_id
      WHERE ppo.post_office_id = p_root_id AND p.id = ppo.pincode_id;
    END IF;

  ELSIF p_service = 'parcel' THEN
    IF p_root_level = 'state' THEN
      UPDATE regions reg SET is_parcel_enabled = CASE WHEN reg.parcel_override THEN reg.is_parcel_enabled ELSE s.is_parcel_enabled END
      FROM states s WHERE reg.state_id = s.id AND s.id = p_root_id;
      UPDATE districts d SET is_parcel_enabled = CASE WHEN d.parcel_override THEN d.is_parcel_enabled ELSE r.is_parcel_enabled END
      FROM regions r WHERE d.region_id = r.id AND r.state_id = p_root_id;
      UPDATE divisions dv SET is_parcel_enabled = CASE WHEN dv.parcel_override THEN dv.is_parcel_enabled ELSE d.is_parcel_enabled END
      FROM districts d JOIN regions r ON r.id = d.region_id WHERE dv.district_id = d.id AND r.state_id = p_root_id;
      UPDATE post_offices po SET is_parcel_enabled = CASE WHEN po.parcel_override THEN po.is_parcel_enabled ELSE dv.is_parcel_enabled END
      FROM divisions dv JOIN districts d ON d.id = dv.district_id JOIN regions r ON r.id = d.region_id
      WHERE po.division_id = dv.id AND r.state_id = p_root_id;
      UPDATE pincodes p SET is_parcel_enabled = CASE WHEN p.parcel_override THEN p.is_parcel_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_parcel_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        JOIN districts d ON d.id = dv.district_id
        JOIN regions r ON r.id = d.region_id
        WHERE r.state_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'region' THEN
      UPDATE districts d SET is_parcel_enabled = CASE WHEN d.parcel_override THEN d.is_parcel_enabled ELSE r.is_parcel_enabled END
      FROM regions r WHERE d.region_id = r.id AND r.id = p_root_id;
      UPDATE divisions dv SET is_parcel_enabled = CASE WHEN dv.parcel_override THEN dv.is_parcel_enabled ELSE d.is_parcel_enabled END
      FROM districts d WHERE dv.district_id = d.id AND d.region_id = p_root_id;
      UPDATE post_offices po SET is_parcel_enabled = CASE WHEN po.parcel_override THEN po.is_parcel_enabled ELSE dv.is_parcel_enabled END
      FROM divisions dv JOIN districts d ON d.id = dv.district_id WHERE po.division_id = dv.id AND d.region_id = p_root_id;
      UPDATE pincodes p SET is_parcel_enabled = CASE WHEN p.parcel_override THEN p.is_parcel_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_parcel_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        JOIN districts d ON d.id = dv.district_id
        WHERE d.region_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'district' THEN
      UPDATE divisions dv SET is_parcel_enabled = CASE WHEN dv.parcel_override THEN dv.is_parcel_enabled ELSE d.is_parcel_enabled END
      FROM districts d WHERE dv.district_id = d.id AND d.id = p_root_id;
      UPDATE post_offices po SET is_parcel_enabled = CASE WHEN po.parcel_override THEN po.is_parcel_enabled ELSE dv.is_parcel_enabled END
      FROM divisions dv WHERE po.division_id = dv.id AND dv.district_id = p_root_id;
      UPDATE pincodes p SET is_parcel_enabled = CASE WHEN p.parcel_override THEN p.is_parcel_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_parcel_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        WHERE dv.district_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'division' THEN
      UPDATE post_offices po SET is_parcel_enabled = CASE WHEN po.parcel_override THEN po.is_parcel_enabled ELSE dv.is_parcel_enabled END
      FROM divisions dv WHERE po.division_id = dv.id AND dv.id = p_root_id;
      UPDATE pincodes p SET is_parcel_enabled = CASE WHEN p.parcel_override THEN p.is_parcel_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_parcel_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        WHERE po.division_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'post_office' THEN
      UPDATE pincodes p SET is_parcel_enabled = CASE WHEN p.parcel_override THEN p.is_parcel_enabled ELSE po.is_parcel_enabled END
      FROM pincode_post_offices ppo
      JOIN post_offices po ON po.id = ppo.post_office_id
      WHERE ppo.post_office_id = p_root_id AND p.id = ppo.pincode_id;
    END IF;

  ELSE
    IF p_root_level = 'state' THEN
      UPDATE regions reg SET is_ride_enabled = CASE WHEN reg.ride_override THEN reg.is_ride_enabled ELSE s.is_ride_enabled END
      FROM states s WHERE reg.state_id = s.id AND s.id = p_root_id;
      UPDATE districts d SET is_ride_enabled = CASE WHEN d.ride_override THEN d.is_ride_enabled ELSE r.is_ride_enabled END
      FROM regions r WHERE d.region_id = r.id AND r.state_id = p_root_id;
      UPDATE divisions dv SET is_ride_enabled = CASE WHEN dv.ride_override THEN dv.is_ride_enabled ELSE d.is_ride_enabled END
      FROM districts d JOIN regions r ON r.id = d.region_id WHERE dv.district_id = d.id AND r.state_id = p_root_id;
      UPDATE post_offices po SET is_ride_enabled = CASE WHEN po.ride_override THEN po.is_ride_enabled ELSE dv.is_ride_enabled END
      FROM divisions dv JOIN districts d ON d.id = dv.district_id JOIN regions r ON r.id = d.region_id
      WHERE po.division_id = dv.id AND r.state_id = p_root_id;
      UPDATE pincodes p SET is_ride_enabled = CASE WHEN p.ride_override THEN p.is_ride_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_ride_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        JOIN districts d ON d.id = dv.district_id
        JOIN regions r ON r.id = d.region_id
        WHERE r.state_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'region' THEN
      UPDATE districts d SET is_ride_enabled = CASE WHEN d.ride_override THEN d.is_ride_enabled ELSE r.is_ride_enabled END
      FROM regions r WHERE d.region_id = r.id AND r.id = p_root_id;
      UPDATE divisions dv SET is_ride_enabled = CASE WHEN dv.ride_override THEN dv.is_ride_enabled ELSE d.is_ride_enabled END
      FROM districts d WHERE dv.district_id = d.id AND d.region_id = p_root_id;
      UPDATE post_offices po SET is_ride_enabled = CASE WHEN po.ride_override THEN po.is_ride_enabled ELSE dv.is_ride_enabled END
      FROM divisions dv JOIN districts d ON d.id = dv.district_id WHERE po.division_id = dv.id AND d.region_id = p_root_id;
      UPDATE pincodes p SET is_ride_enabled = CASE WHEN p.ride_override THEN p.is_ride_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_ride_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        JOIN districts d ON d.id = dv.district_id
        WHERE d.region_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'district' THEN
      UPDATE divisions dv SET is_ride_enabled = CASE WHEN dv.ride_override THEN dv.is_ride_enabled ELSE d.is_ride_enabled END
      FROM districts d WHERE dv.district_id = d.id AND d.id = p_root_id;
      UPDATE post_offices po SET is_ride_enabled = CASE WHEN po.ride_override THEN po.is_ride_enabled ELSE dv.is_ride_enabled END
      FROM divisions dv WHERE po.division_id = dv.id AND dv.district_id = p_root_id;
      UPDATE pincodes p SET is_ride_enabled = CASE WHEN p.ride_override THEN p.is_ride_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_ride_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        WHERE dv.district_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'division' THEN
      UPDATE post_offices po SET is_ride_enabled = CASE WHEN po.ride_override THEN po.is_ride_enabled ELSE dv.is_ride_enabled END
      FROM divisions dv WHERE po.division_id = dv.id AND dv.id = p_root_id;
      UPDATE pincodes p SET is_ride_enabled = CASE WHEN p.ride_override THEN p.is_ride_enabled ELSE x.peff END
      FROM (
        SELECT ppo.pincode_id AS pid, bool_and(po.is_ride_enabled) AS peff
        FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        WHERE po.division_id = p_root_id
        GROUP BY ppo.pincode_id
      ) x WHERE p.id = x.pid;
    ELSIF p_root_level = 'post_office' THEN
      UPDATE pincodes p SET is_ride_enabled = CASE WHEN p.ride_override THEN p.is_ride_enabled ELSE po.is_ride_enabled END
      FROM pincode_post_offices ppo
      JOIN post_offices po ON po.id = ppo.post_office_id
      WHERE ppo.post_office_id = p_root_id AND p.id = ppo.pincode_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION geo_toggle_service(
  p_level text,
  p_id uuid,
  p_service text,
  p_value boolean
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_en text;
  v_ov text;
BEGIN
  IF p_service NOT IN ('food', 'parcel', 'ride') THEN
    RAISE EXCEPTION 'invalid service %', p_service;
  END IF;

  v_en := CASE p_service
    WHEN 'food' THEN 'is_food_enabled'
    WHEN 'parcel' THEN 'is_parcel_enabled'
    ELSE 'is_ride_enabled'
  END;
  v_ov := CASE p_service
    WHEN 'food' THEN 'food_override'
    WHEN 'parcel' THEN 'parcel_override'
    ELSE 'ride_override'
  END;

  IF p_level = 'state' THEN
    EXECUTE format(
      'UPDATE states SET %I = $1, %I = true WHERE id = $2',
      v_en, v_ov
    ) USING p_value, p_id;
    IF NOT p_value THEN
      UPDATE regions SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE state_id = p_id;
      UPDATE districts d SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE region_id IN (SELECT id FROM regions WHERE state_id = p_id);
      UPDATE divisions dv SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE district_id IN (
        SELECT d.id FROM districts d
        JOIN regions r ON r.id = d.region_id
        WHERE r.state_id = p_id
      );
      UPDATE post_offices po SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE division_id IN (
        SELECT dv.id FROM divisions dv
        JOIN districts d ON d.id = dv.district_id
        JOIN regions r ON r.id = d.region_id
        WHERE r.state_id = p_id
      );
      UPDATE pincodes p SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE id IN (
        SELECT ppo.pincode_id FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        JOIN districts d ON d.id = dv.district_id
        JOIN regions r ON r.id = d.region_id
        WHERE r.state_id = p_id
      );
    ELSE
      PERFORM geo_recompute_service_subtree('state', p_id, p_service);
    END IF;
    RETURN;
  END IF;

  IF p_level = 'region' THEN
    EXECUTE format('UPDATE regions SET %I = $1, %I = true WHERE id = $2', v_en, v_ov)
      USING p_value, p_id;
    IF NOT p_value THEN
      UPDATE districts SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE region_id = p_id;
      UPDATE divisions dv SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE district_id IN (SELECT id FROM districts WHERE region_id = p_id);
      UPDATE post_offices po SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE division_id IN (
        SELECT dv.id FROM divisions dv
        JOIN districts d ON d.id = dv.district_id
        WHERE d.region_id = p_id
      );
      UPDATE pincodes p SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE id IN (
        SELECT ppo.pincode_id FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        JOIN districts d ON d.id = dv.district_id
        WHERE d.region_id = p_id
      );
    ELSE
      PERFORM geo_recompute_service_subtree('region', p_id, p_service);
    END IF;
    RETURN;
  END IF;

  IF p_level = 'district' THEN
    EXECUTE format('UPDATE districts SET %I = $1, %I = true WHERE id = $2', v_en, v_ov)
      USING p_value, p_id;
    IF NOT p_value THEN
      UPDATE divisions SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE district_id = p_id;
      UPDATE post_offices po SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE division_id IN (SELECT id FROM divisions WHERE district_id = p_id);
      UPDATE pincodes p SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE id IN (
        SELECT ppo.pincode_id FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        JOIN divisions dv ON dv.id = po.division_id
        WHERE dv.district_id = p_id
      );
    ELSE
      PERFORM geo_recompute_service_subtree('district', p_id, p_service);
    END IF;
    RETURN;
  END IF;

  IF p_level = 'division' THEN
    EXECUTE format('UPDATE divisions SET %I = $1, %I = true WHERE id = $2', v_en, v_ov)
      USING p_value, p_id;
    IF NOT p_value THEN
      UPDATE post_offices SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE division_id = p_id;
      UPDATE pincodes p SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE id IN (
        SELECT ppo.pincode_id FROM pincode_post_offices ppo
        JOIN post_offices po ON po.id = ppo.post_office_id
        WHERE po.division_id = p_id
      );
    ELSE
      PERFORM geo_recompute_service_subtree('division', p_id, p_service);
    END IF;
    RETURN;
  END IF;

  IF p_level = 'post_office' THEN
    EXECUTE format('UPDATE post_offices SET %I = $1, %I = true WHERE id = $2', v_en, v_ov)
      USING p_value, p_id;
    IF NOT p_value THEN
      UPDATE pincodes p SET
        is_food_enabled = CASE WHEN p_service = 'food' THEN false ELSE is_food_enabled END,
        is_parcel_enabled = CASE WHEN p_service = 'parcel' THEN false ELSE is_parcel_enabled END,
        is_ride_enabled = CASE WHEN p_service = 'ride' THEN false ELSE is_ride_enabled END,
        food_override = CASE WHEN p_service = 'food' THEN false ELSE food_override END,
        parcel_override = CASE WHEN p_service = 'parcel' THEN false ELSE parcel_override END,
        ride_override = CASE WHEN p_service = 'ride' THEN false ELSE ride_override END
      WHERE id IN (SELECT pincode_id FROM pincode_post_offices WHERE post_office_id = p_id);
    ELSE
      PERFORM geo_recompute_service_subtree('post_office', p_id, p_service);
    END IF;
    RETURN;
  END IF;

  IF p_level = 'pincode' THEN
    EXECUTE format('UPDATE pincodes SET %I = $1, %I = true WHERE id = $2', v_en, v_ov)
      USING p_value, p_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'invalid level %', p_level;
END;
$$;
