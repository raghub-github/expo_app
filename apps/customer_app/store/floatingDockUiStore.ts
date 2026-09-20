import { create } from "zustand";

export type FloatingDockKind = "cart" | "track" | null;
/** Who owns the bottom footing — the other collapses to an edge peek. */
export type FloatingFootingOwner = "nav" | "dock";

/**
 * Coordinates cart/track dock visibility with the tab bar.
 * Full tab bar always stays visible — cart/track float above it (no HOME/CART edge peeks).
 */
export type FloatingDockUiState = {
  dockVisible: boolean;
  dockKind: FloatingDockKind;
  /** @deprecated Edge peeks removed — always "nav". Kept for older subscribers. */
  footingOwner: FloatingFootingOwner;
  navExpandedByUser: boolean;
  dockBottom: number;
  setDockVisible: (dockVisible: boolean, kind?: FloatingDockKind) => void;
  setDockBottom: (bottom: number) => void;
  expandNav: () => void;
  expandDock: () => void;
};

export const useFloatingDockUiStore = create<FloatingDockUiState>((set) => ({
  dockVisible: false,
  dockKind: null,
  footingOwner: "nav",
  navExpandedByUser: true,
  dockBottom: 24,
  setDockVisible: (dockVisible, kind = null) =>
    set((prev) => {
      if (!dockVisible) {
        return {
          dockVisible: false,
          dockKind: null,
          footingOwner: "nav",
          navExpandedByUser: true,
        };
      }
      return {
        dockVisible: true,
        dockKind: kind ?? prev.dockKind ?? "cart",
        footingOwner: "nav",
        navExpandedByUser: true,
      };
    }),
  setDockBottom: (bottom) =>
    set((prev) => (prev.dockBottom === bottom ? prev : { dockBottom: bottom })),
  expandNav: () => set({ footingOwner: "nav", navExpandedByUser: true }),
  expandDock: () => set({ footingOwner: "nav", navExpandedByUser: true }),
}));
