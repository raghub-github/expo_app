import { haversineMeters, type LocationPoint } from "../modules/rider/fraud.js";

/** Minimum time between persisted audit rows for the same rider device. */
export const RIDER_LOCATION_EVENT_MIN_INTERVAL_MS = 60_000;

/** Persist when rider moved at least this far since the last stored event. */
export const RIDER_LOCATION_EVENT_MIN_MOVE_METERS = 100;

export type RiderLocationPersistReason =
  | "mocked"
  | "fraud"
  | "first"
  | "interval"
  | "moved"
  | "business"
  | "sampled_out";

export type RiderLocationBusinessEvent =
  | "rider_online"
  | "rider_offline"
  | "order_accepted"
  | "order_reached_pickup"
  | "order_picked_up"
  | "ride_started"
  | "order_reached_destination"
  | "order_completed"
  | "order_cancelled";

export type PersistRiderLocationEventDecision = {
  persist: boolean;
  reason: RiderLocationPersistReason;
  businessEvent?: RiderLocationBusinessEvent;
};

export function shouldPersistRiderLocationEvent(args: {
  prevPersisted: LocationPoint | null;
  curr: LocationPoint;
  fraudScore: number;
  fraudSignals: readonly string[];
  forceBusinessEvent?: RiderLocationBusinessEvent;
}): PersistRiderLocationEventDecision {
  if (args.forceBusinessEvent) {
    return { persist: true, reason: "business", businessEvent: args.forceBusinessEvent };
  }

  if (args.curr.mocked) {
    return { persist: true, reason: "mocked" };
  }

  if (args.fraudScore > 0 || args.fraudSignals.length > 0) {
    return { persist: true, reason: "fraud" };
  }

  if (!args.prevPersisted) {
    return { persist: true, reason: "first" };
  }

  const dtMs = Math.max(0, args.curr.tsMs - args.prevPersisted.tsMs);
  if (dtMs >= RIDER_LOCATION_EVENT_MIN_INTERVAL_MS) {
    return { persist: true, reason: "interval" };
  }

  const distM = haversineMeters(args.prevPersisted, args.curr);
  if (distM >= RIDER_LOCATION_EVENT_MIN_MOVE_METERS) {
    return { persist: true, reason: "moved" };
  }

  return { persist: false, reason: "sampled_out" };
}

type RiderDevicePingState = {
  lastPing: LocationPoint;
  lastPersisted: LocationPoint | null;
  lastPingReceivedAtMs: number;
};

const pingStateByDevice = new Map<string, RiderDevicePingState>();

function stateKey(userId: string, deviceId: string): string {
  return `${userId}:${deviceId}`;
}

export function readRiderLocationPingState(
  userId: string,
  deviceId: string
): RiderDevicePingState | null {
  return pingStateByDevice.get(stateKey(userId, deviceId)) ?? null;
}

export function rememberRiderLocationPing(
  userId: string,
  deviceId: string,
  ping: LocationPoint,
  persisted: boolean
): void {
  const key = stateKey(userId, deviceId);
  const prev = pingStateByDevice.get(key);
  pingStateByDevice.set(key, {
    lastPing: ping,
    lastPersisted: persisted ? ping : (prev?.lastPersisted ?? null),
    lastPingReceivedAtMs: Date.now(),
  });
}

/** Test helper — not for production hot paths. */
export function clearRiderLocationPingStateForTests(): void {
  pingStateByDevice.clear();
}
