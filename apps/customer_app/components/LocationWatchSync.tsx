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
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import { syncActiveLocationFromStore } from "@/lib/syncActiveLocationFromStore";

/**
 * Keep live GPS updated while the app is foregrounded (when not on an explicit
 * selected pin). Debounces merchant refresh to significant moves (~350m).
 */
export function LocationWatchSync() {
  const queryClient = useQueryClient();
  const locationSource = useLocationStore((s) => s.locationSource);
  const permissionStatus = useLocationStore((s) => s.permissionStatus);
  const lastAppliedRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (permissionStatus !== "granted") return;
    if (locationSource === "selected") return;

    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: LOCATION_SIGNIFICANT_MOVE_METERS,
            timeInterval: 30_000,
          },
          (loc) => {
            if (cancelled) return;
            if (AppState.currentState !== "active") return;
            if (useLocationStore.getState().locationSource === "selected") return;

            const next = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            };
            const prev = lastAppliedRef.current ?? useLocationStore.getState().coords;
            if (!coordsMovedSignificantly(prev, next)) return;

            lastAppliedRef.current = next;
            useLocationStore.setState({ coords: next, locationSource: "current" });
            void useLocationStore.getState().clearPersistedSelection();

            if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
            geocodeTimerRef.current = setTimeout(() => {
              void (async () => {
                try {
                  const address = await reverseGeocode(next.longitude, next.latitude);
                  if (useLocationStore.getState().locationSource === "selected") return;
                  useLocationStore.setState({ address, locationSource: "current" });
                  await syncActiveLocationFromStore();
                  void invalidateFoodHomeLocationQueries(queryClient);
                } catch {
                  void invalidateFoodHomeLocationQueries(queryClient);
                }
              })();
            }, 400);
          }
        );
      } catch {
        // watchPosition may fail on some devices; resume/bootstrap still refresh GPS.
      }
    };

    void start();

    return () => {
      cancelled = true;
      subscription?.remove();
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [permissionStatus, locationSource, queryClient]);

  return null;
}
