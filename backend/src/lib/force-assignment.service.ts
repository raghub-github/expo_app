/**
 * Force Assignment — offer a replacement rider while the current rider stays assigned
 * until the new rider accepts. Never leaves the order riderless mid-process.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { cacheDel, cacheGet, cacheSet, withLock } from "@gatimitra/redis";
import { getDb, getSql } from "../db/client.js";
import {
  ordersCore,
  ordersFood,
  riderVehicles,
  riders,
} from "../db/schema.js";
import {
  evaluateRiderDispatchEligibility,
  haversineDistanceMeters,
  type DispatchOrderTarget,
  type DispatchPoolOrderRow,
} from "./order-assignment-engine.js";
import { fetchEffectiveDispatchRadiusMeters } from "./order-dispatch-settings.js";
import { notifyRiderDispatchOffer } from "./rider-dispatch-notify.js";
import { recordDispatchAssignmentAudit } from "./rider-dispatch-assignment-audit.js";
import { publishOrderEvent, publishRiderEvent } from "../modules/realtime/publish.js";
import { setOrderDispatchManualHold } from "./order-dispatch-manual-hold.js";
import { completeOrderDispatch } from "./order-dispatch.service.js";
import {
  recordFoodRiderAdminCancelled,
  recordRiderOrderAccepted,
} from "./rider-ride-assignment.js";
import { recordFoodRiderAssignedTimeline } from "./food-rider-assigned-timeline.js";

const FORCE_KEY = (orderCoreId: number) => `force_assignment:order:${orderCoreId}`;
const FORCE_RIDER_KEY = (riderId: number) => `force_assignment:rider:${riderId}`;
/** Keep state after offer expiry so UI can show timeout / history briefly. */
const STATE_TTL_SEC = 60 * 60;
const DEFAULT_OFFER_SEC = 90;

async function withForceLock<T>(orderCoreId: number, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const result = await withLock(`force_assignment:${orderCoreId}`, ttlMs, fn);
  if (result === null) {
    throw Object.assign(new Error("Another Force Assignment operation is in progress"), {
      statusCode: 409,
    });
  }
  return result;
}

export type ForceAssignmentStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "timeout"
  | "cancelled";

export type ForceAssignmentState = {
  orderCoreId: number;
  orderId: string;
  formattedOrderId: string | null;
  oldRiderId: number | null;
  oldRiderName: string | null;
  newRiderId: number;
  newRiderName: string | null;
  reasonCode: string;
  reasonText: string;
  catalogReasonId: number | null;
  adminEmail: string | null;
  adminUserId: string | null;
  status: ForceAssignmentStatus;
  offerExpiresAt: string;
  startedAt: string;
  offerSentAt: string;
  endedAt?: string | null;
};

export type AdminSelectableRider = {
  riderId: number;
  name: string | null;
  mobile: string | null;
  /** Distance rider → merchant/pickup (mx). */
  distanceKm: number | null;
  distanceFromMxKm: number | null;
  /** Distance rider → customer/drop (cx). */
  distanceFromCxKm: number | null;
  etaMinutes: number | null;
  onlineStatus: "ONLINE" | "BUSY" | "OFFLINE";
  /** AVAILABLE when no active orders; OCCUPIED otherwise. */
  dutyLoadStatus: "AVAILABLE" | "OCCUPIED";
  activeOrderCount: number;
  completedOrderCount: number;
  /** Formatted public id of the active order when OCCUPIED. */
  occupiedOrderId: string | null;
  vehicleType: string | null;
  rating: number | null;
  earningsToday: number | null;
  acceptanceRate: number | null;
  lat: number | null;
  lng: number | null;
};

function parseCoord(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

async function loadOrderForForce(orderCoreId: number) {
  const db = getDb();
  const [row] = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      orderType: ordersCore.orderType,
      riderId: ordersCore.riderId,
      status: ordersCore.status,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
      foodStatus: ordersFood.orderStatus,
      foodCancelled: ordersFood.cancelledAt,
      createdAt: ordersCore.createdAt,
    })
    .from(ordersCore)
    .leftJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);
  return row ?? null;
}

async function loadRiderName(riderId: number | null): Promise<string | null> {
  if (riderId == null) return null;
  const db = getDb();
  const [row] = await db
    .select({ name: riders.name })
    .from(riders)
    .where(eq(riders.id, riderId))
    .limit(1);
  return row?.name?.trim() || null;
}

function normalizePending(state: ForceAssignmentState | null): ForceAssignmentState | null {
  if (!state) return null;
  if (state.status !== "pending") return state;
  if (new Date(state.offerExpiresAt).getTime() <= Date.now()) {
    return {
      ...state,
      status: "timeout",
      endedAt: new Date().toISOString(),
    };
  }
  return state;
}

export async function getForceAssignmentState(
  orderCoreId: number
): Promise<ForceAssignmentState | null> {
  const raw = await cacheGet<ForceAssignmentState>(FORCE_KEY(orderCoreId));
  const state = normalizePending(raw);
  if (!state) return null;
  if (raw && state.status === "timeout" && raw.status === "pending") {
    await persistForceState(state);
    await cacheDel(FORCE_RIDER_KEY(state.newRiderId));
    await recordDispatchAssignmentAudit({
      orderCoreId: state.orderCoreId,
      orderId: state.orderId,
      riderId: state.newRiderId,
      eventType: "timeout",
      timeoutAt: new Date(),
      responseReceivedAt: new Date(),
      actorType: "system",
      actorId: "force_assignment",
      metadata: {
        forceAssignment: true,
        oldRiderId: state.oldRiderId,
        reasonCode: state.reasonCode,
        event: "force_assignment_offer_timed_out",
      },
    }).catch(() => undefined);
    await publishOrderEvent(state.orderId, {
      type: "force_assignment_timed_out",
      orderCoreId: state.orderCoreId,
      newRiderId: state.newRiderId,
      oldRiderId: state.oldRiderId,
    });
  }
  return state;
}

export async function getPendingForceAssignmentForRider(
  riderId: number
): Promise<ForceAssignmentState | null> {
  const orderCoreId = await cacheGet<number>(FORCE_RIDER_KEY(riderId));
  if (!orderCoreId || !Number.isFinite(orderCoreId)) return null;
  const state = await getForceAssignmentState(orderCoreId);
  if (!state || state.status !== "pending" || state.newRiderId !== riderId) return null;
  return state;
}

async function persistForceState(state: ForceAssignmentState): Promise<void> {
  await cacheSet(FORCE_KEY(state.orderCoreId), state, STATE_TTL_SEC);
  if (state.status === "pending") {
    await cacheSet(FORCE_RIDER_KEY(state.newRiderId), state.orderCoreId, STATE_TTL_SEC);
  } else {
    await cacheDel(FORCE_RIDER_KEY(state.newRiderId));
  }
}

async function buildDispatchTarget(
  orderCoreId: number,
  orderId: string,
  formattedOrderId: string | null,
  pickupLat: unknown,
  pickupLon: unknown,
  /** Override wave radius (admin picker uses merchant max 10 km). */
  radiusMetersOverride?: number
): Promise<DispatchOrderTarget> {
  const effectiveRadiusMeters =
    radiusMetersOverride != null && Number.isFinite(radiusMetersOverride)
      ? radiusMetersOverride
      : await fetchEffectiveDispatchRadiusMeters("food", 1);
  return {
    orderCoreId,
    orderId,
    formattedOrderId,
    serviceType: "food",
    pickup: {
      latitude: parseCoord(pickupLat),
      longitude: parseCoord(pickupLon),
    },
    waveNumber: 1,
    effectiveRadiusMeters,
  };
}

/** Max merchant-centric radius for Force Assignment / admin rider picker. */
const ADMIN_SELECTABLE_MAX_RADIUS_KM = 10;
const ADMIN_SELECTABLE_MAX_RADIUS_METERS = ADMIN_SELECTABLE_MAX_RADIUS_KM * 1000;

/**
 * Admin Force Assignment picker: all riders with live GPS within 10 km of merchant
 * (pickup), including offline / busy / online. Client filters by radius + duty toggle.
 */
export async function listAdminSelectableRidersForOrder(
  orderCoreId: number
): Promise<AdminSelectableRider[]> {
  const order = await loadOrderForForce(orderCoreId);
  if (!order?.orderId) return [];
  if (String(order.orderType ?? "").toLowerCase() !== "food") return [];

  const mxLat = parseCoord(order.pickupLat);
  const mxLng = parseCoord(order.pickupLon);
  if (mxLat === 0 && mxLng === 0) return [];

  const dropLat = parseCoord(order.dropLat);
  const dropLon = parseCoord(order.dropLon);
  const hasDrop = !(dropLat === 0 && dropLon === 0);
  const currentRiderId =
    order.riderId != null && Number.isFinite(Number(order.riderId))
      ? Number(order.riderId)
      : null;

  const padDeg = (ADMIN_SELECTABLE_MAX_RADIUS_KM / 111) * 1.2;
  const sqlClient = getSql();

  const nearRows = (await sqlClient`
    WITH positioned AS (
      SELECT
        r.id AS rider_id,
        r.name,
        r.mobile,
        rcl.lat,
        rcl.lng,
        ld.duty_status
      FROM rider_current_locations rcl
      INNER JOIN riders r ON r.id = rcl.rider_id
      LEFT JOIN LATERAL (
        SELECT dl.status::text AS duty_status
        FROM duty_logs dl
        WHERE dl.rider_id = r.id
        ORDER BY dl.timestamp DESC
        LIMIT 1
      ) ld ON true
      WHERE r.deleted_at IS NULL
        AND rcl.lat IS NOT NULL
        AND rcl.lng IS NOT NULL
        AND rcl.lat BETWEEN ${mxLat - padDeg} AND ${mxLat + padDeg}
        AND rcl.lng BETWEEN ${mxLng - padDeg} AND ${mxLng + padDeg}
        AND (${currentRiderId}::int IS NULL OR r.id <> ${currentRiderId})
    ),
    with_distance AS (
      SELECT
        p.*,
        (
          6371 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${mxLat})) * cos(radians(p.lat))
              * cos(radians(p.lng) - radians(${mxLng}))
              + sin(radians(${mxLat})) * sin(radians(p.lat))
            ))
          )
        ) AS distance_from_mx_km
      FROM positioned p
    )
    SELECT
      rider_id,
      name,
      mobile,
      lat,
      lng,
      duty_status,
      distance_from_mx_km
    FROM with_distance
    WHERE distance_from_mx_km <= ${ADMIN_SELECTABLE_MAX_RADIUS_KM}
    ORDER BY distance_from_mx_km ASC
    LIMIT 120
  `) as Array<{
    rider_id: number;
    name: string | null;
    mobile: string | null;
    lat: number;
    lng: number;
    duty_status: string | null;
    distance_from_mx_km: number;
  }>;

  if (nearRows.length === 0) return [];

  const ids = nearRows.map((r) => Number(r.rider_id));
  const db = getDb();

  const vehicleRows = await db
    .select({
      riderId: riderVehicles.riderId,
      vehicleType: riderVehicles.vehicleType,
    })
    .from(riderVehicles)
    .where(inArray(riderVehicles.riderId, ids));
  const vehicleMap = new Map<number, string>();
  for (const v of vehicleRows) {
    if (!vehicleMap.has(v.riderId) && v.vehicleType) {
      vehicleMap.set(v.riderId, String(v.vehicleType));
    }
  }

  const activeCounts = (await sqlClient`
    SELECT rider_id, COUNT(*)::int AS cnt
    FROM orders_core
    WHERE rider_id = ANY(${ids})
      AND status NOT IN ('delivered', 'cancelled', 'failed')
      AND cancelled_at IS NULL
    GROUP BY rider_id
  `) as Array<{ rider_id: number; cnt: number }>;
  const activeMap = new Map(activeCounts.map((r) => [Number(r.rider_id), Number(r.cnt)]));

  const completedCounts = (await sqlClient`
    SELECT rider_id, COUNT(*)::int AS cnt
    FROM orders_core
    WHERE rider_id = ANY(${ids})
      AND status = 'delivered'
    GROUP BY rider_id
  `) as Array<{ rider_id: number; cnt: number }>;
  const completedMap = new Map(
    completedCounts.map((r) => [Number(r.rider_id), Number(r.cnt)])
  );

  const occupiedRows = (await sqlClient`
    SELECT DISTINCT ON (rider_id)
      rider_id,
      COALESCE(
        NULLIF(trim(formatted_order_id), ''),
        NULLIF(trim(order_id), ''),
        id::text
      ) AS occupied_order_id
    FROM orders_core
    WHERE rider_id = ANY(${ids})
      AND status NOT IN ('delivered', 'cancelled', 'failed')
      AND cancelled_at IS NULL
    ORDER BY rider_id, created_at DESC NULLS LAST
  `) as Array<{ rider_id: number; occupied_order_id: string | null }>;
  const occupiedMap = new Map(
    occupiedRows.map((r) => [
      Number(r.rider_id),
      r.occupied_order_id?.trim() || null,
    ])
  );

  const out: AdminSelectableRider[] = [];
  for (const row of nearRows) {
    const riderId = Number(row.rider_id);
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const activeOrderCount = activeMap.get(riderId) ?? 0;
    const completedOrderCount = completedMap.get(riderId) ?? 0;
    const duty = String(row.duty_status ?? "").toUpperCase();
    let onlineStatus: "ONLINE" | "BUSY" | "OFFLINE" = "OFFLINE";
    if (duty === "ON") {
      onlineStatus = activeOrderCount > 0 ? "BUSY" : "ONLINE";
    }
    const dutyLoadStatus: "AVAILABLE" | "OCCUPIED" =
      activeOrderCount > 0 ? "OCCUPIED" : "AVAILABLE";
    const distanceFromMxKm = Number(row.distance_from_mx_km);
    const distanceFromCxKm =
      hasDrop && Number.isFinite(lat) && Number.isFinite(lng)
        ? haversineDistanceMeters(lat, lng, dropLat, dropLon) / 1000
        : null;
    const etaMinutes = Math.max(
      1,
      Math.round((distanceFromMxKm / 20) * 60)
    );

    out.push({
      riderId,
      name: row.name ?? null,
      mobile: row.mobile ?? null,
      distanceKm: distanceFromMxKm,
      distanceFromMxKm,
      distanceFromCxKm,
      etaMinutes,
      onlineStatus,
      dutyLoadStatus,
      activeOrderCount,
      completedOrderCount,
      occupiedOrderId:
        dutyLoadStatus === "OCCUPIED" ? occupiedMap.get(riderId) ?? null : null,
      vehicleType: vehicleMap.get(riderId) ?? null,
      rating: null,
      earningsToday: null,
      acceptanceRate: null,
      lat,
      lng,
    });
  }
  return out;
}

export type StartForceAssignmentInput = {
  orderCoreId: number;
  newRiderId: number;
  reasonCode: string;
  reasonText: string;
  catalogReasonId?: number | null;
  adminEmail?: string | null;
  adminUserId?: string | null;
  offerSeconds?: number;
};

export async function startForceAssignment(
  input: StartForceAssignmentInput
): Promise<ForceAssignmentState> {
  return withForceLock(input.orderCoreId, 15_000, async () => {
    const existing = await getForceAssignmentState(input.orderCoreId);
    if (existing?.status === "pending") {
      throw Object.assign(new Error("Force Assignment already in progress for this order"), {
        statusCode: 409,
      });
    }

    const order = await loadOrderForForce(input.orderCoreId);
    if (!order?.orderId) {
      throw Object.assign(new Error("Order not found"), { statusCode: 404 });
    }
    if (String(order.orderType ?? "").toLowerCase() !== "food") {
      throw Object.assign(new Error("Force Assignment is only supported for food orders"), {
        statusCode: 400,
      });
    }
    const foodSt = String(order.foodStatus ?? "").toUpperCase();
    if (
      order.foodCancelled != null ||
      ["DELIVERED", "CANCELLED"].includes(foodSt) ||
      ["delivered", "cancelled", "failed"].includes(String(order.status ?? "").toLowerCase())
    ) {
      throw Object.assign(new Error("Cannot force-assign on a terminal order"), {
        statusCode: 409,
      });
    }

    const oldRiderId = order.riderId != null ? Number(order.riderId) : null;
    if (oldRiderId != null && oldRiderId === input.newRiderId) {
      throw Object.assign(new Error("Select a different rider than the current assignee"), {
        statusCode: 400,
      });
    }

    const target = await buildDispatchTarget(
      input.orderCoreId,
      order.orderId.trim(),
      order.formattedOrderId,
      order.pickupLat,
      order.pickupLon
    );

    const eligible = await evaluateRiderDispatchEligibility(input.newRiderId, target);
    if (!eligible) {
      throw Object.assign(new Error("Selected rider is not eligible for this order"), {
        statusCode: 409,
      });
    }

    const offerSec = Math.max(30, Math.min(300, input.offerSeconds ?? DEFAULT_OFFER_SEC));
    const now = new Date();
    const expires = new Date(now.getTime() + offerSec * 1000);
    const [oldRiderName, newRiderName] = await Promise.all([
      loadRiderName(oldRiderId),
      loadRiderName(input.newRiderId),
    ]);

    const state: ForceAssignmentState = {
      orderCoreId: input.orderCoreId,
      orderId: order.orderId.trim(),
      formattedOrderId: order.formattedOrderId,
      oldRiderId,
      oldRiderName,
      newRiderId: input.newRiderId,
      newRiderName,
      reasonCode: input.reasonCode.trim() || "FORCE_ASSIGNMENT",
      reasonText: input.reasonText.trim() || "Force Assignment",
      catalogReasonId: input.catalogReasonId ?? null,
      adminEmail: input.adminEmail ?? null,
      adminUserId: input.adminUserId ?? null,
      status: "pending",
      offerExpiresAt: expires.toISOString(),
      startedAt: now.toISOString(),
      offerSentAt: now.toISOString(),
      endedAt: null,
    };

    await persistForceState(state);

    await notifyRiderDispatchOffer(target, eligible);

    await recordDispatchAssignmentAudit({
      orderCoreId: state.orderCoreId,
      orderId: state.orderId,
      riderId: state.newRiderId,
      eventType: "offer_sent",
      offerSentAt: now,
      actorType: "admin",
      actorId: state.adminEmail ?? state.adminUserId ?? "admin",
      metadata: {
        forceAssignment: true,
        event: "force_assignment_started",
        oldRiderId: state.oldRiderId,
        reasonCode: state.reasonCode,
        reasonText: state.reasonText,
        adminEmail: state.adminEmail,
        updated_by: state.adminEmail,
        actor_type: "admin",
        offerExpiresAt: state.offerExpiresAt,
      },
      occurredAt: now,
    });

    await publishOrderEvent(state.orderId, {
      type: "force_assignment_started",
      orderCoreId: state.orderCoreId,
      oldRiderId: state.oldRiderId,
      newRiderId: state.newRiderId,
      offerExpiresAt: state.offerExpiresAt,
    });
    await publishRiderEvent(state.newRiderId, {
      type: "force_assignment_offer",
      orderId: state.orderId,
      formattedOrderId: state.formattedOrderId,
      offerExpiresAt: state.offerExpiresAt,
    });

    return state;
  });
}

export async function cancelForceAssignment(args: {
  orderCoreId: number;
  adminEmail?: string | null;
  adminUserId?: string | null;
}): Promise<ForceAssignmentState | null> {
  return withForceLock(args.orderCoreId, 10_000, async () => {
    const state = await getForceAssignmentState(args.orderCoreId);
    if (!state || state.status !== "pending") {
      throw Object.assign(new Error("No active Force Assignment to cancel"), {
        statusCode: 409,
      });
    }
    const ended: ForceAssignmentState = {
      ...state,
      status: "cancelled",
      endedAt: new Date().toISOString(),
    };
    await persistForceState(ended);
    await recordDispatchAssignmentAudit({
      orderCoreId: state.orderCoreId,
      orderId: state.orderId,
      riderId: state.newRiderId,
      eventType: "cancelled",
      cancelledAt: new Date(),
      actorType: "admin",
      actorId: args.adminEmail ?? args.adminUserId ?? "admin",
      metadata: {
        forceAssignment: true,
        event: "force_assignment_cancelled",
        oldRiderId: state.oldRiderId,
      },
    });
    await publishOrderEvent(state.orderId, {
      type: "force_assignment_cancelled",
      orderCoreId: state.orderCoreId,
    });
    await publishRiderEvent(state.newRiderId, {
      type: "dispatch_offer_withdrawn",
      reason: "force_assignment_cancelled",
      orderId: state.orderId,
    });
    return ended;
  });
}

export async function markForceAssignmentRejected(args: {
  orderCoreId: number;
  riderId: number;
}): Promise<void> {
  const state = await getForceAssignmentState(args.orderCoreId);
  if (!state || state.status !== "pending") return;
  if (state.newRiderId !== args.riderId) return;
  const ended: ForceAssignmentState = {
    ...state,
    status: "rejected",
    endedAt: new Date().toISOString(),
  };
  await persistForceState(ended);
  await publishOrderEvent(state.orderId, {
    type: "force_assignment_rejected",
    orderCoreId: state.orderCoreId,
    newRiderId: state.newRiderId,
  });
}

/**
 * Inject pending force-assignment orders into the rider pool so the target rider
 * can accept even while the current rider remains assigned.
 */
export async function appendForceAssignmentPoolRow(
  riderId: number,
  rows: DispatchPoolOrderRow[]
): Promise<DispatchPoolOrderRow[]> {
  const force = await getPendingForceAssignmentForRider(riderId);
  if (!force) return rows;
  if (rows.some((r) => r.orderCoreId === force.orderCoreId)) return rows;

  const order = await loadOrderForForce(force.orderCoreId);
  if (!order?.orderId) return rows;

  const injected: DispatchPoolOrderRow = {
    orderCoreId: force.orderCoreId,
    orderId: order.orderId.trim(),
    formattedOrderId: order.formattedOrderId,
    serviceType: "food",
    pickupLat: parseCoord(order.pickupLat),
    pickupLng: parseCoord(order.pickupLon),
    dropLat: order.dropLat != null ? parseCoord(order.dropLat) : null,
    dropLng: order.dropLon != null ? parseCoord(order.dropLon) : null,
    createdAt: order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt ?? Date.now()),
    higherDispatchPriority: true,
    customerTipAmount: 0,
  };
  return [injected, ...rows];
}

/**
 * Accept path for Force Assignment — clears old rider only after new rider claims,
 * in one transaction so the order never becomes riderless.
 */
export async function acceptForceAssignmentForRider(
  riderId: number,
  orderRef: string
): Promise<{ handled: false } | { handled: true; summaryOrderId: string; orderCoreId: number }> {
  const db = getDb();
  const [lookup] = await db
    .select({ id: ordersCore.id, orderId: ordersCore.orderId })
    .from(ordersCore)
    .where(
      sql`(${ordersCore.orderId} = ${orderRef.trim()} OR ${ordersCore.formattedOrderId} = ${orderRef.trim()})`
    )
    .limit(1);

  if (!lookup?.id) return { handled: false };

  const state = await getForceAssignmentState(lookup.id);
  if (!state || state.status !== "pending" || state.newRiderId !== riderId) {
    return { handled: false };
  }

  return withForceLock(lookup.id, 20_000, async () => {
    const fresh = await getForceAssignmentState(lookup.id);
    if (!fresh || fresh.status !== "pending" || fresh.newRiderId !== riderId) {
      throw Object.assign(new Error("Force Assignment is no longer available"), {
        statusCode: 409,
      });
    }

    const now = new Date();
    const [riderProfile] = await db
      .select({ name: riders.name, mobile: riders.mobile })
      .from(riders)
      .where(eq(riders.id, riderId))
      .limit(1);

    const [pre] = await db
      .select({
        id: ordersCore.id,
        orderId: ordersCore.orderId,
        riderId: ordersCore.riderId,
        foodStatus: ordersFood.orderStatus,
      })
      .from(ordersCore)
      .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
      .where(eq(ordersCore.id, lookup.id))
      .limit(1);

    if (!pre?.id || !pre.orderId) {
      throw Object.assign(new Error("Order not found"), { statusCode: 404 });
    }

    const orderIdText = pre.orderId.trim();
    const currentRiderId = pre.riderId != null ? Number(pre.riderId) : null;
    if (fresh.oldRiderId != null && currentRiderId !== fresh.oldRiderId) {
      throw Object.assign(new Error("Current rider changed — Force Assignment aborted"), {
        statusCode: 409,
      });
    }
    if (fresh.oldRiderId == null && currentRiderId != null) {
      throw Object.assign(new Error("Order already assigned to another rider"), {
        statusCode: 409,
      });
    }

    const foodStatusAtAccept = String(pre.foodStatus ?? "").trim().toUpperCase();
    const readyNow = foodStatusAtAccept === "READY_FOR_PICKUP";
    const nextCoreStatus = readyNow ? "OUT_FOR_DELIVERY" : "RIDER_ASSIGNED";
    const nextFoodStatus = readyNow ? "OUT_FOR_DELIVERY" : foodStatusAtAccept;

    await db.transaction(async (tx) => {
      if (fresh.oldRiderId != null) {
        await tx
          .update(ordersCore)
          .set({
            riderId: null,
            status: "assigned",
            updatedAt: now,
          })
          .where(
            and(eq(ordersCore.id, pre.id), eq(ordersCore.riderId, fresh.oldRiderId))
          );

        await tx
          .update(ordersFood)
          .set({
            riderId: null,
            riderReachedPickupAt: null,
            pickupDurationSeconds: null,
            pickupTimerStartedAt: null,
            pickupWaitSeconds: null,
            riderPickedUpAt: null,
            handedOverToRiderAt: null,
            dispatchedAt: null,
            updatedAt: now,
          })
          .where(eq(ordersFood.orderId, pre.id));

        await recordFoodRiderAdminCancelled(tx, {
          orderCorePk: pre.id,
          orderIdText,
          riderId: fresh.oldRiderId,
          reasonCode: fresh.reasonCode,
          reasonText: fresh.reasonText,
          removedBy: fresh.adminEmail,
          actorType: "admin",
          actorId: fresh.adminUserId ?? fresh.adminEmail ?? undefined,
          cancelledBy: fresh.adminEmail,
          foodStatus: foodStatusAtAccept,
          occurredAt: now,
        });
      }

      const [updated] = await tx
        .update(ordersCore)
        .set({
          riderId,
          status: "accepted",
          currentStatus: readyNow ? "RIDER_ASSIGNED" : nextCoreStatus,
          actualPickupTime: null,
          updatedAt: now,
        })
        .where(and(eq(ordersCore.id, pre.id), isNull(ordersCore.riderId)))
        .returning({ id: ordersCore.id, orderId: ordersCore.orderId });

      if (!updated?.id) {
        throw Object.assign(new Error("Could not transfer order to replacement rider"), {
          statusCode: 409,
        });
      }

      await tx
        .update(ordersFood)
        .set({
          riderId,
          riderName: riderProfile?.name ?? null,
          riderPhone: riderProfile?.mobile ?? null,
          orderStatus: nextFoodStatus,
          riderReachedPickupAt: null,
          pickupDurationSeconds: null,
          pickupTimerStartedAt: null,
          pickupWaitSeconds: null,
          ...(readyNow ? { dispatchedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(ordersFood.orderId, updated.id));

      await recordFoodRiderAssignedTimeline(tx, {
        orderCorePk: updated.id,
        previousStatus: foodStatusAtAccept,
        riderId,
        riderName: riderProfile?.name ?? null,
        statusMessage: "Force Assignment — replacement rider accepted",
        occurredAt: now,
      });

      await recordRiderOrderAccepted(tx, {
        orderCorePk: updated.id,
        orderIdText: (updated.orderId ?? orderIdText).trim(),
        riderId,
        serviceType: "food",
        occurredAt: now,
        riderName: riderProfile?.name ?? null,
        riderMobile: riderProfile?.mobile ?? null,
      });
    });

    await setOrderDispatchManualHold(pre.id, false);
    await completeOrderDispatch(pre.id, "accepted").catch(() => undefined);

    const acceptedState: ForceAssignmentState = {
      ...fresh,
      status: "accepted",
      endedAt: now.toISOString(),
    };
    await persistForceState(acceptedState);

    await recordDispatchAssignmentAudit({
      orderCoreId: pre.id,
      orderId: orderIdText,
      riderId,
      eventType: "accepted",
      acceptedAt: now,
      responseReceivedAt: now,
      actorType: "rider",
      actorId: String(riderId),
      metadata: {
        forceAssignment: true,
        event: "force_assignment_accepted",
        oldRiderId: fresh.oldRiderId,
        reasonCode: fresh.reasonCode,
      },
      occurredAt: now,
    });

    if (fresh.oldRiderId != null) {
      await recordDispatchAssignmentAudit({
        orderCoreId: pre.id,
        orderId: orderIdText,
        riderId: fresh.oldRiderId,
        eventType: "removed",
        unassignedAt: now,
        removedBy: fresh.adminEmail,
        removalReason: fresh.reasonText,
        actorType: "admin",
        actorId: fresh.adminEmail ?? fresh.adminUserId,
        metadata: {
          forceAssignment: true,
          event: "force_assignment_old_rider_removed",
          newRiderId: riderId,
          reasonCode: fresh.reasonCode,
        },
        occurredAt: now,
      });
      await publishRiderEvent(fresh.oldRiderId, {
        type: "assignment_cancelled",
        reason: "force_assignment_replaced",
        orderId: orderIdText,
        reasonText: fresh.reasonText,
      });
    }

    await publishOrderEvent(orderIdText, {
      type: "force_assignment_completed",
      orderCoreId: pre.id,
      oldRiderId: fresh.oldRiderId,
      newRiderId: riderId,
    });

    return {
      handled: true as const,
      summaryOrderId: orderIdText,
      orderCoreId: pre.id,
    };
  });
}

/** Admin hard-assign a specific rider immediately (Manual Assignment via picker). */
export async function adminHardAssignSpecificRider(args: {
  orderCoreId: number;
  riderId: number;
  adminEmail?: string | null;
  adminUserId?: string | null;
}): Promise<void> {
  const force = await getForceAssignmentState(args.orderCoreId);
  if (force?.status === "pending") {
    throw Object.assign(new Error("Cancel Force Assignment before manual assign"), {
      statusCode: 409,
    });
  }

  const order = await loadOrderForForce(args.orderCoreId);
  if (!order?.orderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }
  if (order.riderId != null) {
    throw Object.assign(new Error("Order already has a rider — use Force Assignment"), {
      statusCode: 409,
    });
  }

  const target = await buildDispatchTarget(
    args.orderCoreId,
    order.orderId.trim(),
    order.formattedOrderId,
    order.pickupLat,
    order.pickupLon
  );
  const eligible = await evaluateRiderDispatchEligibility(args.riderId, target);
  if (!eligible) {
    throw Object.assign(new Error("Selected rider is not eligible for this order"), {
      statusCode: 409,
    });
  }

  const db = getDb();
  const now = new Date();
  const [riderProfile] = await db
    .select({ name: riders.name, mobile: riders.mobile })
    .from(riders)
    .where(eq(riders.id, args.riderId))
    .limit(1);

  const foodStatusAtAccept = String(order.foodStatus ?? "").trim().toUpperCase();
  const readyNow = foodStatusAtAccept === "READY_FOR_PICKUP";
  const nextCoreStatus = readyNow ? "OUT_FOR_DELIVERY" : "RIDER_ASSIGNED";
  const nextFoodStatus = readyNow ? "OUT_FOR_DELIVERY" : foodStatusAtAccept;

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(ordersCore)
      .set({
        riderId: args.riderId,
        status: "accepted",
        currentStatus: readyNow ? "RIDER_ASSIGNED" : nextCoreStatus,
        actualPickupTime: null,
        updatedAt: now,
      })
      .where(and(eq(ordersCore.id, args.orderCoreId), isNull(ordersCore.riderId)))
      .returning({ id: ordersCore.id, orderId: ordersCore.orderId });

    if (!updated?.id) {
      throw Object.assign(new Error("Order already taken"), { statusCode: 409 });
    }

    await tx
      .update(ordersFood)
      .set({
        riderId: args.riderId,
        riderName: riderProfile?.name ?? null,
        riderPhone: riderProfile?.mobile ?? null,
        orderStatus: nextFoodStatus,
        ...(readyNow ? { dispatchedAt: now } : {}),
        updatedAt: now,
      })
      .where(eq(ordersFood.orderId, updated.id));

    await recordFoodRiderAssignedTimeline(tx, {
      orderCorePk: updated.id,
      previousStatus: foodStatusAtAccept,
      riderId: args.riderId,
      riderName: riderProfile?.name ?? null,
      statusMessage: "Rider assigned manually by admin",
      occurredAt: now,
    });

    await recordRiderOrderAccepted(tx, {
      orderCorePk: updated.id,
      orderIdText: (updated.orderId ?? order.orderId!).trim(),
      riderId: args.riderId,
      serviceType: "food",
      occurredAt: now,
      riderName: riderProfile?.name ?? null,
      riderMobile: riderProfile?.mobile ?? null,
    });
  });

  await setOrderDispatchManualHold(args.orderCoreId, false);
  await completeOrderDispatch(args.orderCoreId, "accepted").catch(() => undefined);

  await recordDispatchAssignmentAudit({
    orderCoreId: args.orderCoreId,
    orderId: order.orderId.trim(),
    riderId: args.riderId,
    eventType: "assigned",
    assignedAt: now,
    actorType: "admin",
    actorId: args.adminEmail ?? args.adminUserId ?? "admin",
    metadata: {
      manualHardAssign: true,
      event: "manual_assignment_specific_rider",
      adminEmail: args.adminEmail ?? null,
      updated_by: args.adminEmail ?? null,
      actor_type: "admin",
    },
    occurredAt: now,
  });

  await publishOrderEvent(order.orderId.trim(), {
    type: "rider_assigned",
    orderCoreId: args.orderCoreId,
    riderId: args.riderId,
    source: "manual_hard_assign",
  });
  await publishRiderEvent(args.riderId, {
    type: "assignment_accepted",
    orderId: order.orderId.trim(),
    source: "manual_hard_assign",
  });
}
