/**
 * Scroll position on merchant (restaurant) detail page.
 * Used by GlobalFloatingCart for compact mode and revisit scroll restore.
 */
import { create } from "zustand";

const COMPACT_THRESHOLD = 80;

interface MerchantScrollState {
  scrollY: number;
  offsetsByStoreId: Record<string, number>;
  setScrollY: (y: number) => void;
  setStoreScrollOffset: (storeId: string, y: number) => void;
  getStoreScrollOffset: (storeId: string) => number;
  isCompact: () => boolean;
}

export const useMerchantScrollStore = create<MerchantScrollState>((set, get) => ({
  scrollY: 0,
  offsetsByStoreId: {},
  setScrollY: (y: number) => set({ scrollY: y }),
  setStoreScrollOffset: (storeId: string, y: number) =>
    set((state) => ({
      scrollY: y,
      offsetsByStoreId: { ...state.offsetsByStoreId, [storeId]: y },
    })),
  getStoreScrollOffset: (storeId: string) => get().offsetsByStoreId[storeId] ?? 0,
  isCompact: () => get().scrollY > COMPACT_THRESHOLD,
}));
