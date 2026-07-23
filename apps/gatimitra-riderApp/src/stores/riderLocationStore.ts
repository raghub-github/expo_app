import { create } from "zustand";
import {
  getDeviceLocationReadiness,
  type DeviceLocationReadiness,
  type LocationPermissionStatus,
  type ValidatedCoords,
} from "@gatimitra/expo-location-kit";
import type { AddressData } from "@/src/services/location/reverseGeocoding";

export type RiderLocationState = {
  permissionStatus: LocationPermissionStatus;
  servicesEnabled: boolean;
  readinessHydrated: boolean;
  loading: boolean;
  error: string | null;
  coords: ValidatedCoords | null;
  address: AddressData | null;
  updatedAtMs: number | null;
  /** Monotonic acquisition token — stale async commits are ignored. */
  acquisitionSeq: number;
  hydrateReadiness: () => Promise<DeviceLocationReadiness>;
  setReadiness: (readiness: DeviceLocationReadiness) => void;
  beginAcquisition: () => number;
  commitAcquisition: (
    seq: number,
    payload: {
      coords: ValidatedCoords;
      address: AddressData | null;
    }
  ) => boolean;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearFix: () => void;
};

export const useRiderLocationStore = create<RiderLocationState>((set, get) => ({
  permissionStatus: "undetermined",
  servicesEnabled: false,
  readinessHydrated: false,
  loading: false,
  error: null,
  coords: null,
  address: null,
  updatedAtMs: null,
  acquisitionSeq: 0,

  hydrateReadiness: async () => {
    const readiness = await getDeviceLocationReadiness();
    set({
      permissionStatus: readiness.permissionStatus,
      servicesEnabled: readiness.servicesEnabled,
      readinessHydrated: true,
    });
    return readiness;
  },

  setReadiness: (readiness) => {
    set({
      permissionStatus: readiness.permissionStatus,
      servicesEnabled: readiness.servicesEnabled,
      readinessHydrated: true,
    });
  },

  beginAcquisition: () => {
    const seq = get().acquisitionSeq + 1;
    set({ acquisitionSeq: seq, loading: true, error: null });
    return seq;
  },

  commitAcquisition: (seq, payload) => {
    if (seq !== get().acquisitionSeq) return false;
    set({
      coords: payload.coords,
      address: payload.address,
      loading: false,
      error: null,
      updatedAtMs: Date.now(),
      permissionStatus: "granted",
      servicesEnabled: true,
    });
    return true;
  },

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error, loading: false }),

  clearFix: () =>
    set({
      coords: null,
      address: null,
      updatedAtMs: null,
    }),
}));
