import { create } from "zustand";

/**
 * Instant cart chrome (Continue dock) — updated on pressIn *before* the Zustand
 * cart write is flushed. Show and hide both paint from this flash so the dock
 * never waits on the deferred cart write.
 */
type CartChromeState = {
  flashMerchantId: string | null;
  /** Optimistic total item count for the dock (0 = hide immediately). */
  flashCount: number;
  /** True until real cart total catches up to flashCount. */
  flashPending: boolean;
  /** Apply a delta to the optimistic dock count (seeds from `fromTotal` when idle). */
  flashAdd: (merchantId: string, delta?: number, fromTotal?: number) => void;
  /** Set absolute optimistic dock count. */
  flashSet: (merchantId: string, count: number) => void;
  clearFlash: () => void;
};

export const useCartChromeStore = create<CartChromeState>((set, get) => ({
  flashMerchantId: null,
  flashCount: 0,
  flashPending: false,
  flashAdd: (merchantId, delta = 1, fromTotal) => {
    const cur = get();
    const same = cur.flashPending && cur.flashMerchantId === merchantId;
    const base = same ? cur.flashCount : Math.max(0, fromTotal ?? cur.flashCount);
    set({
      flashMerchantId: merchantId,
      flashCount: Math.max(0, base + delta),
      flashPending: true,
    });
  },
  flashSet: (merchantId, count) => {
    set({
      flashMerchantId: merchantId,
      flashCount: Math.max(0, count),
      flashPending: true,
    });
  },
  clearFlash: () =>
    set({ flashMerchantId: null, flashCount: 0, flashPending: false }),
}));
