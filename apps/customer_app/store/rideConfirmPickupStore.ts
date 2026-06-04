import { create } from "zustand";

export type RideConfirmPickupResult = {
  primary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
};

type RideConfirmPickupStore = {
  pendingResult: RideConfirmPickupResult | null;
  setPendingResult: (result: RideConfirmPickupResult) => void;
  consumePendingResult: () => RideConfirmPickupResult | null;
};

export const useRideConfirmPickupStore = create<RideConfirmPickupStore>((set, get) => ({
  pendingResult: null,
  setPendingResult: (result) => set({ pendingResult: result }),
  consumePendingResult: () => {
    const result = get().pendingResult;
    if (result) set({ pendingResult: null });
    return result;
  },
}));
