/**
 * Rider → merchant (Mx) and rider → customer (Cx) distances at assignment milestones.
 * Uses live rider GPS + order pickup/drop from orders_core (Haversine, km, 3 decimals).
 */
import { getSql } from "../db/client.js";
import { haversineDistanceMeters } from "./order-assignment-engine.js";
import type { RiderDistanceSnapshot } from "./order-rider-assignment-history.js";

function parseCoord(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : null;
}

function roundKmFromMeters(meters: number): number {
  return Math.round((meters / 1000) * 1000) / 1000;
}

function isValidCoord(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/** Best available rider GPS — no dispatch freshness gate (milestones may occur off-duty). */
export async function loadRiderGpsForTimeline(
  riderId: number
): Promise<{ lat: number; lng: number } | null> {
  try {
    const sqlClient = getSql();
    const [position] = (await sqlClient`
      WITH latest_ping AS (
        SELECT DISTINCT ON (rle.user_id)
          (substring(rle.user_id from 'usr_(\\d+)'))::int AS rider_id,
          rle.lat,
          rle.lng
        FROM rider_location_events rle
        WHERE rle.user_id = ${`usr_${riderId}`}
        ORDER BY rle.user_id, rle.ts_ms DESC
      )
      SELECT
        COALESCE(rll.latitude::float, lp.lat, r.lat::float) AS lat,
        COALESCE(rll.longitude::float, lp.lng, r.lon::float) AS lng
      FROM riders r
      LEFT JOIN rider_live_locations rll ON rll.rider_id = r.id
      LEFT JOIN latest_ping lp ON lp.rider_id = r.id
      WHERE r.id = ${riderId}
      LIMIT 1
    `) as Array<{ lat: number | null; lng: number | null }>;

    if (position?.lat == null || position?.lng == null) return null;
    const lat = Number(position.lat);
    const lng = Number(position.lng);
    if (!isValidCoord(lat, lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export async function loadOrderPickupDropCoords(orderCorePk: number): Promise<{
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
} | null> {
  try {
    const sqlClient = getSql();
    const [row] = (await sqlClient`
      SELECT pickup_lat, pickup_lon, drop_lat, drop_lon
      FROM orders_core
      WHERE id = ${orderCorePk}
      LIMIT 1
    `) as Array<{
      pickup_lat: unknown;
      pickup_lon: unknown;
      drop_lat: unknown;
      drop_lon: unknown;
    }>;
    if (!row) return null;

    const pickupLat = parseCoord(row.pickup_lat);
    const pickupLng = parseCoord(row.pickup_lon);
    const dropLat = parseCoord(row.drop_lat);
    const dropLng = parseCoord(row.drop_lon);
    if (
      pickupLat == null ||
      pickupLng == null ||
      dropLat == null ||
      dropLng == null ||
      !isValidCoord(pickupLat, pickupLng) ||
      !isValidCoord(dropLat, dropLng)
    ) {
      return null;
    }

    return { pickupLat, pickupLng, dropLat, dropLng };
  } catch {
    return null;
  }
}

export function computeRiderDistanceSnapshot(
  riderLat: number,
  riderLng: number,
  coords: {
    pickupLat: number;
    pickupLng: number;
    dropLat: number;
    dropLng: number;
  }
): RiderDistanceSnapshot {
  const mxMeters = haversineDistanceMeters(
    riderLat,
    riderLng,
    coords.pickupLat,
    coords.pickupLng
  );
  const cxMeters = haversineDistanceMeters(
    riderLat,
    riderLng,
    coords.dropLat,
    coords.dropLng
  );
  return {
    riderLat,
    riderLng,
    merchantDistanceKm: roundKmFromMeters(mxMeters),
    customerDistanceKm: roundKmFromMeters(cxMeters),
  };
}

/** Never throws — returns null when GPS or order coords are unavailable. */
export async function resolveRiderOrderDistanceSnapshot(
  riderId: number,
  orderCorePk: number,
  explicitGps?: { lat?: number | null; lng?: number | null }
): Promise<RiderDistanceSnapshot | null> {
  try {
    const coords = await loadOrderPickupDropCoords(orderCorePk);
    if (!coords) return null;

    const explicitLat = parseCoord(explicitGps?.lat);
    const explicitLng = parseCoord(explicitGps?.lng);
    const gps =
      explicitLat != null && explicitLng != null && isValidCoord(explicitLat, explicitLng)
        ? { lat: explicitLat, lng: explicitLng }
        : await loadRiderGpsForTimeline(riderId);

    if (!gps) return null;
    return computeRiderDistanceSnapshot(gps.lat, gps.lng, coords);
  } catch {
    return null;
  }
}

/** Pickup leg (rider → merchant) stored at accept/assign milestone. */
export async function loadStoredPickupDistanceKm(
  orderCorePk: number,
  riderId: number
): Promise<number | null> {
  try {
    const sqlClient = getSql();
    const rows = (await sqlClient`
      SELECT merchant_distance_km
      FROM order_rider_assignment_timeline_events
      WHERE order_core_id = ${orderCorePk}
        AND rider_id = ${riderId}
        AND merchant_distance_km IS NOT NULL
        AND event_type IN ('accepted', 'assigned')
      ORDER BY
        CASE event_type WHEN 'accepted' THEN 0 ELSE 1 END,
        occurred_at DESC
      LIMIT 1
    `) as Array<{ merchant_distance_km: unknown }>;
    const km = Number(rows[0]?.merchant_distance_km);
    return Number.isFinite(km) && km > 0 ? km : null;
  } catch {
    return null;
  }
}

export function buildRiderOrderDistanceBreakdown(
  order: {
    distanceKm?: number;
    pickupDistanceKm?: number;
    tripDistanceKm?: number;
    totalDistanceKm?: number;
  },
  storedPickupKm?: number | null
): {
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  totalDistanceKm?: number;
  distanceKm?: number;
} {
  const tripKm =
    order.tripDistanceKm != null && order.tripDistanceKm > 0
      ? order.tripDistanceKm
      : order.distanceKm != null && order.distanceKm > 0
        ? order.distanceKm
        : undefined;

  const pickupKm =
    order.pickupDistanceKm != null && order.pickupDistanceKm > 0
      ? order.pickupDistanceKm
      : storedPickupKm != null && storedPickupKm > 0
        ? storedPickupKm
        : undefined;

  const totalKm =
    pickupKm != null && tripKm != null
      ? Math.round((pickupKm + tripKm) * 10) / 10
      : order.totalDistanceKm != null && order.totalDistanceKm > 0
        ? order.totalDistanceKm
        : tripKm ?? pickupKm;

  return {
    pickupDistanceKm: pickupKm,
    tripDistanceKm: tripKm,
    totalDistanceKm: totalKm,
    distanceKm: tripKm ?? order.distanceKm,
  };
}

export async function attachRiderOrderDistanceBreakdown<
  T extends {
    distanceKm?: number;
    pickupDistanceKm?: number;
    tripDistanceKm?: number;
    totalDistanceKm?: number;
  },
>(riderId: number, orderCorePk: number, order: T): Promise<T & ReturnType<typeof buildRiderOrderDistanceBreakdown>> {
  const storedPickup = await loadStoredPickupDistanceKm(orderCorePk, riderId);
  return { ...order, ...buildRiderOrderDistanceBreakdown(order, storedPickup) };
}
