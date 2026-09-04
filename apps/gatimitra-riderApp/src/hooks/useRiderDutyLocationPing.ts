import { useEffect, useMemo, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useActiveOrders } from "@/src/hooks/useOrders";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import {
  createForegroundLocationTracker,
  LOCATION_ENGINE_PROFILES,
  type LocationTrackerState,
} from "@/src/services/location/locationTracker";
import { pingLocation } from "@/src/services/location/locationPinger";
import type { RiderLocationFix } from "@/src/services/location/types";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";
import { riderDispatchLog } from "@/src/lib/rider-dispatch-log";
import { shouldSkipCoalescedFix, COALESCE_IDLE_HOME_MOVE_M, COALESCE_IDLE_HOME_HEADING_DEG, type CoalesceFixSnapshot } from "@/src/lib/coalesceLocationUi";

/** Offline — no tracking (handled by isOnDuty guard). */
const PING_INTERVAL_IDLE_MS = 30_000;
const PING_INTERVAL_MOVING_MS = 10_000;
const PING_INTERVAL_ACTIVE_ORDER_MS = 5_000;
const PING_INTERVAL_HIGH_SPEED_MS = 3_000;
const HIGH_SPEED_MPS = 22;
const MOVING_SPEED_MPS = 1.5;

function resolveClientPingIntervalMs(args: {
  hasActiveOrder: boolean;
  speedMps?: number;
  serverRecommendedMs?: number;
}): number {
  if (args.serverRecommendedMs != null && args.serverRecommendedMs > 0) {
    return args.serverRecommendedMs;
  }
  const speed = args.speedMps ?? 0;
  if (speed >= HIGH_SPEED_MPS) return PING_INTERVAL_HIGH_SPEED_MS;
  if (args.hasActiveOrder) return PING_INTERVAL_ACTIVE_ORDER_MS;
  if (speed >= MOVING_SPEED_MPS) return PING_INTERVAL_MOVING_MS;
  return PING_INTERVAL_IDLE_MS;
}

/**
 * Keeps rider_current_locations fresh while on duty (or mid-delivery) so
 * dispatch pool / offers work on every screen (not only the Orders map tab).
 * Background GPS continues for active orders even if the rider toggles OFF duty.
 */
export function useRiderDutyLocationPing(): void {
  const session = useSessionStore((s) => s.session);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const { data: activeOrders = [], isFetched: activeOrdersFetched } = useActiveOrders();
  const hasActiveOrder = activeOrders.length > 0;
  const shouldTrack = isOnDuty || hasActiveOrder;
  const tracker = useMemo(
    () =>
      createForegroundLocationTracker({
        profileId: "duty-ping",
        ...(hasActiveOrder
          ? LOCATION_ENGINE_PROFILES.activeOrderBg
          : LOCATION_ENGINE_PROFILES.dutyIdleBg),
      }),
    [hasActiveOrder]
  );
  const lastPingAtRef = useRef(0);
  const recommendedIntervalRef = useRef(PING_INTERVAL_IDLE_MS);

  useEffect(() => {
    // Cold start: active orders may still be loading — never stop BG until we know.
    if (!activeOrdersFetched && !isOnDuty) {
      void import("@/src/services/location/riderBackgroundLocationTask").then((m) =>
        m.ensureRiderBackgroundLocationRunning()
      );
      return;
    }
    if (!shouldTrack) {
      void tracker.stop();
      void import("@/src/services/location/riderBackgroundLocationTask").then((m) =>
        m.stopRiderBackgroundLocation()
      );
      return;
    }
    void tracker.start();
    void import("@/src/services/location/riderBackgroundLocationTask").then((m) =>
      m.startRiderBackgroundLocation(hasActiveOrder ? "active_order" : "duty")
    );
    return () => {
      void tracker.stop();
    };
  }, [shouldTrack, hasActiveOrder, activeOrdersFetched, isOnDuty, tracker]);

  // Process recreation / cold start: restore BG updates from persisted mode flag.
  useEffect(() => {
    void import("@/src/services/location/riderBackgroundLocationTask").then((m) =>
      m.ensureRiderBackgroundLocationRunning()
    );
  }, []);

  useEffect(() => {
    if (!shouldTrack || !session) return;

    const lastUiFixRef: { current: CoalesceFixSnapshot | null } = { current: null };
    const pingFromState = (state: LocationTrackerState) => {
      if (state.status !== "tracking" || !state.lastFix) return;
      const fix = state.lastFix;
      const now = Date.now();
      if (!shouldSkipCoalescedFix(lastUiFixRef.current, fix, now, hasActiveOrder
        ? undefined
        : { minMoveM: COALESCE_IDLE_HOME_MOVE_M, minHeadingDeg: COALESCE_IDLE_HOME_HEADING_DEG }
      )) {
        lastUiFixRef.current = {
          lat: fix.lat,
          lng: fix.lng,
          heading: fix.headingDeg,
          atMs: now,
        };
        // Mirror live duty fix into global rider location state (no reverse-geocode spam).
        useRiderLocationStore.setState({
          coords: {
            latitude: fix.lat,
            longitude: fix.lng,
            accuracy: fix.accuracyM ?? null,
          },
          permissionStatus: "granted",
          servicesEnabled: true,
          updatedAtMs: fix.tsMs,
        });
      }
      const minIntervalMs = resolveClientPingIntervalMs({
        hasActiveOrder,
        speedMps: fix.speedMps,
        serverRecommendedMs: recommendedIntervalRef.current,
      });
      if (now - lastPingAtRef.current < minIntervalMs) return;
      lastPingAtRef.current = now;
      void (async () => {
        try {
          const deviceId = await getOrCreateDeviceId();
          const res = await pingLocation({ session, deviceId, fix });
          if (res.recommendedPingIntervalMs) {
            recommendedIntervalRef.current = res.recommendedPingIntervalMs;
          }
        } catch {
          // non-blocking — pool poll still runs
        }
      })();
    };

    return tracker.subscribe(pingFromState);
  }, [hasActiveOrder, shouldTrack, session, tracker]);

  const sendLocationPing = async (fix: RiderLocationFix) => {
    if (!session) return;
    const minIntervalMs = resolveClientPingIntervalMs({
      hasActiveOrder,
      speedMps: fix.speedMps,
      serverRecommendedMs: recommendedIntervalRef.current,
    });
    const now = Date.now();
    if (now - lastPingAtRef.current < minIntervalMs) return;
    lastPingAtRef.current = now;
    try {
      const deviceId = await getOrCreateDeviceId();
      const res = await pingLocation({ session, deviceId, fix });
      if (res.recommendedPingIntervalMs) {
        recommendedIntervalRef.current = res.recommendedPingIntervalMs;
      }
      riderDispatchLog("location ping sent");
    } catch {
      /* non-blocking */
    }
  };

  const resolveFixForPing = async (): Promise<RiderLocationFix | null> => {
    const state = tracker.getState();
    if (state.status === "tracking" && state.lastFix) {
      const ageMs = Date.now() - state.lastFix.tsMs;
      if (ageMs <= 45_000) return state.lastFix;
    }
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") return null;
      const loc = await Location.getLastKnownPositionAsync({
        maxAge: 45_000,
        requiredAccuracy: 200,
      });
      if (!loc) return null;
      const c = loc.coords;
      return {
        tsMs: loc.timestamp,
        lat: c.latitude,
        lng: c.longitude,
        accuracyM: c.accuracy ?? undefined,
        altitudeM: c.altitude ?? undefined,
        speedMps: c.speed ?? undefined,
        headingDeg: c.heading ?? undefined,
        provider: "unknown",
      };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!shouldTrack || !session) return;

    const refreshLocation = async (reason: string) => {
      riderDispatchLog(`location refresh (${reason})`);
      const fix = await resolveFixForPing();
      if (fix) await sendLocationPing(fix);
    };

    const staleIntervalMs = Math.max(
      recommendedIntervalRef.current,
      PING_INTERVAL_IDLE_MS
    );
    const stalePingId = setInterval(() => {
      if (AppState.currentState !== "active") return;
      void refreshLocation("periodic");
    }, staleIntervalMs);

    const appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (!shouldTrack) return;
      if (next === "active") {
        void refreshLocation("app_foreground");
        return;
      }
      void import("@/src/services/location/riderBackgroundLocationTask").then((m) =>
        m.startRiderBackgroundLocation(hasActiveOrder ? "active_order" : "duty")
      );
    });

    return () => {
      clearInterval(stalePingId);
      appStateSub.remove();
    };
  }, [hasActiveOrder, shouldTrack, session, tracker]);
}
