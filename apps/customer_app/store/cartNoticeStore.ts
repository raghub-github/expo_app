import { create } from "zustand";

type CartNoticeState = {
  removedCount: number;
  visible: boolean;
  showRemovedItems: (count: number) => void;
  dismiss: () => void;
};

export const useCartNoticeStore = create<CartNoticeState>((set) => ({
  removedCount: 0,
  visible: false,
  showRemovedItems: (count) =>
    set({
      removedCount: Math.max(1, Math.round(count)),
      visible: true,
    }),
  dismiss: () => set({ visible: false }),
}));
