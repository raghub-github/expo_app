/**
 * Centralized Order Assignment Engine — Food, Parcel, Person Ride.
 *
 * `platform_rider_dispatch_pickup_radius` is **pickup-radius configuration only**
 * (rider GPS → order pickup point). It must never be used for drop / trip distance.
 *
 * All pickup radii are read from the database on every dispatch decision (no cache,
 * no hardcoded fallbacks). Changing admin settings affects the next request immediately.
 */

import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { incrCounter } from "@gatimitra/logger";
import { getDb, getSql } from "../db/client.js";
import {
  customerRideServiceCatalog,
  dutyLogs,
  ordersCore,
  ordersFood,
  ordersParcel,
  ordersRide,
  riderVehicles,
  riders,
} from "../db/schema.js";
import { fetchEffectiveDispatchRadiusMeters } from "./order-dispatch-settings.js";
import { expandVehicleTypeCodesForCatalogMatch, mapVehicleTypeFromDb } from "./rider-vehicle-db-map.js";
import {
  deriveVehicleDispatchServicesFromProfile,
  filterDispatchServicesForRiderProfile,
} from "./rider-dispatch-service-rules.js";
import { fetchFoodDispatchableStatusesForFlow } from "./food-rider-accept-flow.js";
import {
  assertRiderCanAcceptDispatchOffer,
  canRiderReceiveDispatchOffer,
} from "./rider-assignment-control.js";
import {
  filterUnrestrictedDispatchServices,
  getRiderDispatchBlockSnapshot,
  isDispatchServiceBlocked,
  type RiderDispatchService,
} from "./rider-account-restrictions.js";

/** WGS-84 mean Earth radius in meters (ITRF-grade haversine). */
const EARTH_RADIUS_METERS = 6_371_008.8;

/** Max age of rider GPS ping before the rider is ineligible for new dispatch offers. */
export const RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES = 10;

export type DispatchServiceType = "food" | "parcel" | "person_ride";

export const DISPATCH_SERVICE_TYPES: DispatchServiceType[] = [
  "food",
  "parcel",
  "person_ride",
];

const VALID_DISPATCH_SERVICES = new Set<DispatchServiceType>(DISPATCH_SERVICE_TYPES);

const PERSON_RIDE_SEARCHING_STATUSES = ["SEARCHING_RIDER", "PLACED", "CREATED"] as const;

const ACTIVE_RIDER_ORDER_STATUSES = ["delivered", "cancelled", "failed"] as const;

/** Food orders are offered to riders as soon as the customer places — not only at merchant ready. */
export const FOOD_DISPATCHABLE_ORDER_STATUSES = [
  "CREATED",
  "ACCEPTED",
  "PREPARING",
  "READY_FOR_PICKUP",
] as const;

export type FoodDispatchableOrderStatus = (typeof FOOD_DISPATCHABLE_ORDER_STATUSES)[number];

const FOOD_DISPATCHABLE_ORDER_STATUS_SET = new Set<string>(FOOD_DISPATCHABLE_ORDER_STATUSES);

export function isFoodOrderDispatchable(status: string | null | undefined): boolean {
  return FOOD_DISPATCHABLE_ORDER_STATUS_SET.has(String(status ?? "").trim().toUpperCase());
}

export class DispatchConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchConfigurationError";
  }
}

export class RiderDispatchIneligibleError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = "RiderDispatchIneligibleError";
    this.statusCode = statusCode;
  }
}

export type RiderAssignmentContext = {
  riderId: number;
  isOnDuty: true;
  eligibleServices: DispatchServiceType[];
  lat: number;
  lng: number;
  locationUpdatedAt: Date;
};

export type DispatchPickupPoint = {
  latitude: number;
  longitude: number;
};

export type EligibleDispatchRider = {
  riderId: number;
  lat: number;
  lng: number;
  distanceMeters: number;
  eligibleServices: DispatchServiceType[];
};

export type DispatchOrderTarget = {
  orderCoreId: number;
  orderId: string;
  formattedOrderId: string | null;
  serviceType: DispatchServiceType;
  pickup: DispatchPickupPoint;
  waveNumber: number;
  effectiveRadiusMeters: number;
  /** Person ride: catalog vehicle_type codes that may accept this order (e.g. bike, two_wheeler). */
  personRideVehicleTypes?: string[];
};

export type ActiveDispatchSessionRow = {
  sessionId: number;
  orderCoreId: number;
  currentWave: number;
  status: string;
};

/** Haversine distance in meters — used only for pickup-radius validation. */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const sinHalfLat = Math.sin(dLat / 2);
  const sinHalfLng = Math.sin(dLng / 2);
  const a =
    sinHalfLat * sinHalfLat +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * sinHalfLng * sinHalfLng;
  return EARTH_RADIUS_METERS * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Strict pickup-radius check: rider must be at or inside the configured radius.
 * 3000 m config → 3000.0 m included, 3000.0001 m excluded (no approximate matching).
 */
export function isRiderWithinPickupRadiusMeters(
  riderLat: number,
  riderLng: number,
  pickup: DispatchPickupPoint,
  configuredRadiusMeters: number
): boolean {
  if (!Number.isFinite(configuredRadiusMeters) || configuredRadiusMeters <= 0) {
    return false;
  }
  if (!Number.isFinite(pickup.latitude) || !Number.isFinite(pickup.longitude)) {
    return false;
  }
  if (pickup.latitude === 0 && pickup.longitude === 0) {
    return false;
  }
  const distanceMeters = haversineDistanceMeters(
    riderLat,
    riderLng,
    pickup.latitude,
    pickup.longitude
  );
  return distanceMeters <= configuredRadiusMeters;
}

function normalizeServiceType(raw: string): DispatchServiceType | null {
  const s = raw.trim().toLowerCase();
  if (s === "ride") return "person_ride";
  if (VALID_DISPATCH_SERVICES.has(s as DispatchServiceType)) {
    return s as DispatchServiceType;
  }
  return null;
}

function normalizeDispatchServices(raw: unknown): DispatchServiceType[] {
  if (!Array.isArray(raw)) return [];
  const out: DispatchServiceType[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const norm = normalizeServiceType(item);
    if (norm && !out.includes(norm)) out.push(norm);
  }
  return out;
}

/** Always reads fresh from DB — no cache. */
export async function fetchPickupRadiusMeters(
  serviceType: DispatchServiceType
): Promise<number> {
  const sqlClient = getSql();
  const rows = (await sqlClient`
    SELECT radius_meters
    FROM platform_rider_dispatch_pickup_radius
    WHERE service_type = ${serviceType}
    LIMIT 1
  `) as Array<{ radius_meters: number }>;

  const meters = Number(rows[0]?.radius_meters);
  if (!Number.isFinite(meters) || meters <= 0) {
    throw new DispatchConfigurationError(
      `Pickup radius for "${serviceType}" is not configured in platform_rider_dispatch_pickup_radius`
    );
  }
  return Math.round(meters);
}

/** Always reads fresh from DB — no cache. Throws if any service row is missing. */
export async function fetchAllPickupRadiiMeters(): Promise<Record<DispatchServiceType, number>> {
  const sqlClient = getSql();
  const rows = (await sqlClient`
    SELECT service_type, radius_meters
    FROM platform_rider_dispatch_pickup_radius
    ORDER BY service_type ASC
  `) as Array<{ service_type: string; radius_meters: number }>;

  const map = {} as Record<DispatchServiceType, number>;
  for (const row of rows ?? []) {
    const key = normalizeServiceType(String(row.service_type ?? ""));
    const meters = Number(row.radius_meters);
    if (key && Number.isFinite(meters) && meters > 0) {
      map[key] = Math.round(meters);
    }
  }

  for (const service of DISPATCH_SERVICE_TYPES) {
    if (map[service] == null) {
      throw new DispatchConfigurationError(
        `Pickup radius for "${service}" is not configured in platform_rider_dispatch_pickup_radius`
      );
    }
  }

  return map;
}

async function getActiveVehicleServiceTypes(riderId: number): Promise<DispatchServiceType[]> {
  const db = getDb();
  const rows = await db
    .select({ serviceTypes: riderVehicles.serviceTypes })
    .from(riderVehicles)
    .where(
      and(
        eq(riderVehicles.riderId, riderId),
        eq(riderVehicles.isActive, true),
        eq(riderVehicles.verified, true),
        isNull(riderVehicles.deletedAt),
        sql`COALESCE(${riderVehicles.vehicleActiveStatus}, 'active') = 'active'`
      )
    );

  const merged: DispatchServiceType[] = [];
  for (const row of rows) {
    for (const service of normalizeDispatchServices(row.serviceTypes)) {
      if (!merged.includes(service)) merged.push(service);
    }
  }
  if (merged.length > 0) return merged;

  const profile = await getRiderActiveVehicleProfile(riderId);
  return deriveVehicleDispatchServicesFromProfile(profile);
}

/** Active verified vehicle_type codes for dispatch matching (person ride catalog). */
export async function getRiderActiveVehicleTypeCodes(riderId: number): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ vehicleType: riderVehicles.vehicleType })
    .from(riderVehicles)
    .where(
      and(
        eq(riderVehicles.riderId, riderId),
        eq(riderVehicles.isActive, true),
        eq(riderVehicles.verified, true),
        isNull(riderVehicles.deletedAt),
        sql`COALESCE(${riderVehicles.vehicleActiveStatus}, 'active') = 'active'`
      )
    );

  const types = new Set<string>();
  for (const row of rows) {
    const vt = String(row.vehicleType ?? "").trim();
    if (vt) types.add(vt);
  }
  return [...types];
}

/** Active verified vehicle profile for dispatch service rules (e.g. food vs 3/4-wheeler). */
export async function getRiderActiveVehicleProfile(riderId: number): Promise<{
  vehicleTypes: string[];
  vehicleCategories: string[];
}> {
  const db = getDb();
  const rows = await db
    .select({
      vehicleType: riderVehicles.vehicleType,
      vehicleCategory: riderVehicles.vehicleCategory,
    })
    .from(riderVehicles)
    .where(
      and(
        eq(riderVehicles.riderId, riderId),
        eq(riderVehicles.isActive, true),
        eq(riderVehicles.verified, true),
        isNull(riderVehicles.deletedAt),
        sql`COALESCE(${riderVehicles.vehicleActiveStatus}, 'active') = 'active'`
      )
    );

  const vehicleTypes = new Set<string>();
  const vehicleCategories = new Set<string>();
  for (const row of rows) {
    const vt = mapVehicleTypeFromDb(String(row.vehicleType ?? "")).trim().toLowerCase();
    if (vt) vehicleTypes.add(vt);
    const vc = String(row.vehicleCategory ?? "").trim().toLowerCase();
    if (vc) vehicleCategories.add(vc);
  }
  return {
    vehicleTypes: [...vehicleTypes],
    vehicleCategories: [...vehicleCategories],
  };
}

function riderMatchesPersonRideVehicleTypes(
  riderVehicleTypes: string[],
  requiredTypes: string[] | undefined
): boolean {
  if (!requiredTypes?.length) return true;

  const allowed = new Set<string>();
  for (const required of requiredTypes) {
    for (const code of expandVehicleTypeCodesForCatalogMatch(required)) {
      allowed.add(code);
    }
  }
  if (allowed.size === 0) return true;

  const riderExpanded = new Set<string>();
  for (const riderType of riderVehicleTypes) {
    for (const code of expandVehicleTypeCodesForCatalogMatch(riderType)) {
      riderExpanded.add(code);
    }
  }

  return [...riderExpanded].some((code) => allowed.has(code));
}

function intersectServices(
  dutyServices: DispatchServiceType[],
  vehicleServices: DispatchServiceType[]
): DispatchServiceType[] {
  if (dutyServices.length === 0 || vehicleServices.length === 0) return [];
  const vehicleSet = new Set(vehicleServices);
  return dutyServices.filter((s) => vehicleSet.has(s));
}

/** duty ON selection ∩ vehicle capabilities ∩ profile rules ∩ account restrictions. */
export async function computeRiderEligibleDispatchServices(
  riderId: number
): Promise<DispatchServiceType[] | null> {
  const db = getDb();

  const [latestDuty] = await db
    .select({ status: dutyLogs.status, serviceTypes: dutyLogs.serviceTypes })
    .from(dutyLogs)
    .where(eq(dutyLogs.riderId, riderId))
    .orderBy(desc(dutyLogs.timestamp))
    .limit(1);

  if (latestDuty?.status !== "ON") return null;

  const dutyServices = normalizeDispatchServices(latestDuty.serviceTypes);
  if (dutyServices.length === 0) return null;

  const vehicleProfile = await getRiderActiveVehicleProfile(riderId);
  const { resolveAssignedDispatchServicesForProfile } = await import(
    "./rider-vehicle-type-service-assignments.js"
  );
  const assignmentServices = await resolveAssignedDispatchServicesForProfile(vehicleProfile);
  const hasVehicleProfile =
    vehicleProfile.vehicleTypes.some((v) => v.trim().length > 0) ||
    vehicleProfile.vehicleCategories.some((c) => c.trim().length > 0);
  const vehicleServices = hasVehicleProfile
    ? assignmentServices
    : assignmentServices.length > 0
      ? assignmentServices
      : await getActiveVehicleServiceTypes(riderId);
  if (vehicleServices.length === 0) return null;

  const intersected = intersectServices(dutyServices, vehicleServices);
  const profileFiltered = filterDispatchServicesForRiderProfile(intersected, vehicleProfile);
  const { filterDispatchServicesByVehicleAssignments } = await import(
    "./rider-vehicle-type-service-assignments.js"
  );
  const vehicleFiltered = await filterDispatchServicesByVehicleAssignments(profileFiltered, {
    vehicleTypes: vehicleProfile.vehicleTypes,
    vehicleCategories: vehicleProfile.vehicleCategories,
  });
  const restrictionSnapshot = await getRiderDispatchBlockSnapshot(riderId);
  const unrestricted = filterUnrestrictedDispatchServices(vehicleFiltered, restrictionSnapshot);

  return unrestricted.length > 0 ? unrestricted : null;
}

export function riderHasEligibleDispatchService(
  eligibleServices: DispatchServiceType[],
  serviceType: DispatchServiceType
): boolean {
  return eligibleServices.includes(serviceType);
}

export async function loadRiderGps(
  riderId: number
): Promise<{ lat: number; lng: number; updatedAt: Date } | null> {
  const sqlClient = getSql();
  const started = Date.now();
  const [position] = (await sqlClient`
    SELECT
      COALESCE(rcl.lat, r.lat::float) AS lat,
      COALESCE(rcl.lng, r.lon::float) AS lng,
      rcl.updated_at AS updated_at
    FROM riders r
    LEFT JOIN rider_current_locations rcl ON rcl.rider_id = r.id
    WHERE r.id = ${riderId}
    LIMIT 1
  `) as Array<{ lat: number | null; lng: number | null; updated_at: Date | null }>;

  incrCounter(
    "rider_dispatch_gps_lookups_total",
    "Dispatch rider GPS lookups via rider_current_locations"
  );
  const lookupMs = Date.now() - started;
  if (lookupMs > 50) {
    incrCounter(
      "rider_dispatch_gps_slow_lookups_total",
      "Dispatch GPS lookups slower than 50ms"
    );
  }

  if (!position?.updated_at || position.lat == null || position.lng == null) {
    return null;
  }

  const updatedAt = new Date(position.updated_at);
  const freshEnough =
    Date.now() - updatedAt.getTime() <= RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES * 60_000;

  if (!freshEnough) return null;

  return {
    lat: Number(position.lat),
    lng: Number(position.lng),
    updatedAt,
  };
}

/** True when rider already has a non-terminal assigned order. */
export async function riderHasActiveDispatchOrder(riderId: number): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: ordersCore.id })
    .from(ordersCore)
    .where(
      and(
        eq(ordersCore.riderId, riderId),
        notInArray(ordersCore.status, [...ACTIVE_RIDER_ORDER_STATUSES])
      )
    )
    .limit(1);

  return row?.id != null;
}

async function isRiderBlacklistedForService(
  riderId: number,
  serviceType: DispatchServiceType
): Promise<boolean> {
  const snapshot = await getRiderDispatchBlockSnapshot(riderId);
  if (!snapshot.accountRestricted) return false;
  return isDispatchServiceBlocked(serviceType as RiderDispatchService, snapshot);
}

/** Fresh DB read — active dispatch session for an order (if any). */
export async function fetchActiveDispatchSession(
  orderCoreId: number
): Promise<ActiveDispatchSessionRow | null> {
  const sqlClient = getSql();
  const rows = (await sqlClient`
    SELECT id, order_core_id, current_wave, status
    FROM order_dispatch_sessions
    WHERE order_core_id = ${orderCoreId}
      AND status = 'active'
    LIMIT 1
  `) as Array<{
    id: number;
    order_core_id: number;
    current_wave: number;
    status: string;
  }>;

  const row = rows[0];
  if (!row?.id) return null;
  return {
    sessionId: Number(row.id),
    orderCoreId: Number(row.order_core_id),
    currentWave: Math.max(1, Number(row.current_wave) || 1),
    status: String(row.status),
  };
}

async function fetchActiveDispatchSessionsByOrderCoreIds(
  orderCoreIds: number[]
): Promise<Map<number, ActiveDispatchSessionRow>> {
  const map = new Map<number, ActiveDispatchSessionRow>();
  if (orderCoreIds.length === 0) return map;

  const sqlClient = getSql();
  const rows = (await sqlClient`
    SELECT id, order_core_id, current_wave, status
    FROM order_dispatch_sessions
    WHERE order_core_id = ANY(${orderCoreIds}::int[])
      AND status = 'active'
  `) as Array<{
    id: number;
    order_core_id: number;
    current_wave: number;
    status: string;
  }>;

  for (const row of rows ?? []) {
    map.set(Number(row.order_core_id), {
      sessionId: Number(row.id),
      orderCoreId: Number(row.order_core_id),
      currentWave: Math.max(1, Number(row.current_wave) || 1),
      status: String(row.status),
    });
  }
  return map;
}

/** Current-wave effective pickup radius for an order (DB-driven, no cache). */
export async function resolveOrderDispatchRadiusMeters(
  orderCoreId: number,
  serviceType: DispatchServiceType
): Promise<number> {
  const session = await fetchActiveDispatchSession(orderCoreId);
  const wave = session?.currentWave ?? 1;
  return fetchEffectiveDispatchRadiusMeters(serviceType, wave);
}

async function loadOnDutyRiderIds(
  requiredService?: DispatchServiceType
): Promise<number[]> {
  const sqlClient = getSql();
  const serviceJson =
    requiredService != null ? JSON.stringify([requiredService]) : null;
  // Never DISTINCT ON the full duty_logs table — that hangs under load and
  // starves the pool (place ride Network Error + no dispatch offers).
  // Only riders with a recent GPS ping can be dispatched; resolve their
  // latest duty via index-friendly LATERAL.
  const rows = (await sqlClient`
    SELECT DISTINCT r.id AS rider_id
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
      AND jsonb_array_length(COALESCE(ld.service_types, '[]'::jsonb)) > 0
      AND (
        ${serviceJson}::text IS NULL
        OR COALESCE(ld.service_types, '[]'::jsonb) @> ${serviceJson}::jsonb
      )
  `) as Array<{ rider_id: number }>;

  return (rows ?? [])
    .map((r) => Number(r.rider_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

/**
 * Structured dispatch tracing. Toggle LIVE (no code change / no restart needed if
 * your process manager reloads env, else set before boot) via DISPATCH_TRACE=1.
 * Off by default so production is never spammed; on, it records the full per-rider
 * decision (rider GPS, pickup, distance, active-wave radius, result, reason).
 */
function dispatchTraceEnabled(): boolean {
  const v = process.env.DISPATCH_TRACE;
  return v === "1" || v === "true" || v === "TRACE";
}

type DispatchRiderTrace = {
  riderId: number;
  serviceType: DispatchServiceType;
  orderId: string;
  configuredRadiusMeters: number;
  result: "eligible" | "rejected";
  reason: string;
  riderLat?: number;
  riderLng?: number;
  pickupLat?: number;
  pickupLng?: number;
  distanceMeters?: number;
};

function traceRiderDecision(data: DispatchRiderTrace): void {
  if (!dispatchTraceEnabled()) return;
  console.info("[dispatch-trace] rider_eval", JSON.stringify(data));
}

/**
 * Full eligibility for a specific order dispatch target (push, socket, pool, accept).
 * Uses live GPS and the supplied effective pickup radius (wave-aware).
 *
 * Behaviour is unchanged from the un-instrumented version — every early return is
 * still `null`; tracing (DISPATCH_TRACE=1) only observes the decision + reason.
 */
export async function evaluateRiderDispatchEligibility(
  riderId: number,
  target: Pick<
    DispatchOrderTarget,
    | "serviceType"
    | "pickup"
    | "effectiveRadiusMeters"
    | "orderCoreId"
    | "orderId"
    | "personRideVehicleTypes"
  >,
  options?: { ignoreAssignmentLimit?: boolean }
): Promise<EligibleDispatchRider | null> {
  const reject = (reason: string, extra?: Partial<DispatchRiderTrace>): null => {
    traceRiderDecision({
      riderId,
      serviceType: target.serviceType,
      orderId: target.orderId,
      configuredRadiusMeters: target.effectiveRadiusMeters,
      result: "rejected",
      reason,
      ...extra,
    });
    return null;
  };

  const preEligible = await computeRiderEligibleDispatchServices(riderId);
  if (!preEligible?.includes(target.serviceType)) return reject("service_not_eligible");

  const { isRiderSubscriptionDispatchBlocked } = await import("./rider-subscription-wallet.js");
  if (await isRiderSubscriptionDispatchBlocked(riderId)) return reject("subscription_blocked");

  const ctx = await resolveRiderAssignmentContext(riderId, { skipAssignmentCheck: true });
  if (!ctx) return reject("no_context_offduty_or_stale_gps");
  if (!ctx.eligibleServices.includes(target.serviceType)) return reject("service_not_in_duty");

  if (target.serviceType === "person_ride") {
    const riderVehicleTypes = await getRiderActiveVehicleTypeCodes(riderId);
    if (!riderMatchesPersonRideVehicleTypes(riderVehicleTypes, target.personRideVehicleTypes)) {
      return reject("vehicle_type_mismatch", { riderLat: ctx.lat, riderLng: ctx.lng });
    }
  }

  if (!options?.ignoreAssignmentLimit) {
    const assignmentOk = await canRiderReceiveDispatchOffer(riderId, target.serviceType, {
      orderCoreId: target.orderCoreId,
      orderId: target.orderId,
      eventContext: "dispatch_offer",
    });
    if (!assignmentOk) return reject("assignment_limit_or_active_order", { riderLat: ctx.lat, riderLng: ctx.lng });
  }
  if (!ctx.eligibleServices.includes(target.serviceType)) return reject("service_not_in_duty");
  if (await isRiderBlacklistedForService(riderId, target.serviceType)) {
    return reject("blacklisted_for_service", { riderLat: ctx.lat, riderLng: ctx.lng });
  }

  const distanceMeters = haversineDistanceMeters(
    ctx.lat,
    ctx.lng,
    target.pickup.latitude,
    target.pickup.longitude
  );

  if (
    !isRiderWithinPickupRadiusMeters(
      ctx.lat,
      ctx.lng,
      target.pickup,
      target.effectiveRadiusMeters
    )
  ) {
    return reject("outside_wave_radius", {
      riderLat: ctx.lat,
      riderLng: ctx.lng,
      pickupLat: target.pickup.latitude,
      pickupLng: target.pickup.longitude,
      distanceMeters: Math.round(distanceMeters),
    });
  }

  traceRiderDecision({
    riderId,
    serviceType: target.serviceType,
    orderId: target.orderId,
    configuredRadiusMeters: target.effectiveRadiusMeters,
    result: "eligible",
    reason: "within_wave_radius",
    riderLat: ctx.lat,
    riderLng: ctx.lng,
    pickupLat: target.pickup.latitude,
    pickupLng: target.pickup.longitude,
    distanceMeters: Math.round(distanceMeters),
  });

  return {
    riderId: ctx.riderId,
    lat: ctx.lat,
    lng: ctx.lng,
    distanceMeters,
    eligibleServices: ctx.eligibleServices,
  };
}

/** Active (non-terminal) order count per rider, normalized to a [0,1] workload score. */
async function fetchRiderWorkloadScores(riderIds: number[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (riderIds.length === 0) return map;
  const sqlClient = getSql();
  const rows = (await sqlClient`
    SELECT rider_id, COUNT(*)::int AS cnt
    FROM orders_core
    WHERE rider_id = ANY(${riderIds}::int[])
      AND status NOT IN ('delivered', 'cancelled', 'failed')
    GROUP BY rider_id
  `) as Array<{ rider_id: number; cnt: number }>;
  for (const r of rows ?? []) {
    const cnt = Number(r.cnt) || 0;
    map.set(Number(r.rider_id), Math.min(1, cnt / 3));
  }
  return map;
}

/** Inverse of pool listing — eligible riders for one order at the current wave. */
export async function listEligibleRidersForDispatchOrder(
  target: DispatchOrderTarget,
  options?: { ignoreManualHold?: boolean; ignoreAssignmentLimit?: boolean }
): Promise<EligibleDispatchRider[]> {
  const { isOrderDispatchManualHold } = await import("./order-dispatch-manual-hold.js");
  if (!options?.ignoreManualHold && (await isOrderDispatchManualHold(target.orderCoreId))) {
    return [];
  }

  // Area-level Prevent Services: if this order's points are blocked, offer it
  // to nobody. Riders stay on duty; only this order is withheld.
  const { isDispatchOrderBlockedByPrevent } = await import(
    "../modules/prevent-services/preventServices.engine.js"
  );
  const db = getDb();
  const [coords] = await db
    .select({
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, target.orderCoreId))
    .limit(1);
  if (
    await isDispatchOrderBlockedByPrevent({
      serviceType: target.serviceType,
      pickupLat: target.pickup.latitude,
      pickupLng: target.pickup.longitude,
      dropLat: coords?.dropLat != null ? parseCoord(coords.dropLat) : null,
      dropLng: coords?.dropLon != null ? parseCoord(coords.dropLon) : null,
      audit: true,
      orderId: target.orderId,
    })
  ) {
    return [];
  }

  const candidateIds = await loadOnDutyRiderIds(target.serviceType);
  const { fetchExcludedRiderIdsForOrder } = await import("./rider-dispatch-order-exclusion.js");
  const excludedRiderIds = await fetchExcludedRiderIdsForOrder(target.orderCoreId);
  const eligible: EligibleDispatchRider[] = [];

  for (const riderId of candidateIds) {
    if (excludedRiderIds.has(riderId)) continue;
    const row = await evaluateRiderDispatchEligibility(riderId, target, {
      ignoreAssignmentLimit: options?.ignoreAssignmentLimit,
    });
    if (row) eligible.push(row);
  }

  const sorted = eligible.sort((a, b) => a.distanceMeters - b.distanceMeters);

  // Phase 3: optional weighted ordering. strategy 'nearest' (default) keeps pure
  // distance; 'score'/'balanced'/'hybrid' re-rank by the configured weights. Only
  // distance + current workload are gathered today; other signals stay neutral.
  // Scoring never breaks dispatch — any failure falls back to nearest ordering.
  let ordered: EligibleDispatchRider[] = sorted;
  let strategyName = "nearest";
  try {
    const { fetchDispatchStrategyConfig } = await import("./dispatch-strategy-config.js");
    const cfg = await fetchDispatchStrategyConfig(target.serviceType);
    strategyName = cfg.strategy;
    if (cfg.strategy !== "nearest" && sorted.length > 1) {
      const { rankRidersByScore } = await import("./rider-dispatch-scoring.js");
      const workload = await fetchRiderWorkloadScores(sorted.map((r) => r.riderId));
      const scorable = sorted.map((r) => ({ ...r, workloadScore: workload.get(r.riderId) ?? 0 }));
      ordered = rankRidersByScore(scorable, cfg.scoreWeights, target.effectiveRadiusMeters);
    }
  } catch (err) {
    console.warn("[dispatch] scoring fallback to nearest", (err as Error).message);
    ordered = sorted;
  }

  // Always-on, low-volume (one line per order per wave): proves the wave radius
  // gate from Super Admin → Rider Assignment Controls is being applied live.
  console.info(
    "[dispatch] wave_eligibility",
    JSON.stringify({
      orderId: target.orderId,
      serviceType: target.serviceType,
      waveNumber: target.waveNumber,
      configuredRadiusMeters: target.effectiveRadiusMeters,
      onDutyCandidates: candidateIds.length,
      excluded: excludedRiderIds.size,
      eligibleWithinRadius: ordered.length,
      strategy: strategyName,
      nearestMeters: ordered[0]?.distanceMeters != null ? Math.round(ordered[0].distanceMeters) : null,
    })
  );
  return ordered;
}

/**
 * Resolves full rider assignment context: on-duty, service eligibility, fresh GPS.
 * Returns null when the rider cannot receive any dispatch offers.
 */
export async function resolveRiderAssignmentContext(
  riderId: number,
  options?: {
    /** When set, enforces service assignment limits for that service. */
    serviceTypeForDispatch?: DispatchServiceType;
    /** Skip assignment-limit gate (pool base context; limits checked per service/order). */
    skipAssignmentCheck?: boolean;
    /** @deprecated Use assignment control settings; only for emergency bypass. */
    ignoreActiveOrder?: boolean;
  }
): Promise<RiderAssignmentContext | null> {
  const db = getDb();

  const [rider] = await db
    .select({ status: riders.status, onboardingStage: riders.onboardingStage })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);

  if (!rider || rider.onboardingStage !== "ACTIVE") return null;
  if (rider.status === "BLOCKED" || rider.status === "BANNED") return null;
  if (rider.status !== "ACTIVE") return null;

  if (!options?.ignoreActiveOrder && !options?.skipAssignmentCheck) {
    if (options?.serviceTypeForDispatch) {
      const allowed = await canRiderReceiveDispatchOffer(riderId, options.serviceTypeForDispatch);
      if (!allowed) return null;
    } else if (await riderHasActiveDispatchOrder(riderId)) {
      return null;
    }
  }

  const eligibleServices = await computeRiderEligibleDispatchServices(riderId);
  if (!eligibleServices || eligibleServices.length === 0) return null;

  if (
    options?.serviceTypeForDispatch &&
    !riderHasEligibleDispatchService(eligibleServices, options.serviceTypeForDispatch)
  ) {
    return null;
  }

  const gps = await loadRiderGps(riderId);
  if (!gps) return null;

  return {
    riderId,
    isOnDuty: true,
    eligibleServices,
    lat: gps.lat,
    lng: gps.lng,
    locationUpdatedAt: gps.updatedAt,
  };
}

/** Validates rider + pickup point against DB-configured pickup radius (accept flow). */
export async function assertRiderWithinServicePickupRadius(
  ctx: RiderAssignmentContext,
  serviceType: DispatchServiceType,
  pickup: DispatchPickupPoint,
  radiusMeters?: number
): Promise<void> {
  if (!ctx.eligibleServices.includes(serviceType)) {
    throw new RiderDispatchIneligibleError(`You are not online for ${serviceType} dispatch`, 403);
  }

  if (await isRiderBlacklistedForService(ctx.riderId, serviceType)) {
    throw new RiderDispatchIneligibleError("Your account is restricted for this service", 403);
  }

  const configuredRadiusMeters =
    radiusMeters ?? (await fetchPickupRadiusMeters(serviceType));
  if (!isRiderWithinPickupRadiusMeters(ctx.lat, ctx.lng, pickup, configuredRadiusMeters)) {
    throw new RiderDispatchIneligibleError(
      "You are outside the pickup area for this order",
      409
    );
  }
}

export type DispatchPoolOrderRow = {
  serviceType: DispatchServiceType;
  orderCoreId: number;
  orderId: string;
  formattedOrderId: string | null;
  pickupLat: number;
  pickupLng: number;
  /** Customer / drop coordinates — used for area-level Prevent Services filtering. */
  dropLat: number | null;
  dropLng: number | null;
  createdAt: Date;
  higherDispatchPriority: boolean;
  customerTipAmount: number;
};

function parseCoord(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPickupPoint(latRaw: unknown, lngRaw: unknown): DispatchPickupPoint {
  return {
    latitude: parseCoord(latRaw),
    longitude: parseCoord(lngRaw),
  };
}

async function resolvePersonRideVehicleTypesForOrder(
  orderCoreId: number
): Promise<string[] | undefined> {
  const db = getDb();
  const [row] = await db
    .select({
      rideType: ordersRide.rideType,
      vehicleTypeRequired: ordersRide.vehicleTypeRequired,
    })
    .from(ordersCore)
    .leftJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);

  if (!row) return undefined;

  const rideType = row.rideType?.trim();
  if (rideType) {
    const [catalog] = await db
      .select({ vehicleTypes: customerRideServiceCatalog.vehicleTypes })
      .from(customerRideServiceCatalog)
      .where(eq(customerRideServiceCatalog.code, rideType))
      .limit(1);
    const fromCatalog = (catalog?.vehicleTypes ?? [])
      .map((t) => String(t).trim())
      .filter(Boolean);
    if (fromCatalog.length > 0) return fromCatalog;
  }

  const fallback = row.vehicleTypeRequired?.trim();
  return fallback ? [fallback] : undefined;
}

async function fetchPersonRidePoolRows(): Promise<DispatchPoolOrderRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      orderCoreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      createdAt: ordersCore.createdAt,
      higherDispatchPriority: ordersRide.higherDispatchPriority,
      customerTipAmount: ordersRide.customerTipAmount,
    })
    .from(ordersCore)
    .innerJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.orderType, "person_ride"),
        eq(ordersCore.status, "assigned"),
        isNull(ordersCore.riderId),
        inArray(ordersCore.currentStatus, [...PERSON_RIDE_SEARCHING_STATUSES]),
        sql`${ordersRide.cancelledAt} IS NULL`,
        sql`(${ordersRide.searchExpiresAt} IS NULL OR ${ordersRide.searchExpiresAt} > NOW())`
      )
    )
    .orderBy(
      desc(ordersRide.higherDispatchPriority),
      desc(ordersRide.customerTipAmount),
      asc(ordersCore.createdAt)
    )
    .limit(30);

  return rows
    .filter((r) => r.orderId)
    .map((r) => ({
      serviceType: "person_ride" as const,
      orderCoreId: r.orderCoreId,
      orderId: r.orderId!.trim(),
      formattedOrderId: r.formattedOrderId,
      pickupLat: parseCoord(r.pickupLat),
      pickupLng: parseCoord(r.pickupLon),
      dropLat: r.dropLat != null ? parseCoord(r.dropLat) : null,
      dropLng: r.dropLon != null ? parseCoord(r.dropLon) : null,
      createdAt: r.createdAt,
      higherDispatchPriority: r.higherDispatchPriority === true,
      customerTipAmount: Number(r.customerTipAmount ?? 0) || 0,
    }));
}

async function fetchFoodPoolRows(): Promise<DispatchPoolOrderRow[]> {
  const dispatchableStatuses = [...(await fetchFoodDispatchableStatusesForFlow())];
  const db = getDb();
  const rows = await db
    .select({
      orderCoreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      createdAt: ordersCore.createdAt,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.orderType, "food"),
        isNull(ordersCore.riderId),
        eq(ordersCore.dispatchManualHold, false),
        inArray(ordersFood.orderStatus, dispatchableStatuses),
        sql`${ordersFood.cancelledAt} IS NULL`
      )
    )
    .orderBy(asc(ordersCore.createdAt))
    .limit(30);

  return rows
    .filter((r) => r.orderId)
    .map((r) => ({
      serviceType: "food" as const,
      orderCoreId: r.orderCoreId,
      orderId: r.orderId!.trim(),
      formattedOrderId: r.formattedOrderId,
      pickupLat: parseCoord(r.pickupLat),
      pickupLng: parseCoord(r.pickupLon),
      dropLat: r.dropLat != null ? parseCoord(r.dropLat) : null,
      dropLng: r.dropLon != null ? parseCoord(r.dropLon) : null,
      createdAt: r.createdAt,
      higherDispatchPriority: false,
      customerTipAmount: 0,
    }));
}

async function fetchParcelPoolRows(): Promise<DispatchPoolOrderRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      orderCoreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      createdAt: ordersCore.createdAt,
      searchExpiresAt: ordersParcel.searchExpiresAt,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.orderType, "parcel"),
        eq(ordersCore.status, "assigned"),
        isNull(ordersCore.riderId),
        inArray(ordersCore.currentStatus, [
          "SEARCHING_RIDER",
          "PLACED",
          "CREATED",
          "READY_FOR_PICKUP",
        ]),
        sql`${ordersCore.status} NOT IN ('delivered', 'cancelled', 'failed')`,
        sql`(${ordersParcel.searchExpiresAt} IS NULL OR ${ordersParcel.searchExpiresAt} > now())`
      )
    )
    .orderBy(asc(ordersCore.createdAt))
    .limit(30);

  return rows
    .filter((r) => r.orderId)
    .map((r) => ({
      serviceType: "parcel" as const,
      orderCoreId: r.orderCoreId,
      orderId: r.orderId!.trim(),
      formattedOrderId: r.formattedOrderId,
      pickupLat: parseCoord(r.pickupLat),
      pickupLng: parseCoord(r.pickupLon),
      dropLat: r.dropLat != null ? parseCoord(r.dropLat) : null,
      dropLng: r.dropLon != null ? parseCoord(r.dropLon) : null,
      createdAt: r.createdAt,
      higherDispatchPriority: false,
      customerTipAmount: 0,
    }));
}

/**
 * Central dispatch listing: for each open order, load service-specific pickup radius
 * from DB and include only if rider is strictly within that pickup radius.
 */
export async function listDispatchPoolOrdersForRider(
  riderId: number
): Promise<DispatchPoolOrderRow[]> {
  const baseCtx = await resolveRiderAssignmentContext(riderId, { skipAssignmentCheck: true });
  if (!baseCtx) return [];

  const [canFood, canParcel, canRide] = await Promise.all([
    canRiderReceiveDispatchOffer(riderId, "food"),
    canRiderReceiveDispatchOffer(riderId, "parcel"),
    canRiderReceiveDispatchOffer(riderId, "person_ride"),
  ]);

  const candidates: DispatchPoolOrderRow[] = [];

  if (canRide && baseCtx.eligibleServices.includes("person_ride")) {
    candidates.push(...(await fetchPersonRidePoolRows()));
  }
  if (canFood && baseCtx.eligibleServices.includes("food")) {
    candidates.push(...(await fetchFoodPoolRows()));
  }
  if (canParcel && baseCtx.eligibleServices.includes("parcel")) {
    candidates.push(...(await fetchParcelPoolRows()));
  }

  const sessionMap = await fetchActiveDispatchSessionsByOrderCoreIds(
    candidates.map((o) => o.orderCoreId)
  );

  const { fetchExcludedOrderCoreIdsForRider } = await import("./rider-dispatch-order-exclusion.js");
  const excludedCoreIds = await fetchExcludedOrderCoreIdsForRider(
    riderId,
    candidates.map((o) => o.orderCoreId)
  );

  const withinRadius: DispatchPoolOrderRow[] = [];
  const { isOrderDispatchManualHold } = await import("./order-dispatch-manual-hold.js");
  const { isDispatchOrderBlockedByPrevent } = await import(
    "../modules/prevent-services/preventServices.engine.js"
  );
  for (const order of candidates) {
    if (excludedCoreIds.has(order.orderCoreId)) continue;
    if (await isOrderDispatchManualHold(order.orderCoreId)) continue;

    // Area-level Prevent Services: only hide orders whose pickup/drop sits
    // inside an active block. Never removes the rider from duty.
    if (
      await isDispatchOrderBlockedByPrevent({
        serviceType: order.serviceType,
        pickupLat: order.pickupLat,
        pickupLng: order.pickupLng,
        dropLat: order.dropLat,
        dropLng: order.dropLng,
      })
    ) {
      continue;
    }

    const session = sessionMap.get(order.orderCoreId);
    const wave = session?.currentWave ?? 1;
    let radiusMeters: number;
    try {
      radiusMeters = await fetchEffectiveDispatchRadiusMeters(order.serviceType, wave);
    } catch (err) {
      console.warn(
        "[dispatch] pickup radius lookup failed",
        order.serviceType,
        order.orderId,
        (err as Error).message
      );
      continue;
    }

    const personRideVehicleTypes =
      order.serviceType === "person_ride"
        ? await resolvePersonRideVehicleTypesForOrder(order.orderCoreId)
        : undefined;

    const eligible = await evaluateRiderDispatchEligibility(riderId, {
      serviceType: order.serviceType,
      pickup: toPickupPoint(order.pickupLat, order.pickupLng),
      effectiveRadiusMeters: radiusMeters,
      orderCoreId: order.orderCoreId,
      orderId: order.orderId,
      personRideVehicleTypes,
    });
    if (eligible) withinRadius.push(order);
  }

  const sorted = withinRadius
    .sort((a, b) => {
      const pri = Number(b.higherDispatchPriority) - Number(a.higherDispatchPriority);
      if (pri !== 0) return pri;
      if (b.customerTipAmount !== a.customerTipAmount) {
        return b.customerTipAmount - a.customerTipAmount;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .slice(0, 15);

  try {
    const { appendForceAssignmentPoolRow } = await import("./force-assignment.service.js");
    return await appendForceAssignmentPoolRow(riderId, sorted);
  } catch {
    return sorted;
  }
}

/** Pre-accept validation: duty, services, active-order, GPS, pickup radius (DB-driven). */
export async function validateRiderAcceptance(
  riderId: number,
  serviceType: DispatchServiceType,
  pickup: DispatchPickupPoint,
  options?: { orderCoreId?: number }
): Promise<RiderAssignmentContext> {
  const ctx = await resolveRiderAssignmentContext(riderId, { skipAssignmentCheck: true });
  if (!ctx) {
    throw new RiderDispatchIneligibleError("You are not eligible to accept orders", 403);
  }

  await assertRiderCanAcceptDispatchOffer(riderId, serviceType, {
    orderCoreId: options?.orderCoreId,
    eventContext: "dispatch_accept",
  });

  const radiusMeters =
    options?.orderCoreId != null
      ? await resolveOrderDispatchRadiusMeters(options.orderCoreId, serviceType)
      : undefined;

  await assertRiderWithinServicePickupRadius(ctx, serviceType, pickup, radiusMeters);

  if (options?.orderCoreId != null) {
    const { isOrderDispatchManualHold } = await import("./order-dispatch-manual-hold.js");
    if (await isOrderDispatchManualHold(options.orderCoreId)) {
      throw new RiderDispatchIneligibleError(
        "This order is waiting for admin assignment",
        409
      );
    }

    const { isRiderExcludedFromOrderDispatch } = await import("./rider-dispatch-order-exclusion.js");
    const excluded = await isRiderExcludedFromOrderDispatch(riderId, options.orderCoreId);
    if (excluded) {
      throw new RiderDispatchIneligibleError("This order is no longer available to you", 409);
    }

    // Area-level Prevent Services — same gate as pool/wave. Blocks accept when
    // the order's pickup/drop sits inside an active block (does not change duty).
    const {
      isDispatchOrderBlockedByPrevent,
      logPreventRuntimeEvent,
      checkPreventServicesAtPointCached,
      preventCodesForDispatchService,
    } = await import("../modules/prevent-services/preventServices.engine.js");
    const [coords] = await getDb()
      .select({
        dropLat: ordersCore.dropLat,
        dropLon: ordersCore.dropLon,
      })
      .from(ordersCore)
      .where(eq(ordersCore.id, options.orderCoreId))
      .limit(1);
    const dropLat = coords?.dropLat != null ? parseCoord(coords.dropLat) : null;
    const dropLng = coords?.dropLon != null ? parseCoord(coords.dropLon) : null;
    if (
      await isDispatchOrderBlockedByPrevent({
        serviceType,
        pickupLat: pickup.latitude,
        pickupLng: pickup.longitude,
        dropLat,
        dropLng,
        audit: false,
      })
    ) {
      let ruleId: string | null = null;
      try {
        const codes = preventCodesForDispatchService(serviceType);
        const points = [
          { lat: pickup.latitude, lng: pickup.longitude },
          ...(dropLat != null && dropLng != null ? [{ lat: dropLat, lng: dropLng }] : []),
        ];
        for (const code of codes) {
          for (const p of points) {
            const hit = await checkPreventServicesAtPointCached({
              lat: p.lat,
              lng: p.lng,
              service: code,
            });
            if (hit.blocked) {
              ruleId = hit.nearest?.ruleId ?? null;
              break;
            }
          }
          if (ruleId) break;
        }
      } catch {
        /* ignore */
      }
      void logPreventRuntimeEvent({
        action: "acceptance_blocked",
        ruleId,
        reason: `rider=${riderId};service=${serviceType};orderCoreId=${options.orderCoreId}`,
        snapshot: {
          riderId,
          serviceType,
          orderCoreId: options.orderCoreId,
        },
      });
      if (ruleId) {
        void logPreventRuntimeEvent({
          action: "trigger_fired",
          ruleId,
          reason: `acceptance_blocked;rider=${riderId}`,
          snapshot: { riderId, serviceType, orderCoreId: options.orderCoreId },
        });
      }
      throw new RiderDispatchIneligibleError(
        "This service is temporarily unavailable in this location",
        403
      );
    }
  }

  return ctx;
}
