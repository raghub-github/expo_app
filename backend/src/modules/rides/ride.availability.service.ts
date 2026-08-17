/**
 * Nearby on-duty rider supply for customer ride booking.
 */

import { asc, eq } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import { customerRideServiceCatalog } from "../../db/schema.js";
import {
  isCatalogOptionEligibleForTrip,
  loadRideVehicleLimitsForState,
  resolveRideStateIdFromCoords,
} from "../ride-state-config/index.js";

/** Default search radius for map pins / nearest-ETA (options still return with 0 riders). */
export const DEFAULT_RIDE_SUPPLY_RADIUS_KM = 8;
export const RIDER_LOCATION_MAX_AGE_MINUTES = 10;

export type NearbySupplyRider = {
  riderId: number;
  lat: number;
  lng: number;
  heading: number | null;
  distanceKm: number;
  vehicleType: string;
  acType: string | null;
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
  /** Active catalog codes (for fare batch) — independent of nearby supply. */
  catalogCodes: string[];
  options: RideAvailabilityOption[];
  riders: Array<{
    riderId: number;
    lat: number;
    lng: number;
    heading: number | null;
    distanceKm: number;
    vehicleType: string;
    vehicleTypes: string[];
    acType: string | null;
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

function resolveRiderAcType(row: {
  ac_type: string | null;
  limitation_flags: unknown;
}): string | null {
  const fromDb = row.ac_type?.trim();
  if (fromDb === "AC" || fromDb === "Non-AC") return fromDb;

  const flags =
    row.limitation_flags && typeof row.limitation_flags === "object" && !Array.isArray(row.limitation_flags)
      ? (row.limitation_flags as Record<string, unknown>)
      : null;
  const onboardingCode =
    typeof flags?.onboardingVehicleTypeCode === "string"
      ? flags.onboardingVehicleTypeCode.trim().toLowerCase()
      : "";
  if (!onboardingCode) return null;
  if (onboardingCode.includes("non_ac")) return "Non-AC";
  if (onboardingCode.endsWith("_ac") || onboardingCode.includes("_ac_")) return "AC";
  return null;
}

function riderMatchesCatalogOption(
  rider: NearbySupplyRider & { vehicleTypes: Set<string> },
  catalogCode: string,
  matchTypes: string[]
): boolean {
  const hasVehicleType = [...rider.vehicleTypes].some((vt) => matchTypes.includes(vt));
  if (!hasVehicleType) return false;
  if (catalogCode === "cab-economy") return rider.acType === "Non-AC";
  if (catalogCode === "cab-premium") return rider.acType === "AC";
  return true;
}

export async function getNearbyRideSupply(input: {
  pickupLat: number;
  pickupLng: number;
  radiusKm?: number;
  rideType?: string;
  /** Duty service_types filter. Default person_ride; parcel for courier supply. */
  serviceType?: "person_ride" | "parcel";
  tripKm?: number;
  pickupPincode?: string | null;
  pickupState?: string | null;
}): Promise<RideAvailabilityResult> {
  const radiusKm = input.radiusKm ?? DEFAULT_RIDE_SUPPLY_RADIUS_KM;
  const tripKm = input.tripKm != null && Number.isFinite(input.tripKm) ? Math.max(0, input.tripKm) : null;
  const dutyService = input.serviceType === "parcel" ? "parcel" : "person_ride";
  const db = getDb();
  const sqlClient = getSql();

  // Approx bounding box — cuts candidates before haversine / duty lookups.
  const latDelta = radiusKm / 111;
  const cosLat = Math.cos((input.pickupLat * Math.PI) / 180);
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.abs(cosLat)));
  const minLat = input.pickupLat - latDelta;
  const maxLat = input.pickupLat + latDelta;
  const minLng = input.pickupLng - lngDelta;
  const maxLng = input.pickupLng + lngDelta;

  const [rideLimits, catalogRows, supplyRows] = await Promise.all([
    (async () => {
      if (tripKm == null) return [] as Awaited<ReturnType<typeof loadRideVehicleLimitsForState>>;
      const stateId = await resolveRideStateIdFromCoords({
        pickupLat: input.pickupLat,
        pickupLng: input.pickupLng,
        pickupPincode: input.pickupPincode,
        pickupState: input.pickupState,
      });
      if (!stateId) return [];
      return loadRideVehicleLimitsForState(stateId);
    })(),
    db
      .select()
      .from(customerRideServiceCatalog)
      .where(eq(customerRideServiceCatalog.isActive, true))
      .orderBy(asc(customerRideServiceCatalog.sortOrder)),
    // Start from recent GPS candidates, then LATERAL one latest duty row each
    // (uses duty_logs_rider_created_desc_idx). Never scan all of duty_logs.
    sqlClient`
      SELECT
        rp.rider_id,
        rp.lat,
        rp.lng,
        rp.heading,
        rv.vehicle_type,
        rv.ac_type,
        rv.limitation_flags,
        (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${input.pickupLat})) * cos(radians(rp.lat))
              * cos(radians(rp.lng) - radians(${input.pickupLng}))
              + sin(radians(${input.pickupLat})) * sin(radians(rp.lat))
            ))
          )
        ) AS distance_km
      FROM (
        SELECT
          rcl.rider_id,
          rcl.lat,
          rcl.lng,
          rcl.heading_deg AS heading
        FROM rider_current_locations rcl
        WHERE rcl.updated_at >= NOW() - (${RIDER_LOCATION_MAX_AGE_MINUTES} * INTERVAL '1 minute')
          AND rcl.lat BETWEEN ${minLat} AND ${maxLat}
          AND rcl.lng BETWEEN ${minLng} AND ${maxLng}
      ) rp
      INNER JOIN riders r ON r.id = rp.rider_id
      INNER JOIN LATERAL (
        SELECT dl.status, dl.service_types
        FROM duty_logs dl
        WHERE dl.rider_id = rp.rider_id
        ORDER BY dl.timestamp DESC
        LIMIT 1
      ) ld ON true
      INNER JOIN rider_vehicles rv ON rv.rider_id = rp.rider_id
      WHERE r.deleted_at IS NULL
        AND r.status <> 'BLOCKED'
        AND ld.status = 'ON'
        AND ld.service_types @> ${JSON.stringify([dutyService])}::text::jsonb
        AND rv.deleted_at IS NULL
        AND rv.is_active = true
        AND rv.verified = true
        AND COALESCE(rv.vehicle_active_status, 'active') = 'active'
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
    ` as Promise<
      Array<{
        rider_id: number;
        lat: number;
        lng: number;
        heading: number | null;
        vehicle_type: string;
        ac_type: string | null;
        limitation_flags: unknown;
        distance_km: number;
      }>
    >,
  ]);

  const ridersById = new Map<
    number,
    NearbySupplyRider & { vehicleTypes: Set<string> }
  >();

  for (const row of supplyRows) {
    const vehicleType = String(row.vehicle_type ?? "");
    const acType = resolveRiderAcType(row);
    const existing = ridersById.get(row.rider_id);
    if (existing) {
      existing.vehicleTypes.add(vehicleType);
      if (row.distance_km < existing.distanceKm) {
        existing.lat = row.lat;
        existing.lng = row.lng;
        existing.heading = row.heading != null ? parseNum(row.heading) : null;
        existing.distanceKm = parseNum(row.distance_km) ?? existing.distanceKm;
        existing.vehicleType = vehicleType;
        existing.acType = acType;
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
      acType,
      vehicleTypes: new Set([vehicleType]),
    });
  }

  const riders = Array.from(ridersById.values());
  const uniqueRiderIds = new Set(riders.map((r) => r.riderId));
  const options: RideAvailabilityOption[] = [];

  // Parcel clients map riders → 2W/3W/4W categories themselves — skip person_ride catalog
  // (and never surface bike-lite for courier).
  if (dutyService === "person_ride") {
  for (const row of catalogRows) {
    if (row.code === "travel") continue;

    if (tripKm != null && rideLimits.length > 0) {
      const eligible = isCatalogOptionEligibleForTrip({
        catalogCode: row.code,
        tripKm,
        limits: rideLimits,
      });
      if (!eligible) continue;
    }

    const matchTypes = (row.vehicleTypes ?? []).filter(Boolean);
    const matchingRiders = riders
      .filter((r) => riderMatchesCatalogOption(r, row.code, matchTypes))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // Only surface vehicle options that have at least one nearby on-duty rider.
    if (matchingRiders.length === 0) continue;

    const nearest = matchingRiders[0]!;
    const nearestKm = nearest.distanceKm;
    const nearestVehicle =
      [...nearest.vehicleTypes].find((vt) => matchTypes.includes(vt)) ?? nearest.vehicleType;
    const nearestEta = estimateRiderEtaMins(nearestKm, nearestVehicle);

    const subtitle =
      row.code === "cab-economy" || row.code === "cab-premium" ? null : row.subtitle;

    options.push({
      id: row.code,
      name: row.label,
      subtitle,
      baseFare: parseNum(row.baseFare) ?? 0,
      etaMins: nearestEta,
      capacity: row.capacity,
      tag: row.tag === "FASTEST" || row.tag === "SAVE" ? row.tag : null,
      imageKey: row.imageKey,
      vehicleTypes: matchTypes,
      nearbyRiderCount: matchingRiders.length,
      nearestRiderKm: nearestKm,
      nearestRiderEtaMins: nearestEta,
    });
  }
  }

  let mapRiders = riders;
  if (input.rideType) {
    const catalog = catalogRows.find((c) => c.code === input.rideType);
    const allowed = new Set((catalog?.vehicleTypes ?? []).filter(Boolean));
    mapRiders = riders.filter((r) =>
      riderMatchesCatalogOption(r, input.rideType!, [...allowed])
    );
  }

  const catalogCodes = catalogRows
    .map((row) => row.code)
    .filter((code) => code && code !== "travel");

  return {
    radiusKm,
    nearbyRiderCount: uniqueRiderIds.size,
    onDutyRiderCount: uniqueRiderIds.size,
    catalogCodes,
    options,
    riders: mapRiders.map((r) => ({
      riderId: r.riderId,
      lat: r.lat,
      lng: r.lng,
      heading: r.heading,
      distanceKm: r.distanceKm,
      vehicleType: r.vehicleType,
      vehicleTypes: [...r.vehicleTypes],
      acType: r.acType,
    })),
  };
}
