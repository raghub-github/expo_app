import { useEffect, useMemo, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as Location from "expo-location";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useActiveOrders } from "@/src/hooks/useOrders";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import {
  createForegroundLocationTracker,
  type LocationTrackerState,
} from "@/src/services/location/locationTracker";
import { pingLocation } from "@/src/services/location/locationPinger";
import type { RiderLocationFix } from "@/src/services/location/types";
import { riderDispatchLog } from "@/src/lib/rider-dispatch-log";

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
 * Keeps rider_current_locations fresh while on duty so dispatch pool / offers work
 * on every screen (not only the Orders map tab).
 */
export function useRiderDutyLocationPing(): void {
  const session = useSessionStore((s) => s.session);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const { data: activeOrders = [] } = useActiveOrders();
  const hasActiveOrder = activeOrders.length > 0;
  const tracker = useMemo(() => createForegroundLocationTracker(), []);
  const lastPingAtRef = useRef(0);
  const recommendedIntervalRef = useRef(PING_INTERVAL_IDLE_MS);

  useEffect(() => {
    if (!isOnDuty) {
      void tracker.stop();
      return;
    }
    void tracker.start();
    return () => {
      void tracker.stop();
    };
  }, [isOnDuty, tracker]);

  useEffect(() => {
    if (!isOnDuty || !session) return;

    const pingFromState = (state: LocationTrackerState) => {
      if (state.status !== "tracking" || !state.lastFix) return;
      const fix = state.lastFix;
      const minIntervalMs = resolveClientPingIntervalMs({
        hasActiveOrder,
        speedMps: fix.speedMps,
        serverRecommendedMs: recommendedIntervalRef.current,
      });
      const now = Date.now();
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
  }, [hasActiveOrder, isOnDuty, session, tracker]);

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
      return state.lastFix;
    }
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") return null;
      const loc =
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null)) ??
        (await Location.getLastKnownPositionAsync({ maxAge: 300_000 }));
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
    if (!isOnDuty || !session) return;

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
      if (next !== "active" || !isOnDuty) return;
      void (async () => {
        await tracker.stop();
        await tracker.start();
        await refreshLocation("app_foreground");
      })();
    });

    return () => {
      clearInterval(stalePingId);
      appStateSub.remove();
    };
  }, [hasActiveOrder, isOnDuty, session, tracker]);
}
