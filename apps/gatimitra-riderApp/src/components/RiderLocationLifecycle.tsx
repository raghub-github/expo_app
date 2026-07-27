import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { acquireAndCommitRiderLocation } from "@/src/services/location/riderLocationController";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getDeviceLocationReadiness } from "@gatimitra/expo-location-kit";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { pingLocation } from "@/src/services/location/locationPinger";

/** Do not paint the map with a fix older than this. */
const FRESH_FIX_MS = 8_000;

/**
 * Root lifecycle: on cold start, warm start, and every return to foreground,
 * always request a fresh GPS fix before the map may show a rider position.
 * Stale / cached coordinates are cleared immediately when older than FRESH_FIX_MS.
 */
export function RiderLocationLifecycle() {
  const hydrateReadiness = useRiderLocationStore((s) => s.hydrateReadiness);
  const setReadiness = useRiderLocationStore((s) => s.setReadiness);
  const clearFix = useRiderLocationStore((s) => s.clearFix);
  const refreshingRef = useRef(false);

  useEffect(() => {
    void hydrateReadiness();
  }, [hydrateReadiness]);

  useEffect(() => {
    const refreshFreshGps = async (_reason: "mount" | "foreground") => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        const readiness = await getDeviceLocationReadiness();
        setReadiness(readiness);
        if (!readiness.isReady) {
          clearFix();
          return;
        }

        const { coords, updatedAtMs } = useRiderLocationStore.getState();
        const ageMs =
          coords && updatedAtMs != null ? Date.now() - updatedAtMs : Number.POSITIVE_INFINITY;
        // Never keep a stale marker on screen while we wait for a fresh fix.
        if (ageMs > FRESH_FIX_MS) {
          clearFix();
        }

        const result = await acquireAndCommitRiderLocation({
          assumeReady: true,
          requireFresh: true,
        });
        if (!result.ok) return;

        // Push fresh coords to backend immediately so customers/merchants see the new position.
        const session = useSessionStore.getState().session;
        const isOnDuty = useDutyStore.getState().isOnDuty;
        if (session && isOnDuty) {
          try {
            const deviceId = await getOrCreateDeviceId();
            await pingLocation({
              session,
              deviceId,
              fix: {
                tsMs: Date.now(),
                lat: result.coords.latitude,
                lng: result.coords.longitude,
                accuracyM: result.coords.accuracy ?? undefined,
              },
            });
          } catch {
            // Non-blocking — continuous duty ping still runs.
          }
        }
      } catch {
        // Non-blocking — duty ping / navigation still use their own trackers.
      } finally {
        refreshingRef.current = false;
      }
    };

    void refreshFreshGps("mount");

    const onChange = (next: AppStateStatus) => {
      if (next === "active") {
        void refreshFreshGps("foreground");
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [setReadiness, clearFix]);

  return null;
}
