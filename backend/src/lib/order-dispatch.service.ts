/**
 * Order dispatch orchestration — waves, sessions, filtered notifications.
 * Single source of truth for push, socket, pool visibility, and wave expansion.
 */

import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "../db/client.js";
import {
  customerRideServiceCatalog,
  ordersCore,
  ordersFood,
  ordersParcel,
  ordersRide,
} from "../db/schema.js";
import {
  fetchDispatchWaveSettings,
  fetchEffectiveDispatchRadiusMeters,
  hasNextDispatchWave,
} from "./order-dispatch-settings.js";
import {
  type DispatchOrderTarget,
  type DispatchServiceType,
  type EligibleDispatchRider,
  listEligibleRidersForDispatchOrder,
} from "./order-assignment-engine.js";
import { isFoodStatusDispatchableForConfiguredFlow } from "./food-rider-accept-flow.js";
import { recordDispatchOffersSent } from "./rider-dispatch-assignment-audit.js";
import { notifyEligibleRidersDispatchOffer } from "./rider-dispatch-notify.js";
import {
  isOrderDispatchManualHold,
  setOrderDispatchManualHold,
} from "./order-dispatch-manual-hold.js";
import { recordDispatchEvent } from "./dispatch-events.js";

export type DispatchSessionStatus = "active" | "accepted" | "expired" | "cancelled";

/** postgres.js bind params must be string/number — not raw Date objects. */
function toTimestamptzParam(value: Date | string | number): string {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function parseCoord(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeOrderServiceType(raw: string | null | undefined): DispatchServiceType | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "food") return "food";
  if (s === "parcel") return "parcel";
  if (s === "person_ride" || s === "ride") return "person_ride";
  return null;
}

async function isOrderStillDispatchable(orderCoreId: number): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({
      orderType: ordersCore.orderType,
      riderId: ordersCore.riderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      foodStatus: ordersFood.orderStatus,
      foodCancelled: ordersFood.cancelledAt,
      rideCancelled: ordersRide.cancelledAt,
      rideSearchExpiresAt: ordersRide.searchExpiresAt,
    })
    .from(ordersCore)
    .leftJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .leftJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);

  if (!row?.orderType || row.riderId != null) return false;

  const serviceType = normalizeOrderServiceType(row.orderType);
  if (!serviceType) return false;

  if (serviceType === "food") {
    return (
      (await isFoodStatusDispatchableForConfiguredFlow(row.foodStatus)) &&
      row.foodCancelled == null &&
      !["delivered", "cancelled", "failed"].includes(String(row.status ?? ""))
    );
  }

  if (serviceType === "parcel") {
    return (
      row.currentStatus === "READY_FOR_PICKUP" &&
      !["delivered", "cancelled", "failed"].includes(String(row.status ?? ""))
    );
  }

  if (row.rideCancelled != null) return false;
  if (row.rideSearchExpiresAt && new Date(row.rideSearchExpiresAt) <= new Date()) return false;

  return (
    row.status === "assigned" &&
    ["SEARCHING_RIDER", "PLACED", "CREATED"].includes(String(row.currentStatus ?? ""))
  );
}

async function loadDispatchOrderTarget(
  orderCoreId: number,
  waveNumber: number
): Promise<DispatchOrderTarget | null> {
  const db = getDb();
  const [row] = await db
    .select({
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      orderType: ordersCore.orderType,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      rideType: ordersRide.rideType,
      vehicleTypeRequired: ordersRide.vehicleTypeRequired,
    })
    .from(ordersCore)
    .leftJoin(ordersRide, eq(ordersRide.orderId, ordersCore.id))
    .where(eq(ordersCore.id, orderCoreId))
    .limit(1);

  const serviceType = normalizeOrderServiceType(row?.orderType);
  if (!row?.orderId || !serviceType) return null;

  const effectiveRadiusMeters = await fetchEffectiveDispatchRadiusMeters(serviceType, waveNumber);

  let personRideVehicleTypes: string[] | undefined;
  if (serviceType === "person_ride") {
    const rideType = row.rideType?.trim();
    if (rideType) {
      const [catalog] = await db
        .select({ vehicleTypes: customerRideServiceCatalog.vehicleTypes })
        .from(customerRideServiceCatalog)
        .where(eq(customerRideServiceCatalog.code, rideType))
        .limit(1);
      const fromCatalog = (catalog?.vehicleTypes ?? []).map((t) => String(t).trim()).filter(Boolean);
      if (fromCatalog.length > 0) {
        personRideVehicleTypes = fromCatalog;
      }
    }
    if (!personRideVehicleTypes?.length) {
      const fallback = row.vehicleTypeRequired?.trim();
      if (fallback) personRideVehicleTypes = [fallback];
    }
  }

  return {
    orderCoreId,
    orderId: row.orderId.trim(),
    formattedOrderId: row.formattedOrderId,
    serviceType,
    pickup: {
      latitude: parseCoord(row.pickupLat),
      longitude: parseCoord(row.pickupLon),
    },
    waveNumber,
    effectiveRadiusMeters,
    personRideVehicleTypes,
  };
}

async function fetchAlreadyNotifiedRiderIds(sessionId: number): Promise<Set<number>> {
  const sql = getSql();
  const rows = (await sql`
    SELECT rider_id
    FROM order_dispatch_rider_notifications
    WHERE session_id = ${sessionId}
  `) as Array<{ rider_id: number }>;

  return new Set((rows ?? []).map((r) => Number(r.rider_id)).filter((id) => id > 0));
}

async function recordRiderNotifications(
  sessionId: number,
  waveNumber: number,
  riderIds: number[]
): Promise<void> {
  if (riderIds.length === 0) return;
  const sql = getSql();
  for (const riderId of riderIds) {
    await sql`
      INSERT INTO order_dispatch_rider_notifications (session_id, rider_id, wave_number)
      VALUES (${sessionId}, ${riderId}, ${waveNumber})
      ON CONFLICT (session_id, rider_id) DO NOTHING
    `;
  }
}

async function filterNewlyEligibleRiders(
  sessionId: number,
  eligible: EligibleDispatchRider[]
): Promise<EligibleDispatchRider[]> {
  const already = await fetchAlreadyNotifiedRiderIds(sessionId);
  return eligible.filter((r) => !already.has(r.riderId));
}

/** Admin chose "Cancel rider only" — block waves/offers/pool/accept until manual assign. */
export async function isDispatchHeldForManualAssignment(
  orderCoreId: number
): Promise<boolean> {
  return isOrderDispatchManualHold(orderCoreId);
}

/** Stop dispatch after admin unassign — includes sessions already marked accepted by a rider. */
export async function pauseOrderDispatchForManualAssignment(
  orderCoreId: number
): Promise<void> {
  await setOrderDispatchManualHold(orderCoreId, true);

  const sql = getSql();
  const updated = (await sql`
    UPDATE order_dispatch_sessions
    SET
      status = 'cancelled',
      completed_at = NOW(),
      next_wave_at = NULL,
      updated_at = NOW()
    WHERE order_core_id = ${orderCoreId}
      AND status IN ('active', 'accepted')
    RETURNING id
  `) as Array<{ id: number }>;

  if (updated.length === 0) {
    await completeOrderDispatch(orderCoreId, "cancelled");
    return;
  }

  const { recordPendingDispatchOffersMissed } = await import(
    "./rider-dispatch-assignment-audit.js"
  );
  await recordPendingDispatchOffersMissed({
    orderCoreId,
    reason: "dispatch_admin_rider_hold",
    missSource: "dispatch_session",
  }).catch((err) => {
    console.warn("[pauseOrderDispatchForManualAssignment] missed-offer audit failed:", err);
  });
}

export async function completeOrderDispatch(
  orderCoreId: number,
  status: Exclude<DispatchSessionStatus, "active">
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE order_dispatch_sessions
    SET
      status = ${status},
      completed_at = NOW(),
      next_wave_at = NULL,
      updated_at = NOW()
    WHERE order_core_id = ${orderCoreId}
      AND status IN ('active', 'accepted')
  `;

  void recordDispatchEvent({
    orderCoreId,
    eventType: "dispatch_completed",
    metadata: { status },
  });

  if (status === "expired" || status === "cancelled") {
    const { recordPendingDispatchOffersMissed } = await import(
      "./rider-dispatch-assignment-audit.js"
    );
    await recordPendingDispatchOffersMissed({
      orderCoreId,
      reason: `dispatch_${status}`,
      missSource: "dispatch_session",
    }).catch((err) => {
      console.warn("[completeOrderDispatch] missed-offer audit failed:", err);
    });
  }
}

/**
 * Start or resume dispatch for an order. Safe to call multiple times — idempotent
 * while an active session exists.
 */
export async function startOrderDispatch(orderCoreId: number): Promise<void> {
  if (!(await isOrderStillDispatchable(orderCoreId))) return;
  if (await isDispatchHeldForManualAssignment(orderCoreId)) return;

  const sql = getSql();
  const existing = (await sql`
    SELECT id, current_wave, status
    FROM order_dispatch_sessions
    WHERE order_core_id = ${orderCoreId}
    LIMIT 1
  `) as Array<{ id: number; current_wave: number; status: string }>;

  if (existing[0]?.status === "active") {
    await executeDispatchWave(Number(existing[0].id));
    return;
  }

  if (existing[0]?.status === "cancelled" && (await isDispatchHeldForManualAssignment(orderCoreId))) {
    return;
  }

  if (existing[0]?.id) {
    if (await isOrderStillDispatchable(orderCoreId)) {
      await restartOrderDispatch(orderCoreId);
    }
    return;
  }

  const target = await loadDispatchOrderTarget(orderCoreId, 1);
  if (!target) return;

  const waveSettings = await fetchDispatchWaveSettings(target.serviceType);
  const nextWaveAt = waveSettings.enabled
    ? toTimestamptzParam(Date.now() + waveSettings.waveIntervalSeconds * 1000)
    : null;

  const inserted = (await sql`
    INSERT INTO order_dispatch_sessions (
      order_core_id,
      order_id,
      service_type,
      pickup_lat,
      pickup_lng,
      current_wave,
      status,
      last_wave_at,
      next_wave_at
    )
    VALUES (
      ${orderCoreId},
      ${target.orderId},
      ${target.serviceType},
      ${target.pickup.latitude},
      ${target.pickup.longitude},
      1,
      'active',
      NOW(),
      ${nextWaveAt}
    )
    ON CONFLICT (order_core_id) DO NOTHING
    RETURNING id
  `) as Array<{ id: number }>;

  const sessionId = Number(inserted[0]?.id);
  if (!sessionId) {
    const row = (await sql`
      SELECT id FROM order_dispatch_sessions WHERE order_core_id = ${orderCoreId} LIMIT 1
    `) as Array<{ id: number }>;
    if (row[0]?.id) await executeDispatchWave(Number(row[0].id));
    return;
  }

  await executeDispatchWave(sessionId);
}

/** Run the current wave: engine-filtered riders → push + socket. */
export async function executeDispatchWave(sessionId: number): Promise<{
  notified: number;
  eligible: number;
}> {
  const sql = getSql();
  const sessions = (await sql`
    SELECT id, order_core_id, service_type, current_wave, status
    FROM order_dispatch_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `) as Array<{
    id: number;
    order_core_id: number;
    service_type: string;
    current_wave: number;
    status: string;
  }>;

  const session = sessions[0];
  if (!session || session.status !== "active") {
    return { notified: 0, eligible: 0 };
  }

  const orderCoreId = Number(session.order_core_id);
  if (!(await isOrderStillDispatchable(orderCoreId))) {
    await completeOrderDispatch(orderCoreId, "expired");
    return { notified: 0, eligible: 0 };
  }
  if (await isDispatchHeldForManualAssignment(orderCoreId)) {
    await pauseOrderDispatchForManualAssignment(orderCoreId);
    return { notified: 0, eligible: 0 };
  }

  const waveNumber = Math.max(1, Number(session.current_wave) || 1);
  const target = await loadDispatchOrderTarget(orderCoreId, waveNumber);
  if (!target) return { notified: 0, eligible: 0 };

  const eligible = await listEligibleRidersForDispatchOrder(target);
  const toNotify = await filterNewlyEligibleRiders(sessionId, eligible);
  const notified = await notifyEligibleRidersDispatchOffer(target, toNotify);
  console.info(
    "[dispatch] wave_dispatched",
    JSON.stringify({
      orderId: target.orderId,
      serviceType: target.serviceType,
      waveNumber,
      configuredRadiusMeters: target.effectiveRadiusMeters,
      eligibleWithinRadius: eligible.length,
      newlyNotified: notified,
      alreadyNotifiedEarlierWaves: eligible.length - toNotify.length,
    })
  );
  await recordRiderNotifications(
    sessionId,
    waveNumber,
    toNotify.map((r) => r.riderId)
  );
  void recordDispatchEvent({
    orderCoreId,
    sessionId,
    serviceType: target.serviceType,
    eventType: "wave_dispatched",
    waveNumber,
    radiusMeters: target.effectiveRadiusMeters,
    metadata: { newlyNotified: notified, eligibleWithinRadius: eligible.length },
  });
  if (toNotify.length > 0) {
    await recordDispatchOffersSent({
      orderCoreId,
      orderId: target.orderId,
      serviceType: target.serviceType,
      dispatchSessionId: sessionId,
      waveNumber,
      dispatchRadiusMeters: target.effectiveRadiusMeters,
      riderIds: toNotify.map((r) => r.riderId),
    });
  }

  return { notified, eligible: eligible.length };
}

/** Advance to the next wave when interval elapses and no rider accepted. */
export async function advanceDispatchWave(sessionId: number): Promise<boolean> {
  const sql = getSql();
  const sessions = (await sql`
    SELECT id, order_core_id, service_type, current_wave, status, created_at
    FROM order_dispatch_sessions
    WHERE id = ${sessionId}
    LIMIT 1
  `) as Array<{
    id: number;
    order_core_id: number;
    service_type: string;
    current_wave: number;
    status: string;
    created_at: string | Date;
  }>;

  const session = sessions[0];
  if (!session || session.status !== "active") return false;

  const orderCoreId = Number(session.order_core_id);
  if (!(await isOrderStillDispatchable(orderCoreId))) {
    await completeOrderDispatch(orderCoreId, "expired");
    return false;
  }
  if (await isDispatchHeldForManualAssignment(orderCoreId)) {
    await pauseOrderDispatchForManualAssignment(orderCoreId);
    return false;
  }

  const serviceType = normalizeOrderServiceType(session.service_type);
  if (!serviceType) return false;

  const currentWave = Math.max(1, Number(session.current_wave) || 1);
  const canExpand = await hasNextDispatchWave(serviceType, currentWave);
  if (!canExpand) {
    // Phase 5: unified auto-retry. Food/parcel — once the last wave is exhausted with
    // no accept, restart from wave 1 after retry_interval_seconds and keep re-offering
    // until max_retry_duration_seconds elapses (from the dispatch session start), then
    // stop. Non-destructive: it only re-offers (clears the per-session notification
    // dedup so idle riders can be offered again). Ride keeps its own search-timeout /
    // tip-boost flow and is never retried here.
    if (serviceType !== "person_ride") {
      const { fetchDispatchStrategyConfig } = await import("./dispatch-strategy-config.js");
      const cfg = await fetchDispatchStrategyConfig(serviceType).catch(() => null);
      const createdAtMs = session.created_at ? new Date(session.created_at).getTime() : Date.now();
      const elapsedSec = Math.max(0, (Date.now() - createdAtMs) / 1000);
      if (cfg && cfg.maxRetryDurationSeconds > 0 && elapsedSec < cfg.maxRetryDurationSeconds) {
        const retryAt = toTimestamptzParam(Date.now() + cfg.retryIntervalSeconds * 1000);
        await sql`
          UPDATE order_dispatch_sessions
          SET current_wave = 1, last_wave_at = NOW(), next_wave_at = ${retryAt}, updated_at = NOW()
          WHERE id = ${sessionId}
        `;
        await sql`
          DELETE FROM order_dispatch_rider_notifications WHERE session_id = ${sessionId}
        `;
        console.info(
          "[dispatch] retry_cycle_scheduled",
          JSON.stringify({
            orderCoreId,
            serviceType,
            elapsedSec: Math.round(elapsedSec),
            retryIntervalSeconds: cfg.retryIntervalSeconds,
            maxRetryDurationSeconds: cfg.maxRetryDurationSeconds,
          })
        );
        void recordDispatchEvent({
          orderCoreId,
          sessionId,
          serviceType,
          eventType: "retry_scheduled",
          metadata: {
            elapsedSec: Math.round(elapsedSec),
            retryIntervalSeconds: cfg.retryIntervalSeconds,
          },
        });
        return true;
      }
    }
    await sql`
      UPDATE order_dispatch_sessions
      SET next_wave_at = NULL, updated_at = NOW()
      WHERE id = ${sessionId}
    `;
    console.info(
      "[dispatch] dispatch_exhausted",
      JSON.stringify({ orderCoreId, serviceType })
    );
    void recordDispatchEvent({
      orderCoreId,
      sessionId,
      serviceType,
      eventType: "dispatch_exhausted",
      waveNumber: currentWave,
    });
    return false;
  }

  const nextWave = currentWave + 1;
  const waveSettings = await fetchDispatchWaveSettings(serviceType);
  const nextWaveAt = toTimestamptzParam(Date.now() + waveSettings.waveIntervalSeconds * 1000);

  await sql`
    UPDATE order_dispatch_sessions
    SET
      current_wave = ${nextWave},
      last_wave_at = NOW(),
      next_wave_at = ${nextWaveAt},
      updated_at = NOW()
    WHERE id = ${sessionId}
  `;

  // Wave expansion audit — all values sourced live from Super Admin config.
  const [prevRadius, nextRadius] = await Promise.all([
    fetchEffectiveDispatchRadiusMeters(serviceType, currentWave).catch(() => null),
    fetchEffectiveDispatchRadiusMeters(serviceType, nextWave).catch(() => null),
  ]);
  console.info(
    "[dispatch] wave_expanded",
    JSON.stringify({
      orderCoreId,
      serviceType,
      fromWave: currentWave,
      toWave: nextWave,
      fromRadiusMeters: prevRadius,
      toRadiusMeters: nextRadius,
      waitSecondsUntilNextWave: waveSettings.waveIntervalSeconds,
      maxWaves: waveSettings.maxWaves,
    })
  );
  void recordDispatchEvent({
    orderCoreId,
    sessionId,
    serviceType,
    eventType: "wave_expanded",
    waveNumber: nextWave,
    radiusMeters: nextRadius,
    metadata: { fromWave: currentWave, toWave: nextWave, fromRadiusMeters: prevRadius },
  });

  await executeDispatchWave(sessionId);
  return true;
}

/** Restart rider matching after unassign — reactivates dispatch session and re-runs wave 1. */
export async function restartOrderDispatch(orderCoreId: number): Promise<boolean> {
  if (!(await isOrderStillDispatchable(orderCoreId))) return false;
  await setOrderDispatchManualHold(orderCoreId, false);

  const sql = getSql();
  const target = await loadDispatchOrderTarget(orderCoreId, 1);
  if (!target) return false;

  const waveSettings = await fetchDispatchWaveSettings(target.serviceType);
  const nextWaveAt = waveSettings.enabled
    ? toTimestamptzParam(Date.now() + waveSettings.waveIntervalSeconds * 1000)
    : null;

  const reactivated = (await sql`
    UPDATE order_dispatch_sessions
    SET
      status = 'active',
      current_wave = 1,
      last_wave_at = NOW(),
      next_wave_at = ${nextWaveAt},
      completed_at = NULL,
      updated_at = NOW()
    WHERE order_core_id = ${orderCoreId}
    RETURNING id
  `) as Array<{ id: number }>;

  const sessionId = Number(reactivated[0]?.id);
  if (sessionId) {
    await sql`
      DELETE FROM order_dispatch_rider_notifications
      WHERE session_id = ${sessionId}
    `;
    await executeDispatchWave(sessionId);
    return true;
  }

  await startOrderDispatch(orderCoreId);
  return true;
}

/** Convenience entry when only order core id is known after status transition. */
export async function maybeStartOrderDispatch(orderCoreId: number): Promise<void> {
  try {
    await startOrderDispatch(orderCoreId);
    const eligible = await countEligibleRidersForOrder(orderCoreId).catch(() => -1);
    console.info("[dispatch] wave1 started", { orderCoreId, eligibleRiders: eligible });
  } catch (err) {
    console.warn(
      "[dispatch] maybeStartOrderDispatch failed (tolerated)",
      { orderCoreId, message: (err as Error).message, stack: (err as Error).stack }
    );
  }
}

/** Process due expansion waves — called from backend tick. */
export async function processDueDispatchWaves(limit = 25): Promise<number> {
  const sql = getSql();
  const due = (await sql`
    SELECT id
    FROM order_dispatch_sessions
    WHERE status = 'active'
      AND next_wave_at IS NOT NULL
      AND next_wave_at <= NOW()
    ORDER BY next_wave_at ASC
    LIMIT ${limit}
  `) as Array<{ id: number }>;

  let processed = 0;
  for (const row of due ?? []) {
    const sessionId = Number(row.id);
    if (!sessionId) continue;
    await advanceDispatchWave(sessionId);
    processed += 1;
  }
  return processed;
}

/** Eligible rider count at a wave — does not require an active dispatch session. */
export async function countEligibleRidersForOrderAtWave(
  orderCoreId: number,
  waveNumber = 1
): Promise<number> {
  const wave = Math.max(1, waveNumber);
  const target = await loadDispatchOrderTarget(orderCoreId, wave);
  if (!target) return 0;
  const eligible = await listEligibleRidersForDispatchOrder(target);
  return eligible.length;
}

/** Audit helper — eligible rider count for an order at current wave. */
export async function countEligibleRidersForOrder(orderCoreId: number): Promise<number> {
  const sql = getSql();
  const sessions = (await sql`
    SELECT current_wave, service_type
    FROM order_dispatch_sessions
    WHERE order_core_id = ${orderCoreId}
      AND status = 'active'
    LIMIT 1
  `) as Array<{ current_wave: number; service_type: string }>;

  const wave = Math.max(1, Number(sessions[0]?.current_wave) || 1);
  return countEligibleRidersForOrderAtWave(orderCoreId, wave);
}
