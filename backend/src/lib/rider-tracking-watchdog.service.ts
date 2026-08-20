/**
 * Rider tracking watchdog (Phase B — detection + warnings only, no cancel yet).
 *
 * Runs on a timer (every ~60s, single-flight via redis lock in index.ts) and
 * sweeps ACTIVE pre-pickup tracking sessions. Unlike the ping-driven geo engine,
 * a timer can catch the case a rider kills GPS / the app — no pings arrive, so
 * only a server-side sweep sees "location off for N minutes".
 *
 * For each enabled service it evaluates, against the per-service config
 * (gm_rider_auto_cancel_config):
 *   • location_off      — no fix received for locationOffMinutes
 *   • no_movement       — stationary for noMovementMinutes (still pinging)
 *   • opposite_direction— drifted oppositeDirectionKm past the closest approach
 * and warns the rider every warningIntervalMinutes while a rule is breached.
 *
 * Phase C will turn a sustained breach (past threshold + grace) into an
 * automatic unassign + per-service penalty. This module intentionally does NOT
 * cancel or debit yet. Best-effort throughout — never throws to the caller.
 */
import { getSql } from "../db/client.js";
import { haversineDistanceMeters } from "./order-assignment-engine.js";
import { publishOrderEvent, publishRiderEvent } from "./../modules/realtime/publish.js";
import { recordTrackingEvent, type TrackingEventType } from "./tracking-event.service.js";
import {
  getRiderAutoCancelConfig,
  normalizeServiceType,
  type RiderAutoCancelConfig,
} from "./rider-auto-cancel-config.service.js";

type WatchdogRule = "location_off" | "no_movement" | "opposite_direction";

interface WatchGeoState {
  // maintained by the ping-driven geo engine (tracking-geo-engine.service.ts)
  lastMovedAtMs?: number;
  minTargetDistM?: number;
  // maintained here
  acWarnRule?: WatchdogRule;
  acLastWarnedAtMs?: number;
  acFirstBreachAtMs?: number;
  acAutoCancelledAtMs?: number;
  [k: string]: unknown;
}

type SessionRow = {
  session_id: number;
  order_id: string;
  order_core_id: number | null;
  rider_id: number | null;
  service_type: string | null;
  assignment_id: number | null;
  last_lat: number | null;
  last_lng: number | null;
  last_recorded_at: string | null;
  started_at: string | null;
  geo_state: unknown;
  core_status: string | null;
  current_status: string | null;
  order_type: string | null;
  pickup_lat: number | null;
  pickup_lng: number | null;
};

function isPickedUp(status: string, currentStatus: string): boolean {
  const s = `${status} ${currentStatus}`.toLowerCase();
  return (
    s.includes("picked_up") ||
    s.includes("out_for_delivery") ||
    s.includes("in_transit") ||
    s.includes("on_the_way") ||
    s.includes("started") ||
    s.includes("ride_started") ||
    s.includes("delivered") ||
    s.includes("completed") ||
    s.includes("cancelled")
  );
}

const WARN_EVENT_TYPE: Record<WatchdogRule, TrackingEventType> = {
  location_off: "gps_lost",
  no_movement: "long_stop",
  opposite_direction: "opposite_direction",
};

function warnMessage(rule: WatchdogRule, cfg: RiderAutoCancelConfig, detail: number): string {
  switch (rule) {
    case "location_off":
      return `Location is off. Turn it back on within ${cfg.locationOffMinutes} min or the order may be auto-cancelled.`;
    case "no_movement":
      return `You haven't moved for a while. Head to the pickup or the order may be auto-cancelled.`;
    case "opposite_direction":
      return `You're ${detail.toFixed(1)} km away from the pickup and moving further. Turn back or the order may be auto-cancelled.`;
  }
}

type Breach = { rule: WatchdogRule; detail: number };

/** Pick the highest-priority active breach for a session, or null if compliant. */
function evaluateBreach(
  cfg: RiderAutoCancelConfig,
  args: {
    nowMs: number;
    lastRecordedMs: number;
    state: WatchGeoState;
    lastLat: number | null;
    lastLng: number | null;
    pickupLat: number | null;
    pickupLng: number | null;
  }
): Breach | null {
  const ageMs = args.nowMs - args.lastRecordedMs;

  // 1) location off (no pings) — highest priority, unique to the watchdog.
  if (cfg.enableLocationOffRule && ageMs > cfg.locationOffMinutes * 60_000) {
    return { rule: "location_off", detail: Math.round(ageMs / 60_000) };
  }

  // 2) opposite direction — drifted past the closest approach by > threshold km.
  if (
    cfg.enableOppositeDirectionRule &&
    args.state.minTargetDistM != null &&
    args.lastLat != null &&
    args.lastLng != null &&
    args.pickupLat != null &&
    args.pickupLng != null
  ) {
    const distNow = haversineDistanceMeters(args.lastLat, args.lastLng, args.pickupLat, args.pickupLng);
    const driftM = distNow - args.state.minTargetDistM;
    if (driftM > cfg.oppositeDirectionKm * 1000) {
      return { rule: "opposite_direction", detail: distNow / 1000 };
    }
  }

  // 3) no movement — stationary too long while still pinging.
  if (
    cfg.enableNoMovementRule &&
    args.state.lastMovedAtMs != null &&
    args.nowMs - args.state.lastMovedAtMs > cfg.noMovementMinutes * 60_000
  ) {
    return { rule: "no_movement", detail: Math.round((args.nowMs - args.state.lastMovedAtMs) / 60_000) };
  }

  return null;
}

async function persistState(sessionId: number, state: WatchGeoState): Promise<void> {
  try {
    const sql = getSql();
    await sql.unsafe(
      `UPDATE tracking_sessions SET geo_state = $1::text::jsonb, updated_at = now() WHERE id = $2`,
      [JSON.stringify(state), sessionId]
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Auto-cancel a sustained pre-pickup breach: penalise (if configured) then unassign +
 * re-dispatch (which excludes this rider from re-offer). FOOD only for now — it has the
 * reusable unassign path; parcel/ride stay warn-only. Returns true when the order was
 * actually unassigned. Best-effort.
 */
async function performAutoCancel(
  row: SessionRow,
  cfg: RiderAutoCancelConfig,
  breach: Breach
): Promise<boolean> {
  const orderType = String(row.order_type ?? "").trim().toLowerCase();
  const orderCorePk = Number(row.order_core_id);
  const riderId = Number(row.rider_id);
  if (!Number.isFinite(orderCorePk) || orderCorePk <= 0 || !Number.isFinite(riderId) || riderId <= 0) {
    return false;
  }
  if (orderType !== "food") return false; // parcel/ride: warn-only until their unassign path is wired

  const serviceType = normalizeServiceType(row.service_type ?? row.order_type);
  const reasonCode = `auto_cancel_${breach.rule}`;
  const message = warnMessage(breach.rule, cfg, breach.detail);

  try {
    // Penalty first (idempotent), then unassign + restart matching.
    if (cfg.penaltyAmount > 0) {
      const { applyAutoCancelRiderPenalty } = await import("./rider-auto-cancel-penalty.service.js");
      await applyAutoCancelRiderPenalty({
        orderCoreId: orderCorePk,
        riderId,
        orderType,
        amount: cfg.penaltyAmount,
        rule: breach.rule,
        ledgerTitle: cfg.ledgerTitle,
        ledgerDescription: cfg.ledgerDescription,
        orderPublicId: row.order_id,
      }).catch(() => undefined);
    }

    const { unassignFoodRiderAndRestartDispatch } = await import("./food-rider-unassign.service.js");
    await unassignFoodRiderAndRestartDispatch({
      orderCorePk,
      orderIdText: row.order_id,
      riderId,
      reasonCode,
      reasonText: `Auto-cancelled: ${message}`,
      removedBy: null,
      actorType: "system",
    });

    void recordTrackingEvent({
      orderId: row.order_id,
      riderId,
      sessionId: row.session_id,
      assignmentId: row.assignment_id,
      serviceType,
      eventType: WARN_EVENT_TYPE[breach.rule],
      severity: "violation",
      latitude: row.last_lat ?? undefined,
      longitude: row.last_lng ?? undefined,
      message: `Auto-cancelled: ${message}`,
      metadata: {
        rule: breach.rule,
        detail: breach.detail,
        source: "auto_cancel_watchdog",
        action: "auto_cancel",
        penaltyAmount: cfg.penaltyAmount,
      },
    }).catch(() => {});

    const autoCancelEvent = {
      type: "tracking.autocancel.v1",
      rule: breach.rule,
      orderId: row.order_id,
      riderId,
      serviceType,
      message: `Order auto-cancelled — ${message}`,
    } as const;
    void publishRiderEvent(riderId, autoCancelEvent).catch(() => {});
    void publishOrderEvent(row.order_id, { ...autoCancelEvent, orderIdText: row.order_id }).catch(() => {});

    return true;
  } catch {
    return false;
  }
}

async function processSession(row: SessionRow, nowMs: number): Promise<"warned" | "cleared" | "skip" | "cancelled"> {
  if (row.rider_id == null) return "skip";
  // Pre-pickup only (product decision). Skip anything already picked up / terminal.
  if (isPickedUp(String(row.core_status ?? ""), String(row.current_status ?? ""))) return "skip";

  const serviceType = normalizeServiceType(row.service_type ?? row.order_type);
  const cfg = await getRiderAutoCancelConfig(serviceType, "pre_pickup");
  if (!cfg.isEnabled) return "skip";

  const state: WatchGeoState = (row.geo_state as WatchGeoState) ?? {};
  const lastRecordedMs = row.last_recorded_at
    ? Date.parse(row.last_recorded_at)
    : row.started_at
      ? Date.parse(row.started_at)
      : nowMs;

  const breach = evaluateBreach(cfg, {
    nowMs,
    lastRecordedMs: Number.isFinite(lastRecordedMs) ? lastRecordedMs : nowMs,
    state,
    lastLat: row.last_lat,
    lastLng: row.last_lng,
    pickupLat: row.pickup_lat,
    pickupLng: row.pickup_lng,
  });

  if (!breach) {
    // Compliant again — clear any prior warning state so the next breach re-arms.
    if (state.acWarnRule || state.acLastWarnedAtMs || state.acFirstBreachAtMs) {
      delete state.acWarnRule;
      delete state.acLastWarnedAtMs;
      delete state.acFirstBreachAtMs;
      await persistState(row.session_id, state);
    }
    return "cleared";
  }

  // Rule changed → reset the first-breach clock so grace is measured per rule.
  if (state.acWarnRule !== breach.rule) {
    state.acWarnRule = breach.rule;
    state.acFirstBreachAtMs = nowMs;
    state.acLastWarnedAtMs = undefined;
  }
  if (state.acFirstBreachAtMs == null) state.acFirstBreachAtMs = nowMs;

  // Auto-cancel takes precedence once the breach is sustained past grace (opt-in). Requires a
  // prior warning (acLastWarnedAtMs), so the rider always gets a chance first.
  if (shouldAutoCancelNow(cfg, state, nowMs)) {
    const cancelled = await performAutoCancel(row, cfg, breach);
    if (cancelled) {
      state.acAutoCancelledAtMs = nowMs;
      await persistState(row.session_id, state);
      return "cancelled";
    }
  }

  const intervalMs = Math.max(1, cfg.warningIntervalMinutes) * 60_000;
  const due = state.acLastWarnedAtMs == null || nowMs - state.acLastWarnedAtMs >= intervalMs;
  if (!due) return "skip";

  state.acLastWarnedAtMs = nowMs;
  await persistState(row.session_id, state);

  const message = warnMessage(breach.rule, cfg, breach.detail);
  // Rider-facing warning banner (WS). Also mirror to the order channel so an
  // admin watching the live map sees the alert.
  const warnEvent = {
    type: "tracking.warning.v1",
    rule: breach.rule,
    orderId: row.order_id,
    riderId: row.rider_id,
    serviceType,
    message,
    reWarnIntervalMinutes: cfg.warningIntervalMinutes,
  } as const;
  void publishRiderEvent(row.rider_id, warnEvent).catch(() => {});
  void publishOrderEvent(row.order_id, { ...warnEvent, orderIdText: row.order_id }).catch(() => {});

  // Timeline event (severity warning — not a violation; the geo engine owns
  // violations. This is the rider-facing nudge trail).
  void recordTrackingEvent({
    orderId: row.order_id,
    riderId: row.rider_id,
    sessionId: row.session_id,
    assignmentId: row.assignment_id,
    serviceType,
    eventType: WARN_EVENT_TYPE[breach.rule],
    severity: "warning",
    latitude: row.last_lat ?? undefined,
    longitude: row.last_lng ?? undefined,
    message,
    metadata: { rule: breach.rule, detail: breach.detail, source: "auto_cancel_watchdog" },
  }).catch(() => {});

  return "warned";
}

export type WatchdogTickResult = {
  scanned: number;
  warned: number;
  cleared: number;
  cancelled: number;
};

/**
 * Should a sustained breach auto-cancel now? Only when explicitly opted in, at least one
 * warning has been sent, the breach has persisted past grace_minutes, and it hasn't already
 * been auto-cancelled. Pure + testable.
 */
export function shouldAutoCancelNow(
  cfg: { autoCancelEnabled: boolean; graceMinutes: number },
  state: { acFirstBreachAtMs?: number; acLastWarnedAtMs?: number; acAutoCancelledAtMs?: number },
  nowMs: number
): boolean {
  if (!cfg.autoCancelEnabled) return false;
  if (state.acAutoCancelledAtMs) return false;
  if (state.acFirstBreachAtMs == null) return false;
  if (state.acLastWarnedAtMs == null) return false; // rider must have been warned first
  const graceMs = Math.max(0, cfg.graceMinutes) * 60_000;
  return nowMs - state.acFirstBreachAtMs >= graceMs;
}

/** One watchdog sweep. Registered on an interval (with lock) in index.ts. */
export async function runRiderTrackingWatchdogTick(log?: {
  info?: (o: unknown, m?: string) => void;
  error?: (o: unknown, m?: string) => void;
}): Promise<WatchdogTickResult> {
  const result: WatchdogTickResult = { scanned: 0, warned: 0, cleared: 0, cancelled: 0 };
  try {
    const sql = getSql();
    const rows = await sql.unsafe<SessionRow[]>(
      `
        SELECT
          ts.id                    AS session_id,
          ts.order_id,
          oc.id                    AS order_core_id,
          ts.rider_id,
          ts.service_type,
          ts.assignment_id,
          ts.last_latitude::float8  AS last_lat,
          ts.last_longitude::float8 AS last_lng,
          ts.last_recorded_at::text,
          ts.started_at::text,
          ts.geo_state,
          oc.status::text          AS core_status,
          oc.current_status::text  AS current_status,
          oc.order_type,
          oc.pickup_lat::float8     AS pickup_lat,
          oc.pickup_lon::float8     AS pickup_lng
        FROM tracking_sessions ts
        JOIN orders_core oc ON oc.order_id = ts.order_id
        WHERE ts.status = 'active'
        ORDER BY ts.id
        LIMIT 1000
      `
    );

    const nowMs = Date.now();
    for (const row of rows) {
      result.scanned += 1;
      try {
        const outcome = await processSession(row, nowMs);
        if (outcome === "warned") result.warned += 1;
        else if (outcome === "cleared") result.cleared += 1;
        else if (outcome === "cancelled") result.cancelled += 1;
      } catch (e) {
        log?.error?.({ err: (e as Error).message, sessionId: row.session_id }, "watchdog session failed");
      }
    }
    if (result.warned > 0 && log?.info) {
      log.info(result, "rider tracking watchdog");
    }
  } catch (e) {
    // table missing (pre-migration) or transient — swallow; next tick retries.
    log?.error?.({ err: (e as Error).message }, "rider tracking watchdog tick failed");
  }
  return result;
}
