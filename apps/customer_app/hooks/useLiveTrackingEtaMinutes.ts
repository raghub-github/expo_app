import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import type { OrderEtaResponse } from "@/services/eta.service";
import type { FoodDeliveryMapPhase } from "@/lib/food-delivery-map-phase";
import {
  isEtaUpdatedFromPromise,
  isMerchantEtaDelayed,
  resolveDisplayEtaMinutes,
} from "@/lib/order-eta-display";
import {
  isArrivingSoon,
  resolveEtaConfidence,
  resolveLiveEtaPhase,
  type LiveTrackingEtaResult,
  type RiderMotionSample,
  type RiderMotionState,
  updateRiderMotionState,
} from "@/lib/live-tracking-eta";
import { pushEtaAudit } from "@/lib/eta-audit-log";
import { effectiveNowMs } from "@/lib/server-time-offset";

/** Live ETA minute flips — 5s is enough for countdown UI without heating the device. */
const TICK_MS = 5_000;
/** Rider motion / GPS staleness checks (map health only — not ETA inventing). */
const MOTION_TICK_MS = 15_000;

export type { LiveTrackingEtaResult };

export type LiveTrackingEtaHookResult = LiveTrackingEtaResult & {
  /** Server-offset-corrected client clock used for timestamp countdowns. */
  nowMs: number;
};

const EMPTY: LiveTrackingEtaHookResult = {
  minutes: null,
  frozenForDelay: false,
  arrivingSoon: false,
  stuckRider: false,
  gpsUnavailable: false,
  confidence: "medium",
  phase: "preparing",
  countdownPaused: false,
  nowMs: 0,
};

/**
 * Production live ETA for food tracking:
 * - Countdown ONLY from server timestamps (prep.readyByAt / promisedDeliveryAt)
 * - 1s tick for smooth minute flips; never invents ETA from GPS
 * - Resyncs when eta payload / etaVersion / timestamps change
 */
export function useLiveTrackingEtaMinutes(args: {
  eta: OrderEtaResponse | null | undefined;
  orderId: string | null | undefined;
  /** @deprecated Ignored — frontend must not invent delivery ETA from movement. */
  movementEtaMinutes?: number | null;
  remainingDistanceM?: number | null;
  mapPhase?: FoodDeliveryMapPhase;
  orderStatus?: string;
  hasRider?: boolean;
  riderArrived?: boolean;
  waitingAtStore?: boolean;
  riderSample?: RiderMotionSample | null;
  accuracyMeters?: number | null;
  enabled?: boolean;
}): LiveTrackingEtaHookResult {
  const {
    eta,
    orderId,
    remainingDistanceM = null,
    mapPhase = "rider_to_pickup",
    orderStatus = "",
    hasRider = false,
    riderArrived = false,
    waitingAtStore = false,
    riderSample = null,
    accuracyMeters = null,
    enabled = true,
  } = args;

  const active = Boolean(enabled && orderId);

  const [nowMs, setNowMs] = useState(() => effectiveNowMs());
  const [motionState, setMotionState] = useState<RiderMotionState>({
    stuck: false,
    gpsStale: false,
    lastMovedAtMs: null,
  });

  const heldRef = useRef<{
    orderId: string;
    promiseKey: string;
    lastLogged: number | null;
    lastReason: string;
  }>({
    orderId: "",
    promiseKey: "",
    lastLogged: null,
    lastReason: "",
  });

  const motionMemRef = useRef<{
    orderId: string;
    anchor: RiderMotionSample | null;
    lastMovedAtMs: number | null;
  }>({ orderId: "", anchor: null, lastMovedAtMs: null });

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      if (AppState.currentState !== "active") return;
      setNowMs((prev) => {
        const next = effectiveNowMs();
        // Bail when the displayed second is unchanged — avoids render storms.
        return Math.floor(prev / 1000) === Math.floor(next / 1000) ? prev : next;
      });
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [active, orderId]);

  // Resync clock when server ETA targets change — not on volatile lastUpdatedAt/serverNow.
  const etaSyncKey = [
    eta?.stageAware?.etaVersion ?? "",
    eta?.prep?.readyByAt ?? "",
    eta?.live?.promisedDeliveryAt ?? "",
    eta?.stageAware?.promisedAt ?? "",
  ].join("|");

  useEffect(() => {
    if (!active) return;
    setNowMs((prev) => {
      const next = effectiveNowMs();
      return Math.floor(prev / 1000) === Math.floor(next / 1000) ? prev : next;
    });
  }, [active, etaSyncKey]);

  useEffect(() => {
    if (!active) return;
    const onState = (state: AppStateStatus) => {
      if (state === "active") {
        setNowMs((prev) => {
          const next = effectiveNowMs();
          return Math.floor(prev / 1000) === Math.floor(next / 1000) ? prev : next;
        });
      }
    };
    const sub = AppState.addEventListener("change", onState);
    return () => sub.remove();
  }, [active]);

  const expectMovement =
    Boolean(hasRider) &&
    !riderArrived &&
    !waitingAtStore &&
    (mapPhase === "rider_to_drop" || mapPhase === "rider_to_pickup");

  useEffect(() => {
    if (!active || !orderId) {
      setMotionState((prev) =>
        prev.stuck || prev.gpsStale || prev.lastMovedAtMs != null
          ? { stuck: false, gpsStale: false, lastMovedAtMs: null }
          : prev
      );
      return;
    }
    const tick = () => {
      const now = Date.now();
      const { next, state } = updateRiderMotionState(motionMemRef.current, {
        orderId,
        sample: riderSample,
        nowMs: now,
        expectMovement,
      });
      motionMemRef.current = next;
      setMotionState((prev) =>
        prev.stuck === state.stuck &&
        prev.gpsStale === state.gpsStale &&
        prev.lastMovedAtMs === state.lastMovedAtMs
          ? prev
          : state
      );
    };
    tick();
    const id = setInterval(tick, MOTION_TICK_MS);
    return () => clearInterval(id);
  }, [
    active,
    orderId,
    expectMovement,
    riderSample?.latitude,
    riderSample?.longitude,
    riderSample?.updatedAtMs,
  ]);

  let result: LiveTrackingEtaHookResult = { ...EMPTY, nowMs };
  let auditReason = "tick";

  if (active && orderId) {
    if (heldRef.current.orderId !== orderId) {
      heldRef.current = {
        orderId,
        promiseKey: "",
        lastLogged: null,
        lastReason: "",
      };
    }

    const stuckRider = motionState.stuck;
    // Always derive from server clocks / aged server snapshots — never GPS ETA.
    const minutes = resolveDisplayEtaMinutes(eta, nowMs);

    const promiseKey =
      (eta?.prep?.readyByAt?.trim() ? `ready:${eta.prep.readyByAt}` : "") ||
      (eta?.live?.promisedDeliveryAt ?? eta?.stageAware?.promisedAt ?? "").trim() ||
      (eta?.stageAware
        ? `v:${eta.stageAware.etaVersion}:${eta.stageAware.currentStage}:${eta.stageAware.riderToMerchantEta ?? "n"}:${eta.stageAware.lastUpdatedAt}`
        : "") ||
      `none`;

    // Restart tracking key when server pushes a new target (avoids stale hold).
    if (heldRef.current.promiseKey !== promiseKey) {
      heldRef.current.promiseKey = promiseKey;
    }

    const gpsUnavailable =
      hasRider && !riderArrived && (motionState.gpsStale || !riderSample);

    const arrivingSoon =
      eta?.stageAware?.currentStage === "ARRIVING" ||
      isArrivingSoon({
        remainingDistanceM,
        etaMinutes: minutes,
        mapPhase,
        riderArrived,
      });

    const phase = resolveLiveEtaPhase({
      status: orderStatus,
      mapPhase,
      hasRider,
      riderArrived,
      arrivingSoon,
      waitingAtStore,
      serverStage: eta?.stageAware?.currentStage ?? null,
    });

    const confidence =
      eta?.stageAware?.confidence === "HIGH"
        ? ("high" as const)
        : eta?.stageAware?.confidence === "LOW"
          ? ("low" as const)
          : eta?.stageAware?.confidence === "MEDIUM"
            ? ("medium" as const)
            : resolveEtaConfidence({
                gpsStale: gpsUnavailable,
                stuck: stuckRider,
                accuracyMeters,
                merchantDelayed: isMerchantEtaDelayed(eta),
                hasMovementEta: false,
              });

    const pauseCountdown =
      waitingAtStore ||
      stuckRider ||
      eta?.stageAware?.freezeCountdown === true;

    const frozenForDelay =
      pauseCountdown &&
      !arrivingSoon &&
      !riderArrived &&
      (isMerchantEtaDelayed(eta) || stuckRider);

    auditReason = "tick";
    if (isEtaUpdatedFromPromise(eta)) auditReason = "server_promise_bump";
    else if (isMerchantEtaDelayed(eta)) auditReason = "merchant_delay";
    if (stuckRider) auditReason = "stuck_rider";
    if (gpsUnavailable) auditReason = "gps_unavailable";
    if (arrivingSoon) auditReason = "arriving";
    if (waitingAtStore) auditReason = "waiting_at_store";

    result = {
      minutes,
      frozenForDelay,
      arrivingSoon,
      stuckRider,
      gpsUnavailable,
      confidence,
      phase,
      countdownPaused: pauseCountdown,
      nowMs,
    };
  }

  useEffect(() => {
    if (!active || !orderId) return;
    if (
      result.minutes === heldRef.current.lastLogged &&
      auditReason === heldRef.current.lastReason
    ) {
      return;
    }
    heldRef.current.lastLogged = result.minutes;
    heldRef.current.lastReason = auditReason;
    pushEtaAudit({
      orderId,
      etaMinutes: result.minutes,
      reason: auditReason,
      phase: result.phase,
    });
  }, [active, orderId, result.minutes, result.phase, auditReason]);

  return result;
}
