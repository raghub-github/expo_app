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
import { getDb, getSql } from "../db/client.js";
import {
  blacklistHistory,
  dutyLogs,
  ordersCore,
  ordersFood,
  ordersParcel,
  ordersRide,
  riderVehicles,
  riders,
} from "../db/schema.js";
import { fetchEffectiveDispatchRadiusMeters } from "./order-dispatch-settings.js";
import { expandVehicleTypeCodesForCatalogMatch } from "./rider-vehicle-db-map.js";
import { fetchFoodDispatchableStatusesForFlow } from "./food-rider-accept-flow.js";
import {
  assertRiderCanAcceptDispatchOffer,
  canRiderReceiveDispatchOffer,
} from "./rider-assignment-control.js";

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
  return merged;
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
  const vehicleSet = new Set(vehicleServices);
  return dutyServices.filter((s) => vehicleSet.has(s));
}

export async function loadRiderGps(
  riderId: number
): Promise<{ lat: number; lng: number; updatedAt: Date } | null> {
  const sqlClient = getSql();
  const [position] = (await sqlClient`
    WITH latest_ping AS (
      SELECT DISTINCT ON (rle.user_id)
        (substring(rle.user_id from 'usr_(\\d+)'))::int AS rider_id,
        rle.lat,
        rle.lng,
        to_timestamp(rle.ts_ms / 1000.0) AT TIME ZONE 'UTC' AS updated_at
      FROM rider_location_events rle
      WHERE rle.user_id = ${`usr_${riderId}`}
      ORDER BY rle.user_id, rle.ts_ms DESC
    )
    SELECT
      COALESCE(rll.latitude::float, lp.lat, r.lat::float) AS lat,
      COALESCE(rll.longitude::float, lp.lng, r.lon::float) AS lng,
      COALESCE(rll.updated_at, lp.updated_at) AS updated_at
    FROM riders r
    LEFT JOIN rider_live_locations rll ON rll.rider_id = r.id
    LEFT JOIN latest_ping lp ON lp.rider_id = r.id
    WHERE r.id = ${riderId}
    LIMIT 1
  `) as Array<{ lat: number | null; lng: number | null; updated_at: Date | null }>;

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
  const db = getDb();
  const entries = await db
    .select({
      serviceType: blacklistHistory.serviceType,
      isPermanent: blacklistHistory.isPermanent,
      expiresAt: blacklistHistory.expiresAt,
    })
    .from(blacklistHistory)
    .where(and(eq(blacklistHistory.riderId, riderId), eq(blacklistHistory.banned, true)))
    .orderBy(desc(blacklistHistory.createdAt));

  const norm = (s: string) => {
    const x = (s || "").toLowerCase();
    return x === "ride" ? "person_ride" : x;
  };
  const isActiveBan = (entry: { isPermanent: boolean; expiresAt: Date | null }) =>
    entry.isPermanent || !entry.expiresAt || new Date(entry.expiresAt) > new Date();

  const getEffectiveForSlot = (slots: string[]) => {
    const candidate = entries.find((e) =>
      slots.includes(norm(String(e.serviceType ?? "all")))
    );
    if (!candidate) return null;
    return isActiveBan(candidate) ? candidate : null;
  };

  if (getEffectiveForSlot(["all"]) != null) return true;
  if (serviceType === "food") return getEffectiveForSlot(["food", "all"]) != null;
  if (serviceType === "parcel") return getEffectiveForSlot(["parcel", "all"]) != null;
  return getEffectiveForSlot(["person_ride", "all"]) != null;
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

async function loadOnDutyRiderIds(): Promise<number[]> {
  const sqlClient = getSql();
  const rows = (await sqlClient`
    WITH latest_duty AS (
      SELECT DISTINCT ON (dl.rider_id)
        dl.rider_id,
        dl.status
      FROM duty_logs dl
      ORDER BY dl.rider_id, dl.timestamp DESC
    )
    SELECT r.id AS rider_id
    FROM riders r
    INNER JOIN latest_duty ld ON ld.rider_id = r.id AND ld.status = 'ON'
    WHERE r.status = 'ACTIVE'
      AND r.onboarding_stage = 'ACTIVE'
      AND r.deleted_at IS NULL
  `) as Array<{ rider_id: number }>;

  return (rows ?? [])
    .map((r) => Number(r.rider_id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

/**
 * Full eligibility for a specific order dispatch target (push, socket, pool, accept).
 * Uses live GPS and the supplied effective pickup radius (wave-aware).
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
  >
): Promise<EligibleDispatchRider | null> {
  const { isRiderSubscriptionDispatchBlocked } = await import("./rider-subscription-wallet.js");
  if (await isRiderSubscriptionDispatchBlocked(riderId)) return null;

  const ctx = await resolveRiderAssignmentContext(riderId, { skipAssignmentCheck: true });
  if (!ctx) return null;
  if (!ctx.eligibleServices.includes(target.serviceType)) return null;

  if (target.serviceType === "person_ride") {
    const riderVehicleTypes = await getRiderActiveVehicleTypeCodes(riderId);
    if (!riderMatchesPersonRideVehicleTypes(riderVehicleTypes, target.personRideVehicleTypes)) {
      return null;
    }
  }

  const assignmentOk = await canRiderReceiveDispatchOffer(riderId, target.serviceType, {
    orderCoreId: target.orderCoreId,
    orderId: target.orderId,
    eventContext: "dispatch_offer",
  });
  if (!assignmentOk) return null;
  if (!ctx.eligibleServices.includes(target.serviceType)) return null;
  if (await isRiderBlacklistedForService(riderId, target.serviceType)) return null;

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
    return null;
  }

  return {
    riderId: ctx.riderId,
    lat: ctx.lat,
    lng: ctx.lng,
    distanceMeters,
    eligibleServices: ctx.eligibleServices,
  };
}

/** Inverse of pool listing — eligible riders for one order at the current wave. */
export async function listEligibleRidersForDispatchOrder(
  target: DispatchOrderTarget
): Promise<EligibleDispatchRider[]> {
  const { isOrderDispatchManualHold } = await import("./order-dispatch-manual-hold.js");
  if (await isOrderDispatchManualHold(target.orderCoreId)) return [];

  const candidateIds = await loadOnDutyRiderIds();
  const { fetchExcludedRiderIdsForOrder } = await import("./rider-dispatch-order-exclusion.js");
  const excludedRiderIds = await fetchExcludedRiderIdsForOrder(target.orderCoreId);
  const eligible: EligibleDispatchRider[] = [];

  for (const riderId of candidateIds) {
    if (excludedRiderIds.has(riderId)) continue;
    const row = await evaluateRiderDispatchEligibility(riderId, target);
    if (row) eligible.push(row);
  }

  return eligible.sort((a, b) => a.distanceMeters - b.distanceMeters);
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

  if (!rider || rider.status !== "ACTIVE" || rider.onboardingStage !== "ACTIVE") return null;

  if (!options?.ignoreActiveOrder && !options?.skipAssignmentCheck) {
    if (options?.serviceTypeForDispatch) {
      const allowed = await canRiderReceiveDispatchOffer(riderId, options.serviceTypeForDispatch);
      if (!allowed) return null;
    } else if (await riderHasActiveDispatchOrder(riderId)) {
      return null;
    }
  }

  const [latestDuty] = await db
    .select({ status: dutyLogs.status, serviceTypes: dutyLogs.serviceTypes })
    .from(dutyLogs)
    .where(eq(dutyLogs.riderId, riderId))
    .orderBy(desc(dutyLogs.timestamp))
    .limit(1);

  if (latestDuty?.status !== "ON") return null;

  const dutyServices = normalizeDispatchServices(latestDuty.serviceTypes);
  let vehicleServices = await getActiveVehicleServiceTypes(riderId);
  if (vehicleServices.length === 0) {
    const vehicleTypeCodes = await getRiderActiveVehicleTypeCodes(riderId);
    if (vehicleTypeCodes.length > 0) {
      vehicleServices = dutyServices;
    }
  }
  const eligibleServices = intersectServices(dutyServices, vehicleServices);

  if (eligibleServices.length === 0) return null;

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
    throw new RiderDispatchIneligibleError("You are suspended from this service", 403);
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

async function fetchPersonRidePoolRows(): Promise<DispatchPoolOrderRow[]> {
  const db = getDb();
  const rows = await db
    .select({
      orderCoreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
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
      createdAt: ordersCore.createdAt,
    })
    .from(ordersCore)
    .innerJoin(ordersParcel, eq(ordersParcel.orderId, ordersCore.id))
    .where(
      and(
        eq(ordersCore.orderType, "parcel"),
        isNull(ordersCore.riderId),
        eq(ordersCore.currentStatus, "READY_FOR_PICKUP"),
        sql`${ordersCore.status} NOT IN ('delivered', 'cancelled', 'failed')`
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
  for (const order of candidates) {
    if (excludedCoreIds.has(order.orderCoreId)) continue;
    if (await isOrderDispatchManualHold(order.orderCoreId)) continue;
    if (await isRiderBlacklistedForService(riderId, order.serviceType)) continue;

    const ctx = baseCtx;

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

    if (
      isRiderWithinPickupRadiusMeters(
        ctx.lat,
        ctx.lng,
        toPickupPoint(order.pickupLat, order.pickupLng),
        radiusMeters
      )
    ) {
      withinRadius.push(order);
    }
  }

  return withinRadius
    .sort((a, b) => {
      const pri = Number(b.higherDispatchPriority) - Number(a.higherDispatchPriority);
      if (pri !== 0) return pri;
      if (b.customerTipAmount !== a.customerTipAmount) {
        return b.customerTipAmount - a.customerTipAmount;
      }
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .slice(0, 15);
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
  }

  return ctx;
}
