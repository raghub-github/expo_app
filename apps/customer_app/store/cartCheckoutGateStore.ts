import { create } from "zustand";

type CartCheckoutGateState = {
  outsideRangeVisible: boolean;
  addressSheetVisible: boolean;
  show: () => void;
  hide: () => void;
  openAddressSheet: () => void;
  closeAddressSheet: () => void;
};

export const useCartCheckoutGateStore = create<CartCheckoutGateState>((set) => ({
  outsideRangeVisible: false,
  addressSheetVisible: false,
  show: () => set({ outsideRangeVisible: true }),
  hide: () => set({ outsideRangeVisible: false, addressSheetVisible: false }),
  openAddressSheet: () => set({ addressSheetVisible: true }),
  closeAddressSheet: () => set({ addressSheetVisible: false }),
}));
