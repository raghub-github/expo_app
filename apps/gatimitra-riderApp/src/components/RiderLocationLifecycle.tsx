import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { acquireAndCommitRiderLocation } from "@/src/services/location/riderLocationController";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";
import { getDeviceLocationReadiness } from "@gatimitra/expo-location-kit";
import { getSharedLocationEngine } from "@/src/services/location/locationTracker";
import {
  reconcileForegroundLocationPermission,
  wireForegroundLocationPermissionAppStateOnce,
} from "@/src/lib/riderForegroundLocationGate";

/** Drop a store marker only when it is truly stale — not on every 8s foreground. */
const STALE_FIX_MS = 120_000;
/** Prefer the shared watch over a parallel Highest getCurrentPosition. */
const ENGINE_FRESH_MS = 45_000;

/**
 * Root lifecycle: seed the global location store on cold start and foreground.
 * Idle Home must not start a Highest-accuracy GPS burst — the shared duty watch
 * (or a fast last-known) is enough. Navigation uses the High profile (not Highest).
 *
 * Does NOT HTTP-ping the backend. Location POST ownership is exclusive to
 * useRiderDutyLocationPing (+ background task) to prevent duplicate pings.
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
    return wireForegroundLocationPermissionAppStateOnce();
  }, []);

  useEffect(() => {
    const refreshFreshGps = async (_reason: "mount" | "foreground") => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      try {
        await reconcileForegroundLocationPermission();
        const readiness = await getDeviceLocationReadiness();
        setReadiness(readiness);
        if (!readiness.isReady) {
          clearFix();
          return;
        }

        const engineState = getSharedLocationEngine().getState();
        const engineFix = engineState.status === "tracking" ? engineState.lastFix : undefined;
        const engineFresh =
          !!engineFix && Number.isFinite(engineFix.tsMs) && Date.now() - engineFix.tsMs <= ENGINE_FRESH_MS;

        const { coords, updatedAtMs } = useRiderLocationStore.getState();
        const ageMs =
          coords && updatedAtMs != null ? Date.now() - updatedAtMs : Number.POSITIVE_INFINITY;
        if (ageMs > STALE_FIX_MS && !engineFresh) {
          clearFix();
        }

        if (engineFresh && engineFix) {
          useRiderLocationStore.setState({
            coords: {
              latitude: engineFix.lat,
              longitude: engineFix.lng,
              accuracy: engineFix.accuracyM ?? null,
            },
            permissionStatus: "granted",
            servicesEnabled: true,
            updatedAtMs: engineFix.tsMs,
            loading: false,
            error: null,
          });
          return;
        }

        // Local store seed only — no backend ping (duty pipeline owns HTTP).
        await acquireAndCommitRiderLocation({
          assumeReady: true,
          preferFast: true,
        });
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
