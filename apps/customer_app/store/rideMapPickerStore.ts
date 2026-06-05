import { create } from "zustand";

export type RideMapPickerField = "pickup" | "drop" | "stop";

export type RideMapPickerResult = {
  field: RideMapPickerField;
  stopIndex?: number;
  primary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
};

type RideMapPickerStore = {
  pendingResult: RideMapPickerResult | null;
  setPendingResult: (result: RideMapPickerResult) => void;
  consumePendingResult: () => RideMapPickerResult | null;
};

export const useRideMapPickerStore = create<RideMapPickerStore>((set, get) => ({
  pendingResult: null,
  setPendingResult: (result) => set({ pendingResult: result }),
  consumePendingResult: () => {
    const result = get().pendingResult;
    if (result) set({ pendingResult: null });
    return result;
  },
}));
