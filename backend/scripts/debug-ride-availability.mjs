import postgres from "postgres";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const riderId = Number(process.argv[2] ?? 1052);
const pickupLat = Number(process.argv[3] ?? 24.7969);
const pickupLng = Number(process.argv[4] ?? 84.9914);

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

try {
  const [rider] = await sql`
    SELECT id, status, deleted_at, city FROM riders WHERE id = ${riderId}
  `;
  const duty = await sql`
    SELECT rider_id, status, service_types, timestamp
    FROM duty_logs WHERE rider_id = ${riderId}
    ORDER BY timestamp DESC LIMIT 3
  `;
  const live = await sql`
    SELECT rider_id, latitude, longitude, updated_at
    FROM rider_live_locations WHERE rider_id = ${riderId}
  `;
  const ping = await sql`
    SELECT lat, lng, ts_ms, created_at
    FROM rider_location_events
    WHERE user_id = ${`usr_${riderId}`}
    ORDER BY ts_ms DESC LIMIT 3
  `;
  const vehicle = await sql`
    SELECT id, vehicle_type, verified, is_active, vehicle_active_status, deleted_at
    FROM rider_vehicles WHERE rider_id = ${riderId}
  `;
  const [catalog] = await sql`
    SELECT count(*)::int AS n FROM customer_ride_service_catalog
  `;

  const supply = await sql`
    WITH latest_duty AS (
      SELECT DISTINCT ON (dl.rider_id)
        dl.rider_id, dl.status, dl.service_types
      FROM duty_logs dl
      ORDER BY dl.rider_id, dl.timestamp DESC
    ),
    latest_ping AS (
      SELECT DISTINCT ON (rle.user_id)
        (substring(rle.user_id from 'usr_(\\d+)'))::int AS rider_id,
        rle.lat, rle.lng, rle.heading_deg AS heading,
        to_timestamp(rle.ts_ms / 1000.0) AT TIME ZONE 'UTC' AS updated_at
      FROM rider_location_events rle
      WHERE rle.user_id ~ '^usr_\\d+$'
      ORDER BY rle.user_id, rle.ts_ms DESC
    ),
    rider_positions AS (
      SELECT
        COALESCE(rll.rider_id, lp.rider_id) AS rider_id,
        COALESCE(rll.latitude::float, lp.lat) AS lat,
        COALESCE(rll.longitude::float, lp.lng) AS lng,
        COALESCE(rll.updated_at, lp.updated_at) AS updated_at
      FROM rider_live_locations rll
      FULL OUTER JOIN latest_ping lp ON lp.rider_id = rll.rider_id
      WHERE COALESCE(rll.rider_id, lp.rider_id) IS NOT NULL
    )
    SELECT rp.rider_id, rp.lat, rp.lng, rp.updated_at, rv.vehicle_type, ld.status, ld.service_types,
      (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${pickupLat})) * cos(radians(rp.lat))
            * cos(radians(rp.lng) - radians(${pickupLng}))
            + sin(radians(${pickupLat})) * sin(radians(rp.lat))
          ))
        )
      ) AS distance_km
    FROM rider_positions rp
    INNER JOIN riders r ON r.id = rp.rider_id
    INNER JOIN latest_duty ld ON ld.rider_id = rp.rider_id
    INNER JOIN rider_vehicles rv ON rv.rider_id = rp.rider_id
    WHERE r.id = ${riderId}
  `;

  const supplyFiltered = await sql`
    WITH latest_duty AS (
      SELECT DISTINCT ON (dl.rider_id)
        dl.rider_id, dl.status, dl.service_types
      FROM duty_logs dl
      ORDER BY dl.rider_id, dl.timestamp DESC
    ),
    latest_ping AS (
      SELECT DISTINCT ON (rle.user_id)
        (substring(rle.user_id from 'usr_(\\d+)'))::int AS rider_id,
        rle.lat, rle.lng, rle.heading_deg AS heading,
        to_timestamp(rle.ts_ms / 1000.0) AT TIME ZONE 'UTC' AS updated_at
      FROM rider_location_events rle
      WHERE rle.user_id ~ '^usr_\\d+$'
      ORDER BY rle.user_id, rle.ts_ms DESC
    ),
    rider_positions AS (
      SELECT
        COALESCE(rll.rider_id, lp.rider_id) AS rider_id,
        COALESCE(rll.latitude::float, lp.lat) AS lat,
        COALESCE(rll.longitude::float, lp.lng) AS lng,
        COALESCE(rll.updated_at, lp.updated_at) AS updated_at
      FROM rider_live_locations rll
      FULL OUTER JOIN latest_ping lp ON lp.rider_id = rll.rider_id
      WHERE COALESCE(rll.rider_id, lp.rider_id) IS NOT NULL
    )
    SELECT rp.rider_id, rp.lat, rp.lng, rp.updated_at,
      NOW() - rp.updated_at AS age,
      rv.vehicle_type, ld.status, ld.service_types
    FROM rider_positions rp
    INNER JOIN riders r ON r.id = rp.rider_id
    INNER JOIN latest_duty ld ON ld.rider_id = rp.rider_id
    INNER JOIN rider_vehicles rv ON rv.rider_id = rp.rider_id
    WHERE r.id = ${riderId}
      AND r.deleted_at IS NULL
      AND r.status <> 'BLOCKED'
      AND ld.status = 'ON'
      AND ld.service_types @> '["person_ride"]'::jsonb
      AND rv.deleted_at IS NULL
      AND rv.is_active = true
      AND rv.verified = true
      AND COALESCE(rv.vehicle_active_status, 'active') = 'active'
      AND rp.updated_at >= NOW() - (5 * INTERVAL '1 minute')
  `;

  console.log(
    JSON.stringify(
      { pickupLat, pickupLng, rider, duty, live, ping, vehicle, catalog, supply, supplyFiltered },
      null,
      2
    )
  );
} finally {
  await sql.end();
}
