import { create } from "zustand";
import { useMerchantLoadingMessageStore } from "@/lib/merchantMenuLoadingMessages";

type MerchantNavTransitionState = {
  active: boolean;
  merchantId: string | null;
  /** Message index chosen once per navigation — shared by shutter + page overlay. */
  loadingMessageIndex: number;
  /** Wall-clock when show() ran — page waits for slide-in before hide. */
  shownAt: number;
  show: (merchantId: string) => void;
  hide: () => void;
};

/** Instant merchant-page skeleton shutter while stack route mounts (Zomato-style). */
export const useMerchantNavTransitionStore = create<MerchantNavTransitionState>((set) => ({
  active: false,
  merchantId: null,
  loadingMessageIndex: 0,
  shownAt: 0,
  show: (merchantId) => {
    const loadingMessageIndex = useMerchantLoadingMessageStore.getState().pickStartIndex(merchantId);
    set({ active: true, merchantId, loadingMessageIndex, shownAt: Date.now() });
  },
  // Keep merchantId + loadingMessageIndex for the destination page skeleton.
  hide: () => set({ active: false }),
}));
