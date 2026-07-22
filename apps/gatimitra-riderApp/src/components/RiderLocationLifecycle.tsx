import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import {
  acquireAndCommitRiderLocation,
} from "@/src/services/location/riderLocationController";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";
import { getDeviceLocationReadiness } from "@gatimitra/expo-location-kit";

const STALE_FIX_MS = 5 * 60_000;

/**
 * Root lifecycle: hydrate readiness, refresh on foreground, clear stale/missing
 * location without requiring restart. Does not start duty tracking (that stays
 * in RiderDutyLocationPing).
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
    const refreshIfNeeded = async () => {
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
        const stale =
          !coords ||
          updatedAtMs == null ||
          Date.now() - updatedAtMs > STALE_FIX_MS;
        if (stale) {
          await acquireAndCommitRiderLocation({ assumeReady: true });
        }
      } catch {
        // Non-blocking — duty ping / navigation still use their own trackers.
      } finally {
        refreshingRef.current = false;
      }
    };

    void refreshIfNeeded();

    const onChange = (next: AppStateStatus) => {
      if (next === "active") {
        void refreshIfNeeded();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [setReadiness, clearFix]);

  return null;
}
