/**
 * Geo engine (Phase 3, migration 0473).
 *
 * Runs entirely in the BACKEND for accuracy — the mobile app only streams
 * coordinates. On each stored fix it evaluates the rider's movement against the
 * Super-Admin thresholds and emits tracking events + VIOLATIONS for:
 *   • no-movement (long stop)      — stationary beyond stationary_timeout_seconds
 *   • opposite-direction           — drifting away from the current target
 *   • route-deviation              — off the expected route polyline (when known)
 *
 * It NEVER deducts penalties. Violations are the modular interface consumed by
 * the penalty engine / admin review (Violation → Penalty → Admin → Wallet →
 * Activity). Per-signal dedup + escalation levels avoid spamming. All running
 * state lives in tracking_sessions.geo_state (jsonb). Never throws.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore, deliveryAssignments, trackingSessions, trackingViolations } from "../db/schema.js";
import { haversineDistanceMeters } from "./order-assignment-engine.js";
import { getTrackingConfig } from "./tracking-config.service.js";
import { recordTrackingEvent, type TrackingEventType } from "./tracking-event.service.js";

interface GeoState {
  lastMovedLat?: number;
  lastMovedLng?: number;
  lastMovedAtMs?: number;
  targetPhase?: "pickup" | "drop";
  minTargetDistM?: number;
  lastLongStopAtMs?: number;
  lastDeviationAtMs?: number;
  lastWrongDirAtMs?: number;
  longStopLevel?: number;
  deviationLevel?: number;
  wrongDirLevel?: number;
}

type OrderGeoStatic = {
  status: string;
  currentStatus: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  polyline: string | null;
  at: number;
};

// Static order geo (coords + polyline) rarely change; short cache to bound the
// per-ping query cost. Phase is derived from a status that we refresh ≤30s.
const orderGeoCache = new Map<string, OrderGeoStatic>();
const ORDER_GEO_TTL_MS = 30_000;
// Re-raise the same signal at most once per this window (also drives escalation).
const RESIGNAL_WINDOW_MS = 120_000;

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Whether the rider has picked up → measure against the DROP target. */
function isPickedUp(status: string, currentStatus: string): boolean {
  const s = `${status} ${currentStatus}`.toLowerCase();
  return (
    s.includes("picked_up") ||
    s.includes("out_for_delivery") ||
    s.includes("in_transit") ||
    s.includes("on_the_way") ||
    s.includes("started") ||
    s.includes("ride_started")
  );
}

async function loadOrderGeo(orderId: string, riderId: number): Promise<OrderGeoStatic | null> {
  const cached = orderGeoCache.get(orderId);
  if (cached && Date.now() - cached.at < ORDER_GEO_TTL_MS) return cached;
  const db = getDb();
  const [o] = await db
    .select({
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      pickupLat: ordersCore.pickupLat,
      pickupLon: ordersCore.pickupLon,
      dropLat: ordersCore.dropLat,
      dropLon: ordersCore.dropLon,
    })
    .from(ordersCore)
    .where(eq(ordersCore.orderId, orderId))
    .limit(1);
  if (!o) return null;
  let polyline: string | null = null;
  try {
    const [a] = await db
      .select({ route: deliveryAssignments.routePolyline })
      .from(deliveryAssignments)
      .where(eq(deliveryAssignments.orderId, orderId))
      .limit(1);
    polyline = a?.route ?? null;
  } catch {
    polyline = null;
  }
  const value: OrderGeoStatic = {
    status: String(o.status ?? ""),
    currentStatus: String(o.currentStatus ?? ""),
    pickupLat: num(o.pickupLat),
    pickupLng: num(o.pickupLon),
    dropLat: num(o.dropLat),
    dropLng: num(o.dropLon),
    polyline,
    at: Date.now(),
  };
  orderGeoCache.set(orderId, value);
  return value;
}

/** Decode a Google/Mapbox-encoded polyline (precision 5 or 6). Returns [] on failure. */
function decodePolyline(encoded: string, precision = 5): Array<[number, number]> {
  try {
    const factor = Math.pow(10, precision);
    const coords: Array<[number, number]> = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    while (index < encoded.length) {
      let result = 0;
      let shift = 0;
      let b: number;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;
      result = 0;
      shift = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;
      coords.push([lat / factor, lng / factor]);
    }
    return coords;
  } catch {
    return [];
  }
}

/** Min distance (m) from a point to a polyline (nearest vertex approximation). */
function distanceToPolylineMeters(lat: number, lng: number, points: Array<[number, number]>): number | null {
  if (points.length < 2) return null;
  let min = Infinity;
  for (const [plat, plng] of points) {
    const d = haversineDistanceMeters(lat, lng, plat, plng);
    if (d < min) min = d;
  }
  return Number.isFinite(min) ? min : null;
}

export interface GeoSignalInput {
  orderId: string;
  orderSource?: string;
  riderId: number;
  sessionId: number;
  assignmentId?: number | null;
  serviceType?: string | null;
  latitude: number;
  longitude: number;
  recordedAt?: Date;
}

async function raiseSignal(
  input: GeoSignalInput,
  args: {
    eventType: TrackingEventType;
    violationType: "long_stop" | "route_deviation" | "opposite_direction";
    level: number;
    distanceM?: number;
    durationSeconds?: number;
    message: string;
  }
): Promise<void> {
  await recordTrackingEvent({
    orderId: input.orderId,
    orderSource: input.orderSource,
    riderId: input.riderId,
    sessionId: input.sessionId,
    assignmentId: input.assignmentId ?? null,
    serviceType: input.serviceType,
    eventType: args.eventType,
    severity: "violation",
    latitude: input.latitude,
    longitude: input.longitude,
    distanceM: args.distanceM ?? null,
    message: args.message,
    metadata: { level: args.level },
  });
  try {
    await getDb().insert(trackingViolations).values({
      orderId: input.orderId,
      orderSource: input.orderSource ?? "orders_core",
      riderId: input.riderId,
      sessionId: input.sessionId,
      assignmentId: input.assignmentId ?? null,
      serviceType: input.serviceType ?? null,
      violationType: args.violationType,
      level: args.level,
      status: "open",
      distanceM: args.distanceM ?? null,
      durationSeconds: args.durationSeconds ?? null,
      latitude: input.latitude.toFixed(7),
      longitude: input.longitude.toFixed(7),
      message: args.message,
      metadata: {},
    });
  } catch {
    /* best-effort — never break the ingestion path */
  }
}

/**
 * Evaluate one coordinate against the geo rules. Loads + persists the session's
 * geo_state. Best-effort — a failure here never affects ingestion.
 */
export async function evaluateGeoSignals(input: GeoSignalInput): Promise<void> {
  try {
    const cfg = await getTrackingConfig();
    if (!cfg.enableStationaryRule && !cfg.enableDeviationRule && !cfg.enableWrongDirectionRule) {
      return;
    }
    const db = getDb();
    const [row] = await db
      .select({ geoState: trackingSessions.geoState })
      .from(trackingSessions)
      .where(eq(trackingSessions.id, input.sessionId))
      .limit(1);
    if (!row) return;

    const state: GeoState = (row.geoState as GeoState) ?? {};
    const nowMs = (input.recordedAt ?? new Date()).getTime();
    const { latitude: lat, longitude: lng } = input;

    // ── No-movement (long stop) ──────────────────────────────────────────
    if (cfg.enableStationaryRule) {
      if (state.lastMovedLat == null || state.lastMovedLng == null || state.lastMovedAtMs == null) {
        state.lastMovedLat = lat;
        state.lastMovedLng = lng;
        state.lastMovedAtMs = nowMs;
      } else {
        const moved = haversineDistanceMeters(lat, lng, state.lastMovedLat, state.lastMovedLng);
        if (moved > cfg.movementThresholdM) {
          state.lastMovedLat = lat;
          state.lastMovedLng = lng;
          state.lastMovedAtMs = nowMs;
          state.lastLongStopAtMs = undefined; // moving again — reset
        } else {
          const stationaryMs = nowMs - state.lastMovedAtMs;
          const dueForSignal =
            !state.lastLongStopAtMs || nowMs - state.lastLongStopAtMs > cfg.stationaryTimeoutSeconds * 1000;
          if (stationaryMs > cfg.stationaryTimeoutSeconds * 1000 && dueForSignal) {
            state.longStopLevel = (state.longStopLevel ?? 0) + 1;
            state.lastLongStopAtMs = nowMs;
            await raiseSignal(input, {
              eventType: "long_stop",
              violationType: "long_stop",
              level: state.longStopLevel,
              durationSeconds: Math.round(stationaryMs / 1000),
              message: `No movement for ${Math.round(stationaryMs / 1000)}s`,
            });
          }
        }
      }
    }

    // ── Target-based signals (opposite-direction / deviation) ────────────
    if (cfg.enableWrongDirectionRule || cfg.enableDeviationRule) {
      const order = await loadOrderGeo(input.orderId, input.riderId);
      if (order) {
        const phase: "pickup" | "drop" = isPickedUp(order.status, order.currentStatus) ? "drop" : "pickup";
        if (state.targetPhase !== phase) {
          state.targetPhase = phase;
          state.minTargetDistM = undefined; // new target — start fresh
        }
        const targetLat = phase === "pickup" ? order.pickupLat : order.dropLat;
        const targetLng = phase === "pickup" ? order.pickupLng : order.dropLng;

        // Opposite-direction: drifting away from the closest approach so far.
        if (cfg.enableWrongDirectionRule && targetLat != null && targetLng != null) {
          const dToTarget = haversineDistanceMeters(lat, lng, targetLat, targetLng);
          if (state.minTargetDistM == null || dToTarget < state.minTargetDistM) {
            state.minTargetDistM = dToTarget;
          } else {
            const drift = dToTarget - state.minTargetDistM;
            const due = !state.lastWrongDirAtMs || nowMs - state.lastWrongDirAtMs > RESIGNAL_WINDOW_MS;
            if (drift > cfg.wrongDirectionThresholdM && due) {
              state.wrongDirLevel = (state.wrongDirLevel ?? 0) + 1;
              state.lastWrongDirAtMs = nowMs;
              await raiseSignal(input, {
                eventType: "opposite_direction",
                violationType: "opposite_direction",
                level: state.wrongDirLevel,
                distanceM: Math.round(drift),
                message: `Moving away from ${phase}: +${Math.round(drift)}m from closest approach`,
              });
            }
          }
        }

        // Route-deviation: only when an expected route polyline is available.
        if (cfg.enableDeviationRule && order.polyline) {
          const pts = decodePolyline(order.polyline, 5);
          const usePts = pts.length >= 2 ? pts : decodePolyline(order.polyline, 6);
          const offRoute = distanceToPolylineMeters(lat, lng, usePts);
          if (offRoute != null && offRoute > cfg.deviationDistanceM) {
            const due = !state.lastDeviationAtMs || nowMs - state.lastDeviationAtMs > RESIGNAL_WINDOW_MS;
            if (due) {
              state.deviationLevel = (state.deviationLevel ?? 0) + 1;
              state.lastDeviationAtMs = nowMs;
              await raiseSignal(input, {
                eventType: "route_deviation",
                violationType: "route_deviation",
                level: state.deviationLevel,
                distanceM: Math.round(offRoute),
                message: `Off expected route by ${Math.round(offRoute)}m`,
              });
            }
          }
        }
      }
    }

    // Persist updated running state.
    await db
      .update(trackingSessions)
      .set({ geoState: state, updatedAt: new Date() })
      .where(eq(trackingSessions.id, input.sessionId));
  } catch {
    // Best-effort: the geo engine must never break the ingestion path.
  }
}
