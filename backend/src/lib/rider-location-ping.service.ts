import { and, desc, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { incrCounter } from "@gatimitra/logger";
import { getDb } from "../db/client.js";
import { ordersCore, orderRiderTracking, riderLocationEvents } from "../db/schema.js";
import {
  recordCoordinateForActiveOrder,
  stopInactiveSessionsForRider,
} from "./tracking-session.service.js";
import { evaluateGeoSignals } from "./tracking-geo-engine.service.js";
import { getEnv } from "../config/env.js";
import {
  rememberRiderLocationPing,
  readRiderLocationPingState,
  shouldPersistRiderLocationEvent,
} from "./rider-location-event-sampling.js";
import { upsertRiderCurrentLocation, speedMpsToKmh } from "./rider-current-location.js";
import { scoreLocationPing, type LocationPoint } from "../modules/rider/fraud.js";
import { publishOrderEvent, publishRiderEvent } from "../modules/realtime/publish.js";

export type RiderLocationPingInput = {
  userId: string;
  deviceId: string;
  tokenDeviceId: string | null;
  tsMs: number;
  lat: number;
  lng: number;
  accuracyM?: number | null;
  altitudeM?: number | null;
  speedMps?: number | null;
  headingDeg?: number | null;
  mocked?: boolean;
  provider?: string;
};

export type RiderLocationTrackingMode =
  | "idle"
  | "moving"
  | "active_order"
  | "high_speed";

export type RiderLocationPingResult = {
  accepted: true;
  serverTsMs: number;
  fraudSignals: ReturnType<typeof scoreLocationPing>["fraudSignals"];
  fraudScore: number;
  eventPersisted: boolean;
  recommendedPingIntervalMs: number;
  trackingMode: RiderLocationTrackingMode;
};

const ACTIVE_ORDER_STATUSES = [
  "assigned",
  "accepted",
  "reached_store",
  "reached_user",
  "picked_up",
  "in_transit",
] as const;

const PING_INTERVAL_MS: Record<RiderLocationTrackingMode, number> = {
  idle: 30_000,
  moving: 10_000,
  active_order: 5_000,
  high_speed: 3_000,
};

const EXCESSIVE_PING_THRESHOLD_MS = 2_000;

function toLocationPoint(input: RiderLocationPingInput): LocationPoint {
  return {
    tsMs: input.tsMs,
    lat: input.lat,
    lng: input.lng,
    accuracyM: input.accuracyM ?? null,
    speedMps: input.speedMps ?? null,
    headingDeg: input.headingDeg ?? null,
    mocked: input.mocked ?? null,
  };
}

async function loadPersistedPointFromDb(
  userId: string,
  deviceId: string
): Promise<LocationPoint | null> {
  try {
    const db = getDb();
    const [row] = await db
      .select({
        tsMs: riderLocationEvents.tsMs,
        lat: riderLocationEvents.lat,
        lng: riderLocationEvents.lng,
        accuracyM: riderLocationEvents.accuracyM,
        speedMps: riderLocationEvents.speedMps,
        headingDeg: riderLocationEvents.headingDeg,
        mocked: riderLocationEvents.mocked,
      })
      .from(riderLocationEvents)
      .where(and(eq(riderLocationEvents.userId, userId), eq(riderLocationEvents.deviceId, deviceId)))
      .orderBy(desc(riderLocationEvents.tsMs))
      .limit(1);

    if (!row) return null;

    return {
      tsMs: row.tsMs,
      lat: row.lat,
      lng: row.lng,
      accuracyM: row.accuracyM ?? null,
      speedMps: row.speedMps ?? null,
      headingDeg: row.headingDeg ?? null,
      mocked: row.mocked ?? null,
    };
  } catch (err) {
    const cause = err && typeof err === "object" && "cause" in err ? (err as { cause?: unknown }).cause : null;
    console.warn("[rider-location] history lookup failed (ping continues)", {
      userId,
      deviceId,
      message: err instanceof Error ? err.message : String(err),
      cause: cause instanceof Error ? cause.message : cause,
    });
    return null;
  }
}

function resolveTrackingMode(args: {
  hasActiveOrder: boolean;
  speedMps: number | null | undefined;
  prevPing: LocationPoint | null;
  curr: LocationPoint;
}): RiderLocationTrackingMode {
  const highSpeedThreshold = getEnv().RIDER_LOCATION_HIGH_SPEED_MPS;
  const speed = args.speedMps ?? args.curr.speedMps ?? null;
  if (speed != null && speed >= highSpeedThreshold) {
    return "high_speed";
  }
  if (args.hasActiveOrder) {
    return "active_order";
  }
  if (args.prevPing) {
    const moved =
      Math.abs(args.curr.lat - args.prevPing.lat) > 0.00005 ||
      Math.abs(args.curr.lng - args.prevPing.lng) > 0.00005;
    if (moved || (speed != null && speed > 1.5)) {
      return "moving";
    }
  } else if (speed != null && speed > 1.5) {
    return "moving";
  }
  return "idle";
}

function notePingMetrics(args: {
  userId: string;
  deviceId: string;
  trackingMode: RiderLocationTrackingMode;
  eventPersisted: boolean;
  cached: ReturnType<typeof readRiderLocationPingState>;
}): void {
  incrCounter(
    "rider_location_pings_total",
    "Rider GPS pings accepted by tracking mode",
    1,
    { mode: args.trackingMode }
  );

  if (args.eventPersisted) {
    incrCounter("rider_location_events_persisted_total", "Sampled rider_location_events inserts");
  } else {
    incrCounter("rider_location_events_sampled_out_total", "Rider pings skipped for audit insert");
  }

  const prevAt = args.cached?.lastPingReceivedAtMs;
  if (prevAt != null) {
    const gapMs = Date.now() - prevAt;
    if (gapMs < EXCESSIVE_PING_THRESHOLD_MS) {
      incrCounter(
        "rider_location_excessive_pings_total",
        "Rider GPS pings faster than 2s (possible client misconfiguration)"
      );
      console.warn("[rider-location] excessive ping rate", {
        userId: args.userId,
        deviceId: args.deviceId,
        gapMs,
      });
    }
  }
}

export async function handleRiderLocationPing(
  input: RiderLocationPingInput,
  riderId: number | null
): Promise<RiderLocationPingResult> {
  const db = getDb();
  const curr = toLocationPoint(input);
  const cached = readRiderLocationPingState(input.userId, input.deviceId);
  let prevForFraud = cached?.lastPing ?? null;
  let prevPersisted = cached?.lastPersisted ?? null;
  if (!prevForFraud || !prevPersisted) {
    const fromDb = await loadPersistedPointFromDb(input.userId, input.deviceId);
    prevForFraud = prevForFraud ?? fromDb;
    prevPersisted = prevPersisted ?? fromDb;
  }

  const { fraudSignals, fraudScore, meta } = scoreLocationPing({
    prev: prevForFraud,
    curr,
    tokenDeviceId: input.tokenDeviceId,
    bodyDeviceId: input.deviceId,
    gpsEnabled: null,
  });

  let hasActiveOrder = false;
  let activeOrdersForRider: Array<{ orderId: string | null; formattedOrderId: string | null }> =
    [];
  if (riderId != null) {
    activeOrdersForRider = await db
      .select({
        orderId: ordersCore.orderId,
        formattedOrderId: ordersCore.formattedOrderId,
      })
      .from(ordersCore)
      .where(
        and(
          eq(ordersCore.riderId, riderId),
          inArray(ordersCore.status, [...ACTIVE_ORDER_STATUSES])
        )
      )
      .orderBy(desc(ordersCore.updatedAt))
      .limit(10);
    hasActiveOrder = activeOrdersForRider.some((o) => Boolean(o.orderId?.trim()));
  }

  const trackingMode = resolveTrackingMode({
    hasActiveOrder,
    speedMps: input.speedMps,
    prevPing: prevForFraud,
    curr,
  });

  const persistDecision = shouldPersistRiderLocationEvent({
    prevPersisted,
    curr,
    fraudScore,
    fraudSignals,
  });

  if (persistDecision.persist) {
    try {
      await db.insert(riderLocationEvents).values({
        id: `rloc_${ulid()}`,
        userId: input.userId,
        deviceId: input.deviceId,
        tsMs: input.tsMs,
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM ?? null,
        altitudeM: input.altitudeM ?? null,
        speedMps: input.speedMps ?? null,
        headingDeg: input.headingDeg ?? null,
        mocked: input.mocked ?? false,
        provider: input.provider ?? "unknown",
        fraudScore,
        fraudSignals,
        meta: {
          ...meta,
          persistReason: persistDecision.reason,
          businessEvent: persistDecision.businessEvent ?? null,
          trackingMode,
        },
      });
    } catch (err) {
      const cause = err && typeof err === "object" && "cause" in err ? (err as { cause?: unknown }).cause : null;
      console.warn("[rider-location] history insert failed (ping continues)", {
        userId: input.userId,
        deviceId: input.deviceId,
        message: err instanceof Error ? err.message : String(err),
        cause: cause instanceof Error ? cause.message : cause,
      });
    }
  }

  rememberRiderLocationPing(input.userId, input.deviceId, curr, persistDecision.persist);
  notePingMetrics({
    userId: input.userId,
    deviceId: input.deviceId,
    trackingMode,
    eventPersisted: persistDecision.persist,
    cached,
  });

  // Genuinely suspicious signals: never trust this fix for anything, including the
  // rider's own availability record.
  const blockLocationWrite =
    fraudSignals.includes("TELEPORT") ||
    fraudSignals.includes("UNREALISTIC_SPEED") ||
    fraudSignals.includes("MOCK_LOCATION");
  // LOW_ACCURACY (common on a cold GPS fix) is merely imprecise, not fraudulent — it
  // still updates rider_current_locations (dispatch/availability only cares about
  // freshness, not precision, so a low-accuracy-but-recent fix beats a stale-but-precise
  // one), but is still kept off customer/merchant live maps and the permanent
  // delivery-route trail, same as the three genuinely suspicious signals.
  const suppressLiveBroadcast = blockLocationWrite || fraudSignals.includes("LOW_ACCURACY");
  if (blockLocationWrite) {
    return {
      accepted: true,
      serverTsMs: Date.now(),
      fraudSignals,
      fraudScore,
      eventPersisted: persistDecision.persist,
      recommendedPingIntervalMs: PING_INTERVAL_MS[trackingMode],
      trackingMode,
    };
  }

  if (riderId != null) {
    await upsertRiderCurrentLocation(db, {
      userId: input.userId,
      riderId,
      deviceId: input.deviceId,
      lat: input.lat,
      lng: input.lng,
      speedMps: input.speedMps ?? null,
      headingDeg: input.headingDeg ?? null,
      accuracyM: input.accuracyM ?? null,
    });

    // Safety-net: close any tracking session whose order has left the rider's
    // active set (delivered/cancelled/unassigned/expired). Fire-and-forget so a
    // failure never affects the ping response or the coordinate insert.
    void stopInactiveSessionsForRider({
      riderId,
      activeOrderIds: activeOrdersForRider
        .map((r) => r.orderId?.trim())
        .filter((id): id is string => Boolean(id)),
    }).catch(() => {});

    if (suppressLiveBroadcast) {
      return {
        accepted: true,
        serverTsMs: Date.now(),
        fraudSignals,
        fraudScore,
        eventPersisted: persistDecision.persist,
        recommendedPingIntervalMs: PING_INTERVAL_MS[trackingMode],
        trackingMode,
      };
    }

    const channelIds = new Set<string>();
    for (const row of activeOrdersForRider) {
      const oid = row.orderId?.trim();
      const fid = row.formattedOrderId?.trim();
      // Publish both raw and uppercase so ticket mint (A-Z normalized) always matches.
      if (oid) {
        channelIds.add(oid);
        channelIds.add(oid.toUpperCase());
      }
      if (fid) {
        channelIds.add(fid);
        channelIds.add(fid.toUpperCase());
      }
    }

    if (hasActiveOrder && channelIds.size > 0) {
      const now = new Date();
      const trailOrderIds = Array.from(
        new Set(
          activeOrdersForRider
            .map((r) => r.orderId?.trim())
            .filter((id): id is string => Boolean(id))
        )
      );
      if (trailOrderIds.length > 0) {
        const rows = await Promise.all(
          trailOrderIds.map(async (activeOrderId) => {
            // Lazy-start / attach the INDEPENDENT per-assignment tracking session
            // and claim a gap-free sequence, so every coordinate is linkable for
            // immutable history + future replay (Phase 1). Never blocks the
            // coordinate insert — a resolve failure just leaves the link null.
            const session = await recordCoordinateForActiveOrder({
              orderId: activeOrderId,
              riderId,
              latitude: input.lat,
              longitude: input.lng,
              recordedAt: now,
            }).catch(() => null);
            if (session) {
              // Backend geo engine: no-movement / opposite-direction / route-
              // deviation → events + violations. Fire-and-forget; never blocks.
              void evaluateGeoSignals({
                orderId: activeOrderId,
                riderId,
                sessionId: session.sessionId,
                assignmentId: session.assignmentId,
                serviceType: session.serviceType,
                latitude: input.lat,
                longitude: input.lng,
                recordedAt: now,
              }).catch(() => {});
            }
            return {
              orderId: activeOrderId,
              orderSource: "orders_core" as const,
              riderId,
              latitude: String(input.lat),
              longitude: String(input.lng),
              headingDegrees: input.headingDeg != null ? String(input.headingDeg) : null,
              speedKmh: input.speedMps != null ? String(speedMpsToKmh(input.speedMps)) : null,
              accuracyMeters: input.accuracyM != null ? String(input.accuracyM) : null,
              sessionId: session?.sessionId ?? null,
              assignmentId: session?.assignmentId ?? null,
              serviceType: session?.serviceType ?? null,
              sequenceNumber: session?.sequenceNumber ?? null,
              source: "gps" as const,
              createdAt: now,
            };
          })
        );
        await db.insert(orderRiderTracking).values(rows).catch((err) => {
          console.warn("[rider-location] order trail insert failed (ping continues)", {
            riderId,
            message: err instanceof Error ? err.message : String(err),
          });
        });
      }

      const locationEvent = {
        type: "rider.location.updated.v1",
        riderId,
        lat: input.lat,
        lng: input.lng,
        headingDegrees: input.headingDeg ?? null,
        accuracyMeters: input.accuracyM ?? null,
        speedMps: input.speedMps ?? null,
        updatedAt: now.toISOString(),
      };

      void publishRiderEvent(riderId, locationEvent).catch(() => {});
      for (const orderIdText of channelIds) {
        void publishOrderEvent(orderIdText, {
          ...locationEvent,
          orderIdText,
          orderId: orderIdText,
        }).catch(() => {});
      }
    } else {
      void publishRiderEvent(riderId, {
        type: "rider.location.updated.v1",
        riderId,
        lat: input.lat,
        lng: input.lng,
        headingDegrees: input.headingDeg ?? null,
        accuracyMeters: input.accuracyM ?? null,
        speedMps: input.speedMps ?? null,
        updatedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  return {
    accepted: true,
    serverTsMs: Date.now(),
    fraudSignals,
    fraudScore,
    eventPersisted: persistDecision.persist,
    recommendedPingIntervalMs: PING_INTERVAL_MS[trackingMode],
    trackingMode,
  };
}

export { PING_INTERVAL_MS };
