import { create } from "zustand";
import { useMerchantLoadingMessageStore } from "@/lib/merchantMenuLoadingMessages";

type MerchantNavTransitionState = {
  active: boolean;
  merchantId: string | null;
  /** Message index chosen once per navigation — shared by shutter + page overlay. */
  loadingMessageIndex: number;
  /** Monotonic token: every committed merchant entry gets a new visit. */
  visitId: number;
  /** Last visit consumed by the destination page. Prevents stale index reuse. */
  consumedVisitId: number;
  /** Wall-clock when show() ran — page waits for slide-in before hide. */
  shownAt: number;
  show: (merchantId: string) => void;
  hide: () => void;
  consumeLoadingMessageIndex: (merchantId: string) => number;
};

/** Instant merchant-page skeleton shutter while stack route mounts (Zomato-style). */
export const useMerchantNavTransitionStore = create<MerchantNavTransitionState>((set, get) => ({
  active: false,
  merchantId: null,
  loadingMessageIndex: 0,
  visitId: 0,
  consumedVisitId: 0,
  shownAt: 0,
  show: (merchantId) => {
    const loadingMessageIndex = useMerchantLoadingMessageStore.getState().pickStartIndex(merchantId);
    set({
      active: true,
      merchantId,
      loadingMessageIndex,
      visitId: get().visitId + 1,
      shownAt: Date.now(),
    });
  },
  // Keep merchantId + loadingMessageIndex for the destination page skeleton.
  hide: () => set({ active: false }),
  consumeLoadingMessageIndex: (merchantId) => {
    const state = get();
    const hasFreshNavVisit =
      state.merchantId === merchantId &&
      state.visitId > 0 &&
      state.visitId !== state.consumedVisitId;

    if (hasFreshNavVisit) {
      set({ consumedVisitId: state.visitId });
      return state.loadingMessageIndex;
    }

    // Direct route or same-store revisit: always advance to a fresh sentence.
    return useMerchantLoadingMessageStore.getState().pickStartIndex(merchantId);
  },
}));
