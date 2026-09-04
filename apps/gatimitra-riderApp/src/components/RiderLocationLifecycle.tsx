import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { acquireAndCommitRiderLocation } from "@/src/services/location/riderLocationController";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getDeviceLocationReadiness } from "@gatimitra/expo-location-kit";
import { getSharedLocationEngine } from "@/src/services/location/locationTracker";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { pingLocation } from "@/src/services/location/locationPinger";

/** Drop a store marker only when it is truly stale — not on every 8s foreground. */
const STALE_FIX_MS = 120_000;
/** Prefer the shared watch over a parallel Highest getCurrentPosition. */
const ENGINE_FRESH_MS = 45_000;

/**
 * Root lifecycle: seed the global location store on cold start and foreground.
 * Idle Home must not start a Highest-accuracy GPS burst — the shared duty watch
 * (or a fast last-known) is enough. Navigation uses the High profile (not Highest).
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

        const result = await acquireAndCommitRiderLocation({
          assumeReady: true,
          preferFast: true,
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
