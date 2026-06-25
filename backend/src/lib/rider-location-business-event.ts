import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../db/client.js";
import { riderCurrentLocations, riderLocationEvents } from "../db/schema.js";
import {
  rememberRiderLocationPing,
  type RiderLocationBusinessEvent,
} from "./rider-location-event-sampling.js";
import type { LocationPoint } from "../modules/rider/fraud.js";

export type RecordRiderLocationBusinessEventInput = {
  riderId: number;
  userId?: string;
  deviceId?: string | null;
  businessEvent: RiderLocationBusinessEvent;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  speedMps?: number | null;
  headingDeg?: number | null;
  orderId?: string | null;
  metadata?: Record<string, unknown>;
};

function riderUserId(riderId: number, userId?: string): string {
  return userId ?? `usr_${riderId}`;
}

async function loadCurrentCoords(
  riderId: number,
  userId: string
): Promise<{
  lat: number;
  lng: number;
  deviceId: string | null;
  accuracyM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
} | null> {
  const db = getDb();
  const [row] = await db
    .select({
      lat: riderCurrentLocations.lat,
      lng: riderCurrentLocations.lng,
      deviceId: riderCurrentLocations.deviceId,
      accuracyM: riderCurrentLocations.accuracyM,
      speedMps: riderCurrentLocations.speedMps,
      headingDeg: riderCurrentLocations.headingDeg,
    })
    .from(riderCurrentLocations)
    .where(eq(riderCurrentLocations.userId, userId))
    .limit(1);

  if (row) {
    return {
      lat: row.lat,
      lng: row.lng,
      deviceId: row.deviceId ?? null,
      accuracyM: row.accuracyM ?? null,
      speedMps: row.speedMps ?? null,
      headingDeg: row.headingDeg ?? null,
    };
  }

  const [byRider] = await db
    .select({
      lat: riderCurrentLocations.lat,
      lng: riderCurrentLocations.lng,
      deviceId: riderCurrentLocations.deviceId,
      accuracyM: riderCurrentLocations.accuracyM,
      speedMps: riderCurrentLocations.speedMps,
      headingDeg: riderCurrentLocations.headingDeg,
    })
    .from(riderCurrentLocations)
    .where(eq(riderCurrentLocations.riderId, riderId))
    .limit(1);

  if (!byRider) return null;
  return {
    lat: byRider.lat,
    lng: byRider.lng,
    deviceId: byRider.deviceId ?? null,
    accuracyM: byRider.accuracyM ?? null,
    speedMps: byRider.speedMps ?? null,
    headingDeg: byRider.headingDeg ?? null,
  };
}

/** Persist a fraud-audit row for duty / order milestones (independent of GPS sampling). */
export async function recordRiderLocationBusinessEvent(
  input: RecordRiderLocationBusinessEventInput
): Promise<boolean> {
  const userId = riderUserId(input.riderId, input.userId);
  const coords =
    input.lat != null && input.lng != null
      ? {
          lat: input.lat,
          lng: input.lng,
          deviceId: input.deviceId ?? null,
          accuracyM: input.accuracyM ?? null,
          speedMps: input.speedMps ?? null,
          headingDeg: input.headingDeg ?? null,
        }
      : await loadCurrentCoords(input.riderId, userId);

  if (!coords) return false;

  const deviceId = input.deviceId ?? coords.deviceId ?? "unknown_device";
  const tsMs = Date.now();
  const point: LocationPoint = {
    tsMs,
    lat: coords.lat,
    lng: coords.lng,
    accuracyM: coords.accuracyM,
    speedMps: coords.speedMps,
    headingDeg: coords.headingDeg,
    mocked: null,
  };

  const db = getDb();
  await db.insert(riderLocationEvents).values({
    id: `rloc_${ulid()}`,
    userId,
    deviceId,
    tsMs,
    lat: coords.lat,
    lng: coords.lng,
    accuracyM: coords.accuracyM,
    altitudeM: null,
    speedMps: coords.speedMps,
    headingDeg: coords.headingDeg,
    mocked: false,
    provider: "business_event",
    fraudScore: 0,
    fraudSignals: [],
    meta: {
      persistReason: "business",
      businessEvent: input.businessEvent,
      orderId: input.orderId ?? null,
      ...(input.metadata ?? {}),
    },
  });

  rememberRiderLocationPing(userId, deviceId, point, true);
  return true;
}

export async function recordRiderDutyLocationBusinessEvent(args: {
  riderId: number;
  deviceId?: string | null;
  lat?: number | null;
  lon?: number | null;
  status: "ON" | "OFF" | "AUTO_OFF";
}): Promise<void> {
  const businessEvent: RiderLocationBusinessEvent =
    args.status === "ON" ? "rider_online" : "rider_offline";

  await recordRiderLocationBusinessEvent({
    riderId: args.riderId,
    deviceId: args.deviceId ?? null,
    businessEvent,
    lat: args.lat ?? null,
    lng: args.lon ?? null,
    metadata: { dutyStatus: args.status },
  }).catch(() => {
    /* non-blocking */
  });
}

const ORDER_STATUS_BUSINESS_EVENT: Partial<Record<string, RiderLocationBusinessEvent>> = {
  accepted: "order_accepted",
  reached_store: "order_reached_pickup",
  reached_user: "order_reached_destination",
  picked_up: "order_picked_up",
  in_transit: "ride_started",
  delivered: "order_completed",
  cancelled: "order_cancelled",
};

export async function recordRiderOrderMilestoneLocationEvent(args: {
  riderId: number;
  orderId: string;
  status: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<void> {
  const businessEvent = ORDER_STATUS_BUSINESS_EVENT[args.status];
  if (!businessEvent) return;

  await recordRiderLocationBusinessEvent({
    riderId: args.riderId,
    orderId: args.orderId,
    businessEvent,
    lat: args.lat ?? null,
    lng: args.lng ?? null,
    metadata: { orderStatus: args.status },
  }).catch(() => {
    /* non-blocking */
  });
}
