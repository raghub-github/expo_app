/**
 * Nearby on-duty rider supply for customer ride booking.
 */

import { asc, eq } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import { customerRideServiceCatalog } from "../../db/schema.js";

export const DEFAULT_RIDE_SUPPLY_RADIUS_KM = 2;
export const RIDER_LOCATION_MAX_AGE_MINUTES = 10;

export type NearbySupplyRider = {
  riderId: number;
  lat: number;
  lng: number;
  heading: number | null;
  distanceKm: number;
  vehicleType: string;
};

export type RideAvailabilityOption = {
  id: string;
  name: string;
  subtitle: string | null;
  baseFare: number;
  etaMins: number;
  capacity: number | null;
  tag: "FASTEST" | "SAVE" | null;
  imageKey: string;
  vehicleTypes: string[];
  nearbyRiderCount: number;
  nearestRiderKm: number | null;
  nearestRiderEtaMins: number | null;
};

export type RideAvailabilityResult = {
  radiusKm: number;
  nearbyRiderCount: number;
  onDutyRiderCount: number;
  options: RideAvailabilityOption[];
  riders: Array<{
    riderId: number;
    lat: number;
    lng: number;
    heading: number | null;
    distanceKm: number;
    vehicleType: string;
    vehicleTypes: string[];
  }>;
};

function parseNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function estimateRiderEtaMins(distanceKm: number, vehicleType: string): number {
  const isTwoWheeler = ["bike", "ev_bike", "cycle"].includes(vehicleType);
  const speedKmh = isTwoWheeler ? 22 : 16;
  return Math.max(1, Math.ceil((distanceKm / speedKmh) * 60));
}

export async function getNearbyRideSupply(input: {
  pickupLat: number;
  pickupLng: number;
  radiusKm?: number;
  rideType?: string;
}): Promise<RideAvailabilityResult> {
  const radiusKm = input.radiusKm ?? DEFAULT_RIDE_SUPPLY_RADIUS_KM;
  const db = getDb();
  const sqlClient = getSql();

  const catalogRows = await db
    .select()
    .from(customerRideServiceCatalog)
    .where(eq(customerRideServiceCatalog.isActive, true))
    .orderBy(asc(customerRideServiceCatalog.sortOrder));

  const supplyRows = (await sqlClient`
    WITH latest_duty AS (
      SELECT DISTINCT ON (dl.rider_id)
        dl.rider_id,
        dl.status,
        dl.service_types
      FROM duty_logs dl
      ORDER BY dl.rider_id, dl.timestamp DESC
    ),
    latest_ping AS (
      SELECT DISTINCT ON (rle.user_id)
        (substring(rle.user_id from 'usr_(\\d+)'))::int AS rider_id,
        rle.lat,
        rle.lng,
        rle.heading_deg AS heading,
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
        COALESCE(rll.heading::float, lp.heading) AS heading,
        COALESCE(rll.updated_at, lp.updated_at) AS updated_at
      FROM rider_live_locations rll
      FULL OUTER JOIN latest_ping lp ON lp.rider_id = rll.rider_id
      WHERE COALESCE(rll.rider_id, lp.rider_id) IS NOT NULL
    )
    SELECT
      rp.rider_id,
      rp.lat,
      rp.lng,
      rp.heading,
      rv.vehicle_type,
      (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${input.pickupLat})) * cos(radians(rp.lat))
            * cos(radians(rp.lng) - radians(${input.pickupLng}))
            + sin(radians(${input.pickupLat})) * sin(radians(rp.lat))
          ))
        )
      ) AS distance_km
    FROM rider_positions rp
    INNER JOIN riders r ON r.id = rp.rider_id
    INNER JOIN latest_duty ld ON ld.rider_id = rp.rider_id
    INNER JOIN rider_vehicles rv ON rv.rider_id = rp.rider_id
    WHERE r.deleted_at IS NULL
      AND r.status <> 'BLOCKED'
      AND ld.status = 'ON'
      AND ld.service_types @> '["person_ride"]'::jsonb
      AND rv.deleted_at IS NULL
      AND rv.is_active = true
      AND rv.verified = true
      AND COALESCE(rv.vehicle_active_status, 'active') = 'active'
      AND rp.updated_at >= NOW() - (${RIDER_LOCATION_MAX_AGE_MINUTES} * INTERVAL '1 minute')
      AND (
        6371 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${input.pickupLat})) * cos(radians(rp.lat))
            * cos(radians(rp.lng) - radians(${input.pickupLng}))
            + sin(radians(${input.pickupLat})) * sin(radians(rp.lat))
          ))
        )
      ) <= ${radiusKm}
    ORDER BY distance_km ASC
  `) as Array<{
    rider_id: number;
    lat: number;
    lng: number;
    heading: number | null;
    vehicle_type: string;
    distance_km: number;
  }>;

  const ridersById = new Map<
    number,
    NearbySupplyRider & { vehicleTypes: Set<string> }
  >();

  for (const row of supplyRows) {
    const vehicleType = String(row.vehicle_type ?? "");
    const existing = ridersById.get(row.rider_id);
    if (existing) {
      existing.vehicleTypes.add(vehicleType);
      if (row.distance_km < existing.distanceKm) {
        existing.lat = row.lat;
        existing.lng = row.lng;
        existing.heading = row.heading != null ? parseNum(row.heading) : null;
        existing.distanceKm = parseNum(row.distance_km) ?? existing.distanceKm;
      }
      continue;
    }
    ridersById.set(row.rider_id, {
      riderId: row.rider_id,
      lat: row.lat,
      lng: row.lng,
      heading: row.heading != null ? parseNum(row.heading) : null,
      distanceKm: parseNum(row.distance_km) ?? 0,
      vehicleType,
      vehicleTypes: new Set([vehicleType]),
    });
  }

  const riders = Array.from(ridersById.values());

  const uniqueRiderIds = new Set(riders.map((r) => r.riderId));

  const options: RideAvailabilityOption[] = [];

  for (const row of catalogRows) {
    const matchTypes = (row.vehicleTypes ?? []).filter(Boolean);
    const matchingRiders = riders
      .filter((r) => [...r.vehicleTypes].some((vt) => matchTypes.includes(vt)))
      .sort((a, b) => a.distanceKm - b.distanceKm);
    if (matchingRiders.length === 0) continue;

    const nearest = matchingRiders[0]!;
    const nearestKm = nearest.distanceKm;
    const nearestVehicle =
      [...nearest.vehicleTypes].find((vt) => matchTypes.includes(vt)) ?? nearest.vehicleType;
    const nearestEta = estimateRiderEtaMins(nearestKm, nearestVehicle);

    options.push({
      id: row.code,
      name: row.label,
      subtitle: row.subtitle,
      baseFare: parseNum(row.baseFare) ?? 0,
      etaMins: row.etaMins ?? 3,
      capacity: row.capacity,
      tag: row.tag === "FASTEST" || row.tag === "SAVE" ? row.tag : null,
      imageKey: row.imageKey,
      vehicleTypes: matchTypes,
      nearbyRiderCount: matchingRiders.length,
      nearestRiderKm: nearestKm,
      nearestRiderEtaMins: nearestEta,
    });
  }

  let mapRiders = riders;
  if (input.rideType) {
    const catalog = catalogRows.find((c) => c.code === input.rideType);
    const allowed = new Set((catalog?.vehicleTypes ?? []).filter(Boolean));
    mapRiders = riders.filter((r) => [...r.vehicleTypes].some((vt) => allowed.has(vt)));
  }

  return {
    radiusKm,
    nearbyRiderCount: uniqueRiderIds.size,
    onDutyRiderCount: uniqueRiderIds.size,
    options,
    riders: mapRiders.map((r) => ({
      riderId: r.riderId,
      lat: r.lat,
      lng: r.lng,
      heading: r.heading,
      distanceKm: r.distanceKm,
      vehicleType: r.vehicleType,
      vehicleTypes: [...r.vehicleTypes],
    })),
  };
}
