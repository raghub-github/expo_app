/**
 * Milestone geo-fence validation for Food, Parcel, and Person Ride (DB-driven radii).
 */

import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import { ordersCore } from "../db/schema.js";
import {
  haversineDistanceMeters,
  loadRiderGps,
  type DispatchServiceType,
} from "./order-assignment-engine.js";

export type StatusMilestoneKey =
  | "reach_store"
  | "mark_picked_up"
  | "reach_customer"
  | "mark_delivered"
  | "reach_pickup"
  | "pickup_confirmation"
  | "reach_drop"
  | "delivery_confirmation"
  | "start_ride"
  | "reach_destination"
  | "complete_ride";

export type MilestoneGeoEvaluation = {
  milestoneKey: StatusMilestoneKey;
  serviceType: DispatchServiceType;
  radiusMeters: number;
  distanceMeters: number;
  withinRadius: boolean;
  targetLatitude: number;
  targetLongitude: number;
  riderLatitude: number;
  riderLongitude: number;
  blockedMessage: string | null;
};

export class RiderGeoFenceBlockedError extends Error {
  statusCode: number;
  code: string;
  distanceMeters: number;
  requiredRadiusMeters: number;

  constructor(
    message: string,
    distanceMeters: number,
    requiredRadiusMeters: number
  ) {
    super(message);
    this.name = "RiderGeoFenceBlockedError";
    this.statusCode = 403;
    this.code = "RIDER_GEO_FENCE_BLOCKED";
    this.distanceMeters = distanceMeters;
    this.requiredRadiusMeters = requiredRadiusMeters;
  }
}

export class RiderGeoFenceConfigError extends Error {
  statusCode = 503;

  constructor(message: string) {
    super(message);
    this.name = "RiderGeoFenceConfigError";
  }
}

const FOOD_MILESTONES: StatusMilestoneKey[] = [
  "reach_store",
  "mark_picked_up",
  "reach_customer",
  "mark_delivered",
];

const PARCEL_MILESTONES: StatusMilestoneKey[] = [
  "reach_pickup",
  "pickup_confirmation",
  "reach_drop",
  "delivery_confirmation",
];

const RIDE_MILESTONES: StatusMilestoneKey[] = [
  "reach_pickup",
  "pickup_confirmation",
  "start_ride",
  "reach_destination",
  "complete_ride",
];

export function milestonesForService(serviceType: DispatchServiceType): StatusMilestoneKey[] {
  if (serviceType === "food") return FOOD_MILESTONES;
  if (serviceType === "parcel") return PARCEL_MILESTONES;
  return RIDE_MILESTONES;
}

function parseCoord(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function milestoneUsesPickup(milestoneKey: StatusMilestoneKey): boolean {
  return (
    milestoneKey === "reach_store" ||
    milestoneKey === "mark_picked_up" ||
    milestoneKey === "reach_pickup" ||
    milestoneKey === "pickup_confirmation" ||
    milestoneKey === "start_ride"
  );
}

function formatBlockedMessage(radiusMeters: number, label: string): string {
  return `Move within ${radiusMeters} meters of the ${label} to continue.`;
}

/** Load active radius for service + milestone from platform_rider_status_radius_rules. */
export async function fetchStatusRadiusMeters(
  serviceType: DispatchServiceType,
  milestoneKey: StatusMilestoneKey
): Promise<number> {
  const sqlClient = getSql();
  const rows = (await sqlClient`
    SELECT radius_meters
    FROM platform_rider_status_radius_rules
    WHERE service_type = ${serviceType}
      AND milestone_key = ${milestoneKey}
      AND is_active = true
    LIMIT 1
  `) as Array<{ radius_meters: number }>;

  const meters = Number(rows[0]?.radius_meters);
  if (!Number.isFinite(meters) || meters <= 0) {
    throw new RiderGeoFenceConfigError(
      `Status radius not configured for ${serviceType}/${milestoneKey}`
    );
  }
  return Math.round(meters);
}

async function resolveOrderTargetForMilestone(
  orderCorePk: number,
  milestoneKey: StatusMilestoneKey
): Promise<{ latitude: number; longitude: number; label: string }> {
  const db = getDb();
  const [row] = await db
    .select({
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      orderType: ordersCore.orderType,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, orderCorePk))
    .limit(1);

  if (!row) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  const usePickup = milestoneUsesPickup(milestoneKey);
  const lat = parseCoord(usePickup ? row.pickupLat : row.dropLat);
  const lng = parseCoord(usePickup ? row.pickupLon : row.dropLon);

  if (lat == null || lng == null) {
    throw Object.assign(new Error("Order location coordinates are missing"), {
      statusCode: 422,
    });
  }

  const label = usePickup
    ? milestoneKey === "reach_store"
      ? "store location"
      : "pickup location"
    : milestoneKey === "reach_customer" || milestoneKey === "reach_destination"
      ? "customer location"
      : "drop location";

  return { latitude: lat, longitude: lng, label };
}

export type RiderGpsInput = { lat?: number; lng?: number };

export async function evaluateMilestoneGeoFence(input: {
  riderId: number;
  orderCorePk: number;
  serviceType: DispatchServiceType;
  milestoneKey: StatusMilestoneKey;
  gps?: RiderGpsInput;
}): Promise<MilestoneGeoEvaluation> {
  const radiusMeters = await fetchStatusRadiusMeters(input.serviceType, input.milestoneKey);
  const target = await resolveOrderTargetForMilestone(input.orderCorePk, input.milestoneKey);

  let riderLat = parseCoord(input.gps?.lat);
  let riderLng = parseCoord(input.gps?.lng);

  if (riderLat == null || riderLng == null) {
    const live = await loadRiderGps(input.riderId);
    if (!live) {
      throw Object.assign(
        new Error("Live GPS is required. Enable location and try again."),
        { statusCode: 403, code: "RIDER_GPS_REQUIRED" }
      );
    }
    riderLat = live.lat;
    riderLng = live.lng;
  }

  const distanceMeters = haversineDistanceMeters(
    riderLat,
    riderLng,
    target.latitude,
    target.longitude
  );

  const withinRadius = distanceMeters <= radiusMeters;

  return {
    milestoneKey: input.milestoneKey,
    serviceType: input.serviceType,
    radiusMeters,
    distanceMeters: Math.round(distanceMeters),
    withinRadius,
    targetLatitude: target.latitude,
    targetLongitude: target.longitude,
    riderLatitude: riderLat,
    riderLongitude: riderLng,
    blockedMessage: withinRadius
      ? null
      : formatBlockedMessage(radiusMeters, target.label),
  };
}

export async function assertRiderMilestoneGeoFence(input: {
  riderId: number;
  orderCorePk: number;
  serviceType: DispatchServiceType;
  milestoneKey: StatusMilestoneKey;
  gps?: RiderGpsInput;
}): Promise<MilestoneGeoEvaluation> {
  const evaluation = await evaluateMilestoneGeoFence(input);
  if (!evaluation.withinRadius) {
    throw new RiderGeoFenceBlockedError(
      evaluation.blockedMessage ??
        formatBlockedMessage(evaluation.radiusMeters, "target location"),
      evaluation.distanceMeters,
      evaluation.radiusMeters
    );
  }
  return evaluation;
}

export async function getOrderMilestoneGeoFenceStatuses(input: {
  riderId: number;
  orderCorePk: number;
  serviceType: DispatchServiceType;
  gps?: RiderGpsInput;
}): Promise<MilestoneGeoEvaluation[]> {
  const keys = milestonesForService(input.serviceType);
  const results: MilestoneGeoEvaluation[] = [];
  for (const milestoneKey of keys) {
    results.push(
      await evaluateMilestoneGeoFence({
        riderId: input.riderId,
        orderCorePk: input.orderCorePk,
        serviceType: input.serviceType,
        milestoneKey,
        gps: input.gps,
      })
    );
  }
  return results;
}
