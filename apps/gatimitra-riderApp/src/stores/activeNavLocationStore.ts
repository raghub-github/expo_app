import { create } from "zustand";

/**
 * High-frequency nav location for map-only consumers.
 * The navigation screen shell / sheets must NOT subscribe to `smoothed`.
 */
export type ActiveNavGpsFix = {
  lat: number;
  lng: number;
  headingDeg?: number;
  speedMps?: number;
};

type ActiveNavLocationState = {
  orderId: string | null;
  /** Coalesced GPS (route / geo / reroute). */
  raw: ActiveNavGpsFix | null;
  /**
   * Throttled remaining meters for sheet ETA chips (~1 Hz).
   * Avoids sheet re-renders on every GPS sample.
   */
  sheetRemainingM: number | null;
  setOrderId: (orderId: string | null) => void;
  setRaw: (fix: ActiveNavGpsFix | null) => void;
  setSheetRemainingM: (m: number | null) => void;
};

export const useActiveNavLocationStore = create<ActiveNavLocationState>((set) => ({
  orderId: null,
  raw: null,
  sheetRemainingM: null,
  setOrderId: (orderId) => set({ orderId }),
  setRaw: (raw) => set({ raw }),
  setSheetRemainingM: (sheetRemainingM) => set({ sheetRemainingM }),
}));
