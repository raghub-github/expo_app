/**
 * Tracking event recorder (Phase 2, migration 0472).
 *
 * Appends immutable events to tracking_events. Always best-effort: recording an
 * event must NEVER break the caller (geofence enforcement, session lifecycle,
 * ingestion). Events are the audit/timeline source for the Control Dashboard,
 * activity log, and future replay/analytics.
 */
import { getDb } from "../db/client.js";
import { trackingEvents } from "../db/schema.js";
import { getActiveTrackingSession } from "./tracking-session.service.js";
import { publishOrderEvent } from "../modules/realtime/publish.js";

export type TrackingEventType =
  | "tracking_started"
  | "tracking_stopped"
  | "reached_pickup"
  | "left_pickup"
  | "pickup_verified"
  | "pickup_blocked"
  | "reached_drop"
  | "drop_verified"
  | "drop_blocked"
  | "geofence_verified"
  | "geofence_blocked"
  | "gps_lost"
  | "gps_restored"
  | "long_stop"
  | "route_deviation"
  | "opposite_direction"
  | "speed_anomaly"
  | "gps_accuracy_low"
  | "assignment_changed";

export type TrackingEventSeverity = "info" | "warning" | "violation";

export interface RecordTrackingEventInput {
  orderId: string;
  orderSource?: string;
  riderId?: number | null;
  sessionId?: number | null;
  assignmentId?: number | null;
  serviceType?: string | null;
  eventType: TrackingEventType;
  milestoneKey?: string | null;
  severity?: TrackingEventSeverity;
  latitude?: number | null;
  longitude?: number | null;
  distanceM?: number | null;
  radiusM?: number | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Record a tracking event. Resolves the active session id when not supplied so
 * the event is grouped under the right per-assignment session. Never throws.
 */
export async function recordTrackingEvent(input: RecordTrackingEventInput): Promise<void> {
  try {
    const db = getDb();

    let sessionId = input.sessionId ?? null;
    if (sessionId == null && input.riderId != null) {
      const session = await getActiveTrackingSession({
        orderId: input.orderId,
        riderId: input.riderId,
      }).catch(() => null);
      sessionId = session?.id ?? null;
    }

    await db.insert(trackingEvents).values({
      orderId: input.orderId,
      orderSource: input.orderSource ?? "orders_core",
      riderId: input.riderId ?? null,
      sessionId,
      assignmentId: input.assignmentId ?? null,
      serviceType: input.serviceType ?? null,
      eventType: input.eventType,
      milestoneKey: input.milestoneKey ?? null,
      severity: input.severity ?? "info",
      latitude: input.latitude != null ? input.latitude.toFixed(7) : null,
      longitude: input.longitude != null ? input.longitude.toFixed(7) : null,
      distanceM: input.distanceM ?? null,
      radiusM: input.radiusM ?? null,
      message: input.message ?? null,
      metadata: input.metadata ?? {},
    });

    // Broadcast live so the Control Dashboard / partner / customer timelines
    // update without polling. Fire-and-forget (publish never blocks/throws).
    void publishOrderEvent(input.orderId, {
      type: "tracking.event.v1",
      orderId: input.orderId,
      riderId: input.riderId ?? null,
      sessionId,
      serviceType: input.serviceType ?? null,
      eventType: input.eventType,
      milestoneKey: input.milestoneKey ?? null,
      severity: input.severity ?? "info",
      distanceM: input.distanceM ?? null,
      radiusM: input.radiusM ?? null,
      message: input.message ?? null,
    }).catch(() => {});
  } catch {
    // Best-effort: never let event recording break the tracking path.
  }
}
