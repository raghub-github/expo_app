import { and, desc, eq, inArray } from "drizzle-orm";
import { ulid } from "ulid";
import { incrCounter } from "@gatimitra/logger";
import { getDb } from "../db/client.js";
import { ordersCore, orderRiderTracking, riderLocationEvents } from "../db/schema.js";
import { getEnv } from "../config/env.js";
import {
  rememberRiderLocationPing,
  readRiderLocationPingState,
  shouldPersistRiderLocationEvent,
} from "./rider-location-event-sampling.js";
import { upsertRiderCurrentLocation, speedMpsToKmh } from "./rider-current-location.js";
import { scoreLocationPing, type LocationPoint } from "../modules/rider/fraud.js";

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
  const prevForFraud = cached?.lastPing ?? (await loadPersistedPointFromDb(input.userId, input.deviceId));
  const prevPersisted =
    cached?.lastPersisted ?? (await loadPersistedPointFromDb(input.userId, input.deviceId));

  const { fraudSignals, fraudScore, meta } = scoreLocationPing({
    prev: prevForFraud,
    curr,
    tokenDeviceId: input.tokenDeviceId,
    bodyDeviceId: input.deviceId,
    gpsEnabled: null,
  });

  let hasActiveOrder = false;
  if (riderId != null) {
    const [activeOrder] = await db
      .select({ orderId: ordersCore.orderId })
      .from(ordersCore)
      .where(
        and(
          eq(ordersCore.riderId, riderId),
          inArray(ordersCore.status, [...ACTIVE_ORDER_STATUSES])
        )
      )
      .orderBy(desc(ordersCore.updatedAt))
      .limit(1);
    hasActiveOrder = Boolean(activeOrder?.orderId?.trim());
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
  }

  rememberRiderLocationPing(input.userId, input.deviceId, curr, persistDecision.persist);
  notePingMetrics({
    userId: input.userId,
    deviceId: input.deviceId,
    trackingMode,
    eventPersisted: persistDecision.persist,
    cached,
  });

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

    if (hasActiveOrder) {
      const [activeRide] = await db
        .select({ orderId: ordersCore.orderId })
        .from(ordersCore)
        .where(
          and(
            eq(ordersCore.riderId, riderId),
            inArray(ordersCore.status, [...ACTIVE_ORDER_STATUSES])
          )
        )
        .orderBy(desc(ordersCore.updatedAt))
        .limit(1);

      const activeOrderId = activeRide?.orderId?.trim();
      if (activeOrderId) {
        const now = new Date();
        await db.insert(orderRiderTracking).values({
          orderId: activeOrderId,
          orderSource: "orders_core",
          riderId,
          latitude: String(input.lat),
          longitude: String(input.lng),
          headingDegrees: input.headingDeg != null ? String(input.headingDeg) : null,
          speedKmh: input.speedMps != null ? String(speedMpsToKmh(input.speedMps)) : null,
          accuracyMeters: input.accuracyM != null ? String(input.accuracyM) : null,
          createdAt: now,
        });
      }
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
