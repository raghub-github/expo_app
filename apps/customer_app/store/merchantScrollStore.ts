/**
 * Scroll position on merchant (restaurant) detail page.
 * Used by GlobalFloatingCart for compact mode when user has scrolled down.
 */
import { create } from "zustand";

const COMPACT_THRESHOLD = 80;

interface MerchantScrollState {
  scrollY: number;
  setScrollY: (y: number) => void;
  isCompact: () => boolean;
}

export const useMerchantScrollStore = create<MerchantScrollState>((set, get) => ({
  scrollY: 0,
  setScrollY: (y: number) => set({ scrollY: y }),
  isCompact: () => get().scrollY > COMPACT_THRESHOLD,
}));
