import { create } from "zustand";
import { useMerchantLoadingMessageStore } from "@/lib/merchantMenuLoadingMessages";

type MealsUnderPriceNavTransitionState = {
  active: boolean;
  loadingMessageIndex: number;
  show: () => void;
  hide: () => void;
};

/** Instant skeleton shutter while meals-under-price route mounts. */
export const useMealsUnderPriceNavTransitionStore = create<MealsUnderPriceNavTransitionState>((set) => ({
  active: false,
  loadingMessageIndex: 0,
  show: () => {
    const loadingMessageIndex =
      useMerchantLoadingMessageStore.getState().pickStartIndex("meals-under-price");
    set({ active: true, loadingMessageIndex });
  },
  hide: () => set({ active: false, loadingMessageIndex: 0 }),
}));
