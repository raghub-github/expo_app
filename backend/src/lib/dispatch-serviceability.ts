/**
 * Dispatch Engine — Phase 2: pre-placement serviceability.
 *
 * Decides whether a customer may place an order at a pickup location, REUSING the
 * existing geo stack rather than duplicating it:
 *   1. service enabled + Prevent Services  -> resolveGeoServiceAvailability (existing)
 *   2. self-pickup / delivery / internal-rider / 3PL toggles + service radius
 *      -> resolveGeoCoverage (dispatch-extension layer)
 *   3. rider availability within the service radius (the genuinely new gate)
 *
 * Rules (per product decisions):
 *   - Self-pickup: skip the rider check entirely (allow if self-pickup enabled here).
 *   - Delivery: require an available internal rider within the service radius, OR 3PL
 *     enabled for this location; otherwise BLOCK ("No riders are currently available.").
 *
 * The availability check here is intentionally looser than full dispatch eligibility
 * (order-assignment-engine): it answers "is there any on-duty rider for this service
 * near the pickup", which is the correct placement gate — strict per-order eligibility
 * remains the dispatch engine's job.
 */

import { getSql } from "../db/client.js";
import {
  RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES,
  type DispatchServiceType,
} from "./order-assignment-engine.js";
import { resolveGeoCoverage } from "./geo-coverage.js";

export type FulfillmentMode = "self_pickup" | "delivery";

export type ServiceabilityReason =
  | "serviceable"
  | "self_pickup_ok"
  | "outside_coverage"
  | "service_disabled"
  | "prevent_blocked"
  | "delivery_disabled"
  | "self_pickup_disabled"
  | "no_rider_available";

export type DispatchServiceabilityResult = {
  serviceable: boolean;
  reason: ServiceabilityReason;
  message: string;
  serviceEnabled: boolean;
  selfPickupEnabled: boolean;
  deliveryEnabled: boolean;
  internalRiderEnabled: boolean;
  tplEnabled: boolean;
  ridersAvailable: number;
  serviceRadiusMeters: number;
  /** True when placement is allowed only because 3PL is enabled (no internal rider). */
  usedTpl: boolean;
};

const SERVICE_LABEL: Record<DispatchServiceType, string> = {
  food: "Food delivery",
  parcel: "Parcel delivery",
  person_ride: "Ride",
};

/** Maps dispatch service to the geo-coverage service code ('ride' for person_ride). */
function geoServiceCode(serviceType: DispatchServiceType): "food" | "parcel" | "ride" {
  return serviceType === "person_ride" ? "ride" : serviceType;
}

/**
 * Count on-duty riders for a service with a fresh GPS ping inside `radiusMeters` of the
 * pickup. Bounding-box prefilter + haversine; mirrors the on-duty gate used by the
 * dispatch engine (duty ON, service selected, ACTIVE, fresh GPS).
 */
export async function countAvailableRidersWithinServiceRadius(
  serviceType: DispatchServiceType,
  pickup: { lat: number; lng: number },
  radiusMeters: number
): Promise<number> {
  if (
    !Number.isFinite(pickup.lat) ||
    !Number.isFinite(pickup.lng) ||
    !Number.isFinite(radiusMeters) ||
    radiusMeters <= 0
  ) {
    return 0;
  }

  const sql = getSql();
  const serviceJson = JSON.stringify([serviceType]);
  const latDelta = radiusMeters / 111_320;
  const cosLat = Math.max(0.01, Math.cos((pickup.lat * Math.PI) / 180));
  const lngDelta = radiusMeters / (111_320 * cosLat);

  const rows = (await sql`
    WITH candidates AS (
      SELECT rcl.lat AS lat, rcl.lng AS lng
      FROM rider_current_locations rcl
      INNER JOIN riders r ON r.id = rcl.rider_id
      INNER JOIN LATERAL (
        SELECT dl.status, dl.service_types
        FROM duty_logs dl
        WHERE dl.rider_id = rcl.rider_id
        ORDER BY dl.timestamp DESC
        LIMIT 1
      ) ld ON true
      WHERE rcl.updated_at >= NOW() - (${RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES} * INTERVAL '1 minute')
        AND r.status = 'ACTIVE'
        AND r.onboarding_stage = 'ACTIVE'
        AND r.deleted_at IS NULL
        AND ld.status = 'ON'
        AND COALESCE(ld.service_types, '[]'::jsonb) @> ${serviceJson}::jsonb
        AND rcl.lat BETWEEN ${pickup.lat - latDelta} AND ${pickup.lat + latDelta}
        AND rcl.lng BETWEEN ${pickup.lng - lngDelta} AND ${pickup.lng + lngDelta}
    )
    SELECT COUNT(*)::int AS cnt
    FROM candidates
    WHERE (
      6371008.8 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(lat - ${pickup.lat}) / 2), 2) +
        COS(RADIANS(${pickup.lat})) * COS(RADIANS(lat)) *
        POWER(SIN(RADIANS(lng - ${pickup.lng}) / 2), 2)
      ))
    ) <= ${radiusMeters}
  `) as Array<{ cnt: number }>;

  return Number(rows[0]?.cnt ?? 0);
}

/** Pre-placement serviceability decision for a pickup location + fulfillment mode. */
export async function checkDispatchServiceability(args: {
  serviceType: DispatchServiceType;
  fulfillment: FulfillmentMode;
  pickup: {
    lat: number;
    lng: number;
    pincode?: string | null;
    state?: string | null;
  };
}): Promise<DispatchServiceabilityResult> {
  const { serviceType, fulfillment, pickup } = args;
  const label = SERVICE_LABEL[serviceType];
  const serviceCode = geoServiceCode(serviceType);

  // 1) Existing geo authority: service enabled + Prevent Services.
  const { resolveGeoServiceAvailability } = await import(
    "../modules/geo/geoServiceAvailability.service.js"
  );
  const avail = await resolveGeoServiceAvailability({
    pincode: pickup.pincode,
    state: pickup.state,
    lat: pickup.lat,
    lng: pickup.lng,
  });

  const serviceEnabled =
    serviceCode === "food" ? avail.food : serviceCode === "parcel" ? avail.parcel : avail.ride;
  const preventBlocked = (avail.preventBlocked ?? []).includes(serviceCode);

  // 2) Dispatch-extension layer: self-pickup / delivery / internal-rider / 3PL + radius.
  const cov = await resolveGeoCoverage(serviceType, {
    pincode: avail.pincode,
    state: avail.stateName,
  });

  const base = {
    serviceEnabled,
    selfPickupEnabled: cov.selfPickupEnabled,
    deliveryEnabled: cov.deliveryEnabled,
    internalRiderEnabled: cov.internalRiderEnabled,
    tplEnabled: cov.tplEnabled,
    ridersAvailable: 0,
    serviceRadiusMeters: cov.serviceRadiusMeters,
    usedTpl: false,
  };

  if (!avail.found) {
    return {
      serviceable: false,
      reason: "outside_coverage",
      message: "We don't serve this location yet.",
      ...base,
    };
  }
  if (!serviceEnabled) {
    return preventBlocked
      ? {
          serviceable: false,
          reason: "prevent_blocked",
          message: avail.preventReason ?? "Service is temporarily unavailable in this area.",
          ...base,
        }
      : {
          serviceable: false,
          reason: "service_disabled",
          message: `${label} isn't available at this location.`,
          ...base,
        };
  }
  // Optional dispatch-level kill switch (geo_coverage.enabled) for this service+location.
  if (!cov.enabled) {
    return {
      serviceable: false,
      reason: "service_disabled",
      message: `${label} isn't available at this location.`,
      ...base,
    };
  }

  // Self-pickup: no rider needed.
  if (fulfillment === "self_pickup") {
    return cov.selfPickupEnabled
      ? { serviceable: true, reason: "self_pickup_ok", message: "", ...base }
      : {
          serviceable: false,
          reason: "self_pickup_disabled",
          message: "Self-pickup isn't available here.",
          ...base,
        };
  }

  // Delivery.
  if (!cov.deliveryEnabled) {
    return {
      serviceable: false,
      reason: "delivery_disabled",
      message: "Delivery isn't available here.",
      ...base,
    };
  }

  let ridersAvailable = 0;
  if (cov.internalRiderEnabled) {
    ridersAvailable = await countAvailableRidersWithinServiceRadius(
      serviceType,
      { lat: pickup.lat, lng: pickup.lng },
      cov.serviceRadiusMeters
    );
  }

  if (ridersAvailable > 0) {
    return { serviceable: true, reason: "serviceable", message: "", ...base, ridersAvailable };
  }
  if (cov.tplEnabled) {
    return {
      serviceable: true,
      reason: "serviceable",
      message: "",
      ...base,
      ridersAvailable,
      usedTpl: true,
    };
  }
  return {
    serviceable: false,
    reason: "no_rider_available",
    message: "No riders are currently available. Please try again shortly.",
    ...base,
    ridersAvailable,
  };
}
