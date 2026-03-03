/**
 * Location global state - permission, coords, reverse-geocoded address.
 * Requests permission on init; shows modal when permission not granted.
 */

import { create } from "zustand";
import * as Location from "expo-location";
import { reverseGeocode, type ReverseGeocodeResult } from "@/services/location.service";

export type LocationPermissionStatus = "undetermined" | "granted" | "denied";

type LocationState = {
  permissionStatus: LocationPermissionStatus;
  loading: boolean;
  error: string | null;
  coords: { latitude: number; longitude: number } | null;
  address: ReverseGeocodeResult | null;
  showPermissionModal: boolean;
  requestPermissionAndFetch: () => Promise<void>;
  setShowPermissionModal: (show: boolean) => void;
  setAddress: (address: ReverseGeocodeResult | null) => void;
  setAddressAndCoords: (
    address: ReverseGeocodeResult,
    coords: { latitude: number; longitude: number }
  ) => void;
  refetchLocation: () => Promise<void>;
};

export const useLocationStore = create<LocationState>((set, get) => ({
  permissionStatus: "undetermined",
  loading: false,
  error: null,
  coords: null,
  address: null,
  showPermissionModal: false,

  setShowPermissionModal: (show) => set({ showPermissionModal: show }),

  setAddress: (address) => set({ address }),

  setAddressAndCoords: (address, coords) => set({ address, coords }),

  requestPermissionAndFetch: async () => {
    set({ loading: true, error: null });
    try {
      const { status: existing } = await Location.getForegroundPermissionsAsync();
      if (existing === "granted") {
        set({ permissionStatus: "granted", showPermissionModal: false });
        // Show last-known position instantly, then refine with current position
        try {
          const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
          if (lastKnown?.coords) {
            const { latitude, longitude } = lastKnown.coords;
            set({ coords: { latitude, longitude } });
            reverseGeocode(longitude, latitude).then((address) => set({ address }));
          }
        } catch {
          // ignore; we'll use getCurrentPositionAsync result
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude, longitude } = loc.coords;
        set({ coords: { latitude, longitude } });
        const address = await reverseGeocode(longitude, latitude);
        set({ address, loading: false });
        return;
      }
      if (existing === "denied") {
        set({
          permissionStatus: "denied",
          showPermissionModal: true,
          loading: false,
        });
        return;
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        set({ permissionStatus: "granted", showPermissionModal: false });
        try {
          const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
          if (lastKnown?.coords) {
            const { latitude, longitude } = lastKnown.coords;
            set({ coords: { latitude, longitude } });
            reverseGeocode(longitude, latitude).then((address) => set({ address }));
          }
        } catch {
          // ignore
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude, longitude } = loc.coords;
        set({ coords: { latitude, longitude } });
        const address = await reverseGeocode(longitude, latitude);
        set({ address, loading: false });
      } else {
        set({
          permissionStatus: "denied",
          showPermissionModal: true,
          loading: false,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location error";
      set({
        error: message,
        loading: false,
        showPermissionModal: true,
      });
    }
  },

  refetchLocation: async () => {
    const { permissionStatus, coords } = get();
    if (permissionStatus !== "granted" || !coords) return;
    set({ loading: true, error: null });
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = loc.coords;
      set({ coords: { latitude, longitude } });
      const address = await reverseGeocode(longitude, latitude);
      set({ address, loading: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Location error";
      set({ error: message, loading: false });
    }
  },
}));
