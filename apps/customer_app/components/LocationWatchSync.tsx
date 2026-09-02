import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLocationStore,
  coordsMovedSignificantly,
  LOCATION_SIGNIFICANT_MOVE_METERS,
} from "@/store/locationStore";
import { reverseGeocode } from "@/services/location.service";
import { saveLastKnownLocation } from "@/lib/lastKnownLocationCache";
import { debouncedInvalidateFoodHomeListingQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import { syncActiveLocationFromStore } from "@/lib/syncActiveLocationFromStore";
import { useActiveLocationReconcileReady } from "@/hooks/useActiveLocationReconcileReady";

/**
 * Keep GPS fresh while the app is foregrounded (when not on an explicit
 * selected pin). Uses periodic low-accuracy reads — not a continuous
 * watchPosition subscription, which kept the GPS radio awake and heated phones.
 */
const FOREGROUND_GPS_POLL_MS = 90_000;

export function LocationWatchSync() {
  const queryClient = useQueryClient();
  const locationSource = useLocationStore((s) => s.locationSource);
  const permissionStatus = useLocationStore((s) => s.permissionStatus);
  const reconcileReady = useActiveLocationReconcileReady();
  const lastAppliedRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    if (permissionStatus !== "granted") return;
    if (locationSource === "selected") return;
    if (!reconcileReady) return;

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
      const tsMs = typeof loc.timestamp === "number" ? loc.timestamp : Date.now();
      const prev = lastAppliedRef.current ?? useLocationStore.getState().coords;
      if (!coordsMovedSignificantly(prev, next, LOCATION_SIGNIFICANT_MOVE_METERS)) return;

      lastAppliedRef.current = next;
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

      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
      geocodeTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const address = await reverseGeocode(next.longitude, next.latitude);
            if (useLocationStore.getState().locationSource === "selected") return;
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
            debouncedInvalidateFoodHomeListingQueries(queryClient);
          } catch {
            debouncedInvalidateFoodHomeListingQueries(queryClient);
          }
        })();
      }, 400);
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
  }, [permissionStatus, locationSource, reconcileReady, queryClient]);

  return null;
}
