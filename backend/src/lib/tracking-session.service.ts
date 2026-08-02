/**
 * Tracking session lifecycle (Phase 1, migration 0471).
 *
 * One INDEPENDENT session per rider↔order assignment. Tracking starts when a
 * rider accepts an order and stops on a terminal event (delivered / ride
 * completed / cancelled / unassigned / expired). Reassigning an order opens a
 * NEW session for the next rider — prior sessions and their coordinates are
 * never overwritten, giving permanent auditable history + future replay.
 *
 * This module owns ONLY session state + the coordinate sequence. Geo-scoping,
 * ETA, rule evaluation, and broadcasting live in their own modules (later
 * phases) so business logic stays modular and the mobile app stays thin.
 */
import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { ordersCore, trackingEvents, trackingSessions } from "../db/schema.js";

/** Map an order's terminal status → precise session stop reason. */
function orderStatusToStopReason(status?: string, serviceType?: string): TrackingStopReason {
  const s = String(status ?? "").toLowerCase();
  if (s === "delivered" || s === "completed") {
    return serviceType === "person_ride" ? "ride_completed" : "delivered";
  }
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "failed" || s === "expired") return "expired";
  return "unassigned";
}

/** Best-effort timeline event insert (direct — avoids a tracking-event.service
 * circular import). Never throws. */
async function insertSessionEvent(row: {
  orderId: string;
  orderSource: string;
  riderId: number;
  sessionId: number;
  assignmentId: number | null;
  serviceType: string;
  eventType: "tracking_started" | "tracking_stopped";
  message: string;
}): Promise<void> {
  try {
    await getDb().insert(trackingEvents).values({
      orderId: row.orderId,
      orderSource: row.orderSource,
      riderId: row.riderId,
      sessionId: row.sessionId,
      assignmentId: row.assignmentId,
      serviceType: row.serviceType,
      eventType: row.eventType,
      severity: "info",
      message: row.message,
    });
  } catch {
    /* best-effort */
  }
}

export type TrackingServiceType = "food" | "parcel" | "person_ride";
export type TrackingStopReason =
  | "delivered"
  | "ride_completed"
  | "cancelled"
  | "unassigned"
  | "expired"
  | "superseded";

export interface TrackingSessionRow {
  id: number;
  orderId: string;
  orderSource: string;
  riderId: number;
  assignmentId: number | null;
  serviceType: string;
  status: string;
  lastSeq: number;
  startedAt: Date;
}

function normalizeServiceType(raw?: string | null): TrackingServiceType {
  const s = String(raw ?? "").toLowerCase();
  if (s === "parcel") return "parcel";
  if (s === "person_ride" || s === "ride" || s === "person") return "person_ride";
  return "food";
}

/**
 * Start (or return the existing active) tracking session for a rider↔order.
 * Idempotent: a partial unique index guarantees at most one active session per
 * (order, rider), so concurrent accept/retry calls converge on one session.
 */
export async function startTrackingSession(args: {
  orderId: string;
  orderSource?: string;
  riderId: number;
  assignmentId?: number | null;
  serviceType?: string | null;
}): Promise<TrackingSessionRow | null> {
  const db = getDb();
  const orderSource = args.orderSource ?? "orders_core";
  const serviceType = normalizeServiceType(args.serviceType);
  try {
    // Insert; if an active session already exists, the partial unique index
    // (order_id, rider_id) WHERE status='active' makes this a no-op.
    const inserted = await db
      .insert(trackingSessions)
      .values({
        orderId: args.orderId,
        orderSource,
        riderId: args.riderId,
        assignmentId: args.assignmentId ?? null,
        serviceType,
        status: "active",
      })
      .onConflictDoNothing()
      .returning({ id: trackingSessions.id });

    if (inserted[0]?.id) {
      const created = await getActiveTrackingSession({ orderId: args.orderId, riderId: args.riderId });
      if (created) {
        void insertSessionEvent({
          orderId: created.orderId,
          orderSource: created.orderSource,
          riderId: created.riderId,
          sessionId: created.id,
          assignmentId: created.assignmentId,
          serviceType: created.serviceType,
          eventType: "tracking_started",
          message: "Tracking started",
        });
      }
      return created;
    }
    // Already active → return it (and backfill assignmentId if newly known).
    const existing = await getActiveTrackingSession({ orderId: args.orderId, riderId: args.riderId });
    if (existing && args.assignmentId && existing.assignmentId == null) {
      await db
        .update(trackingSessions)
        .set({ assignmentId: args.assignmentId, updatedAt: new Date() })
        .where(eq(trackingSessions.id, existing.id));
    }
    return existing;
  } catch {
    return getActiveTrackingSession({ orderId: args.orderId, riderId: args.riderId });
  }
}

/** The active session for a rider↔order, if any. */
export async function getActiveTrackingSession(args: {
  orderId: string;
  riderId: number;
}): Promise<TrackingSessionRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(trackingSessions)
    .where(
      and(
        eq(trackingSessions.orderId, args.orderId),
        eq(trackingSessions.riderId, args.riderId),
        eq(trackingSessions.status, "active")
      )
    )
    .orderBy(desc(trackingSessions.startedAt))
    .limit(1);
  return row ? mapRow(row) : null;
}

/** Stop the rider's active session for an order (terminal event). Idempotent. */
export async function stopTrackingSession(args: {
  orderId: string;
  riderId: number;
  reason: TrackingStopReason;
}): Promise<void> {
  const db = getDb();
  await db
    .update(trackingSessions)
    .set({
      status: reasonToStatus(args.reason),
      stopReason: args.reason,
      endedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(trackingSessions.orderId, args.orderId),
        eq(trackingSessions.riderId, args.riderId),
        eq(trackingSessions.status, "active")
      )
    );
}

/**
 * Stop ALL still-active sessions for an order (e.g. the order was cancelled /
 * expired, or reassigned to a new rider). Prior history is preserved.
 */
export async function stopAllActiveSessionsForOrder(args: {
  orderId: string;
  reason: TrackingStopReason;
  exceptRiderId?: number;
}): Promise<void> {
  const db = getDb();
  const where = args.exceptRiderId
    ? and(
        eq(trackingSessions.orderId, args.orderId),
        eq(trackingSessions.status, "active"),
        sql`${trackingSessions.riderId} <> ${args.exceptRiderId}`
      )
    : and(eq(trackingSessions.orderId, args.orderId), eq(trackingSessions.status, "active"));
  await db
    .update(trackingSessions)
    .set({ status: reasonToStatus(args.reason), stopReason: args.reason, endedAt: new Date(), updatedAt: new Date() })
    .where(where);
}

/**
 * Atomically claim the next coordinate sequence number for a session and update
 * the denormalized "latest position" fields. Returns the new sequence number,
 * or null if the session is not active. Used by the ingestion path so each
 * stored coordinate gets a gap-free, ordered sequence for replay + integrity.
 */
export async function advanceSessionCoordinate(args: {
  sessionId: number;
  latitude: number;
  longitude: number;
  recordedAt?: Date;
}): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .update(trackingSessions)
    .set({
      lastSeq: sql`${trackingSessions.lastSeq} + 1`,
      coordinateCount: sql`${trackingSessions.coordinateCount} + 1`,
      lastLatitude: args.latitude.toFixed(7),
      lastLongitude: args.longitude.toFixed(7),
      lastRecordedAt: args.recordedAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(trackingSessions.id, args.sessionId), eq(trackingSessions.status, "active")))
    .returning({ lastSeq: trackingSessions.lastSeq });
  return row?.lastSeq ?? null;
}

/**
 * Safety-net reconcile: stop any of the rider's still-active sessions whose
 * order is no longer in the rider's active set (delivered / cancelled /
 * unassigned / expired). Driven by the SAME source of truth as start (the
 * rider's active orders), so a stop can never be missed even if an explicit
 * terminal hook is absent. Explicit hooks still run first and set the precise
 * stop_reason; this only sweeps up anything they missed.
 */
export async function stopInactiveSessionsForRider(args: {
  riderId: number;
  activeOrderIds: string[];
}): Promise<void> {
  const db = getDb();
  const active = Array.from(new Set(args.activeOrderIds.filter((s) => Boolean(s && s.trim()))));
  const conds = [eq(trackingSessions.riderId, args.riderId), eq(trackingSessions.status, "active")];
  if (active.length > 0) conds.push(notInArray(trackingSessions.orderId, active));

  const toStop = await db
    .select({
      id: trackingSessions.id,
      orderId: trackingSessions.orderId,
      orderSource: trackingSessions.orderSource,
      serviceType: trackingSessions.serviceType,
      assignmentId: trackingSessions.assignmentId,
    })
    .from(trackingSessions)
    .where(and(...conds));
  if (toStop.length === 0) return;

  // Derive a precise stop reason from each order's terminal status (batched).
  const orderIds = Array.from(new Set(toStop.map((s) => s.orderId)));
  const statusRows = await db
    .select({ orderId: ordersCore.orderId, status: ordersCore.status })
    .from(ordersCore)
    .where(inArray(ordersCore.orderId, orderIds));
  const statusByOrder = new Map(
    statusRows.map((r) => [(r.orderId ?? "").trim(), String(r.status ?? "")])
  );

  const now = new Date();
  for (const s of toStop) {
    const reason = orderStatusToStopReason(statusByOrder.get(s.orderId), s.serviceType);
    await db
      .update(trackingSessions)
      .set({ status: reasonToStatus(reason), stopReason: reason, endedAt: now, updatedAt: now })
      .where(eq(trackingSessions.id, s.id));
    void insertSessionEvent({
      orderId: s.orderId,
      orderSource: s.orderSource,
      riderId: args.riderId,
      sessionId: s.id,
      assignmentId: s.assignmentId,
      serviceType: s.serviceType,
      eventType: "tracking_stopped",
      message: `Tracking stopped (${reason})`,
    });
    activeSessionCache.delete(`${s.orderId}::${args.riderId}`);
  }
}

// ── Ingestion helper ──────────────────────────────────────────────────────
// Short-lived in-process cache of the active session id per (order, rider) so
// the hot ping path does not re-run the idempotent start on every fix.
const activeSessionCache = new Map<
  string,
  { id: number; serviceType: string; assignmentId: number | null; at: number }
>();
const SESSION_CACHE_TTL_MS = 60_000;

/**
 * Ensure a session exists for an actively-tracked (order, rider) and claim the
 * next coordinate sequence. Lazy-start means a session is opened on the first
 * ping of an accepted order — tracking can never "miss" an accept. Returns the
 * session id + gap-free sequence to stamp onto the stored coordinate, or null
 * if a session cannot be established.
 */
export async function recordCoordinateForActiveOrder(args: {
  orderId: string;
  riderId: number;
  latitude: number;
  longitude: number;
  serviceType?: string | null;
  recordedAt?: Date;
}): Promise<{
  sessionId: number;
  sequenceNumber: number;
  assignmentId: number | null;
  serviceType: string;
} | null> {
  const key = `${args.orderId}::${args.riderId}`;

  const resolve = async () => {
    const s = await startTrackingSession({
      orderId: args.orderId,
      riderId: args.riderId,
      serviceType: args.serviceType,
    });
    if (!s) {
      activeSessionCache.delete(key);
      return null;
    }
    const entry = { id: s.id, serviceType: s.serviceType, assignmentId: s.assignmentId, at: Date.now() };
    activeSessionCache.set(key, entry);
    return entry;
  };

  let entry = activeSessionCache.get(key);
  if (!entry || Date.now() - entry.at > SESSION_CACHE_TTL_MS) {
    entry = (await resolve()) ?? undefined;
    if (!entry) return null;
  }

  let seq = await advanceSessionCoordinate({
    sessionId: entry.id,
    latitude: args.latitude,
    longitude: args.longitude,
    recordedAt: args.recordedAt,
  });
  if (seq == null) {
    // The cached session was stopped (terminal / reassign) — re-resolve once.
    entry = (await resolve()) ?? undefined;
    if (!entry) return null;
    seq = await advanceSessionCoordinate({
      sessionId: entry.id,
      latitude: args.latitude,
      longitude: args.longitude,
      recordedAt: args.recordedAt,
    });
    if (seq == null) return null;
  }

  return {
    sessionId: entry.id,
    sequenceNumber: seq,
    assignmentId: entry.assignmentId,
    serviceType: entry.serviceType,
  };
}

function reasonToStatus(reason: TrackingStopReason): string {
  switch (reason) {
    case "delivered":
    case "ride_completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "unassigned":
    case "superseded":
    default:
      return "stopped";
  }
}

function mapRow(row: typeof trackingSessions.$inferSelect): TrackingSessionRow {
  return {
    id: row.id,
    orderId: row.orderId,
    orderSource: row.orderSource,
    riderId: row.riderId,
    assignmentId: row.assignmentId ?? null,
    serviceType: row.serviceType,
    status: row.status,
    lastSeq: row.lastSeq,
    startedAt: row.startedAt,
  };
}
