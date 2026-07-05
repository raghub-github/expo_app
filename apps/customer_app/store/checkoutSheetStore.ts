import { create } from "zustand";

type CheckoutSheetState = {
  visible: boolean;
  show: () => void;
  hide: () => void;
};

export const useCheckoutSheetStore = create<CheckoutSheetState>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));
