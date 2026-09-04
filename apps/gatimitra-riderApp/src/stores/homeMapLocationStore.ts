import { create } from "zustand";

/** Home-map GPS pin — only RiderMapView (and similar) should subscribe. */
export type HomeMapGpsFix = {
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMps?: number;
  heading?: number;
  tsMs: number;
};

type HomeMapLocationState = {
  fix: HomeMapGpsFix | null;
  setFix: (fix: HomeMapGpsFix | null) => void;
};

export const useHomeMapLocationStore = create<HomeMapLocationState>((set) => ({
  fix: null,
  setFix: (fix) => set({ fix }),
}));
