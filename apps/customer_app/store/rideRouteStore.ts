import { create } from "zustand";
import type { RideRouteSnapshot } from "@/lib/ride-route-snapshot";

type RideRouteStore = {
  routeKey: string | null;
  snapshot: RideRouteSnapshot | null;
  setRouteSnapshot: (routeKey: string, snapshot: RideRouteSnapshot) => void;
  clearRouteSnapshot: () => void;
};

export const useRideRouteStore = create<RideRouteStore>((set) => ({
  routeKey: null,
  snapshot: null,
  setRouteSnapshot: (routeKey, snapshot) => set({ routeKey, snapshot }),
  clearRouteSnapshot: () => set({ routeKey: null, snapshot: null }),
}));
