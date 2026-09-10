import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import {
  useLocationStore,
  coordsMovedSignificantly,
} from "@/store/locationStore";
import { reverseGeocode } from "@/services/location.service";
import { saveLastKnownLocation } from "@/lib/lastKnownLocationCache";
import {
  invalidateFoodHomeListingQueriesAfterMove,
} from "@/lib/invalidateFoodHomeLocationQueries";
import { syncActiveLocationFromStore } from "@/lib/syncActiveLocationFromStore";
import { useActiveLocationReconcileReady } from "@/hooks/useActiveLocationReconcileReady";
import { thermalAudit } from "@/lib/thermalAudit";
import { isRawCoordinateText } from "@/lib/isRawCoordinateText";

/**
 * Keep GPS fresh while the app is foregrounded (when not on an explicit
 * selected pin). Periodic low-accuracy reads — not continuous watchPosition
 * (thermal). Tuned so meaningful physical movement updates header + stores
 * promptly without reacting to GPS jitter.
 */
/** Poll often enough that walking/driving to a new area is noticed quickly. */
const FOREGROUND_GPS_POLL_MS = 20_000;
/**
 * Customer discovery move gate — smaller than package reconcile (350 m).
 * Ignores GPS noise; still updates when the user actually changes area.
 */
const CUSTOMER_GPS_MOVE_METERS = 100;
/** Drop only absurdly bad Low-accuracy fixes (meters). */
const MAX_ACCEPT_ACCURACY_M = 500;

export function LocationWatchSync() {
  const queryClient = useQueryClient();
  const hasSession = useAuthStore((s) => !!s.session);
  const locationSource = useLocationStore((s) => s.locationSource);
  const permissionStatus = useLocationStore((s) => s.permissionStatus);
  const reconcileReady = useActiveLocationReconcileReady();
  const lastAppliedRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlightRef = useRef(false);
  /** Bumps on every accepted GPS apply — stale reverse-geocode results are dropped. */
  const geocodeSeqRef = useRef(0);

  useEffect(() => {
    if (permissionStatus !== "granted") return;
    if (locationSource === "selected") return;
    if (!reconcileReady) return;
    if (!hasSession) return;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const applyGpsFix = (loc: Location.LocationObject) => {
      if (cancelled) return;
      if (AppState.currentState !== "active") return;
      if (useLocationStore.getState().locationSource === "selected") return;

      const next = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      };
      const accuracy =
        typeof loc.coords.accuracy === "number" ? loc.coords.accuracy : null;
      if (accuracy != null && accuracy > MAX_ACCEPT_ACCURACY_M) return;

      const tsMs = typeof loc.timestamp === "number" ? loc.timestamp : Date.now();
      const prev = lastAppliedRef.current ?? useLocationStore.getState().coords;
      if (!coordsMovedSignificantly(prev, next, CUSTOMER_GPS_MOVE_METERS)) return;

      lastAppliedRef.current = next;
      const geocodeSeq = ++geocodeSeqRef.current;
      thermalAudit("GPS_UPDATE", { source: "foreground_poll" });

      // 1) Coords update immediately — listings/header consumers react now.
      useLocationStore.setState({
        coords: next,
        coordsAccuracy: accuracy,
        coordsUpdatedAt: tsMs,
        coordsSource: "watch",
        locationFreshness: "FRESH",
        locationSource: "current",
      });
      saveLastKnownLocation({
        lat: next.latitude,
        lon: next.longitude,
        accuracy,
        updatedAt: tsMs,
        source: "watch",
        address: useLocationStore.getState().address,
      });
      void useLocationStore.getState().clearPersistedSelection();

      // 2) Store filtering must not wait on reverse geocode.
      invalidateFoodHomeListingQueriesAfterMove(queryClient);

      // 3) Resolve place name in parallel; never overwrite with raw coordinates.
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
      geocodeTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const address = await reverseGeocode(next.longitude, next.latitude);
            if (cancelled) return;
            if (geocodeSeq !== geocodeSeqRef.current) return;
            if (useLocationStore.getState().locationSource === "selected") return;

            const secondary = address.secondary?.trim() ?? "";
            const full = address.fullAddress?.trim() ?? "";
            if (isRawCoordinateText(secondary) || isRawCoordinateText(full)) {
              // Keep previous human-readable place; coords already updated.
              return;
            }

            useLocationStore.setState({ address, locationSource: "current" });
            saveLastKnownLocation({
              lat: next.latitude,
              lon: next.longitude,
              accuracy: useLocationStore.getState().coordsAccuracy,
              updatedAt: useLocationStore.getState().coordsUpdatedAt ?? Date.now(),
              source: "watch",
              address,
            });
            await syncActiveLocationFromStore();
          } catch {
            // Keep prior place name — never flash lat,lng on geocode failure.
          }
        })();
      }, 250);
    };

    const pollGps = async () => {
      if (cancelled || pollInFlightRef.current) return;
      if (AppState.currentState !== "active") return;
      if (useLocationStore.getState().locationSource === "selected") return;
      pollInFlightRef.current = true;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });
        applyGpsFix(loc);
      } catch {
        // getCurrentPosition may fail on some devices; resume/bootstrap still refresh GPS.
      } finally {
        pollInFlightRef.current = false;
      }
    };

    const startPolling = () => {
      if (pollTimer) return;
      void pollGps();
      pollTimer = setInterval(() => {
        void pollGps();
      }, FOREGROUND_GPS_POLL_MS);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    if (AppState.currentState === "active") startPolling();

    const sub = AppState.addEventListener("change", (state) => {
      if (cancelled) return;
      if (state === "active") {
        startPolling();
        void pollGps();
      } else {
        stopPolling();
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
      stopPolling();
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [permissionStatus, locationSource, reconcileReady, queryClient, hasSession]);

  return null;
}
