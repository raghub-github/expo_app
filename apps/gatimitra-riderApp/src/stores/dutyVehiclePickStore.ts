import { create } from "zustand";
import type { RiderVehicleView } from "@/src/services/api/riderApi";

type PickState = {
  vehicles: RiderVehicleView[];
  initialId: number | null;
  resolve: ((id: number | null) => void) | null;
};

type Store = PickState & {
  request: (vehicles: RiderVehicleView[], initialId: number | null) => Promise<number | null>;
  cancel: () => void;
  confirm: (id: number) => void;
};

export const useDutyVehiclePickStore = create<Store>((set, get) => ({
  vehicles: [],
  initialId: null,
  resolve: null,
  request: (vehicles, initialId) =>
    new Promise((resolve) => {
      get().resolve?.(null);
      set({ vehicles, initialId, resolve });
    }),
  cancel: () => {
    const { resolve } = get();
    set({ vehicles: [], initialId: null, resolve: null });
    resolve?.(null);
  },
  confirm: (id) => {
    const { resolve } = get();
    set({ vehicles: [], initialId: null, resolve: null });
    resolve?.(id);
  },
}));
