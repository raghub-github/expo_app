import { create } from "zustand";
import { useMerchantLoadingMessageStore } from "@/lib/merchantMenuLoadingMessages";

type MerchantNavTransitionState = {
  active: boolean;
  merchantId: string | null;
  /** Message index chosen once per navigation — shared by shutter + page overlay. */
  loadingMessageIndex: number;
  show: (merchantId: string) => void;
  hide: () => void;
};

/** Instant merchant-page skeleton shutter while stack route mounts (Zomato-style). */
export const useMerchantNavTransitionStore = create<MerchantNavTransitionState>((set) => ({
  active: false,
  merchantId: null,
  loadingMessageIndex: 0,
  show: (merchantId) => {
    const loadingMessageIndex =
      useMerchantLoadingMessageStore.getState().pickStartIndex(merchantId);
    set({ active: true, merchantId, loadingMessageIndex });
  },
  hide: () => set({ active: false, merchantId: null, loadingMessageIndex: 0 }),
}));
