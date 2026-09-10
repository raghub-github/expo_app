import { create } from "zustand";

export type FloatingDockKind = "cart" | "track" | null;
/** Who owns the bottom footing — the other collapses to an edge peek. */
export type FloatingFootingOwner = "nav" | "dock";

/**
 * Coordinates bottom footing vs edge peeks:
 * - Cart/track live → nav auto-collapses to left HOME edge; dock owns footing.
 * - User expands nav → dock collapses to right CART/TRACK edge.
 */
type FloatingDockUiState = {
  dockVisible: boolean;
  dockKind: FloatingDockKind;
  footingOwner: FloatingFootingOwner;
  /** User tapped HOME edge — keep nav footing until dock dismissed or CART/TRACK tapped. */
  navExpandedByUser: boolean;
  /** Bottom offset of the cart/track bar — edge peeks align to the same row. */
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
  navExpandedByUser: false,
  dockBottom: 24,
  setDockVisible: (dockVisible, kind = null) =>
    set((prev) => {
      if (!dockVisible) {
        return {
          dockVisible: false,
          dockKind: null,
          footingOwner: "nav",
          navExpandedByUser: false,
        };
      }
      const becameVisible = !prev.dockVisible;
      const dockKind = kind ?? prev.dockKind ?? "cart";
      // Fresh cart/track → always HOME edge. Respect user expand within same session.
      if (becameVisible) {
        return {
          dockVisible: true,
          dockKind,
          footingOwner: "dock",
          navExpandedByUser: false,
        };
      }
      return {
        dockVisible: true,
        dockKind,
        footingOwner: prev.navExpandedByUser ? "nav" : "dock",
        navExpandedByUser: prev.navExpandedByUser,
      };
    }),
  setDockBottom: (bottom) =>
    set((prev) => (prev.dockBottom === bottom ? prev : { dockBottom: bottom })),
  expandNav: () => set({ footingOwner: "nav", navExpandedByUser: true }),
  expandDock: () => set({ footingOwner: "dock", navExpandedByUser: false }),
}));
